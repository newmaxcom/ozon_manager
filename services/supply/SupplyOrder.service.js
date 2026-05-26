import { Op } from "sequelize";
import OnecSupplySchema from "#models/onec_supply";
import OzonSupplySchema from "#models/ozon_supply";
import OzonAccounts from "#services/Account";
import DraftApi from "../../api/draft.js";
import SupplyOrderApi from "../../api/supplyOrder.js";
import { triggerSupplyStatusRefresh } from "../../api/ozonParser.js";
import DraftService from "./Draft.service.js";
import BookingService from "./Booking.service.js";

const { OzonQueueModel, OzonBoxesModel } = OnecSupplySchema;
const { StatusModel } = OzonSupplySchema;

const STATUS_POLL_INTERVAL = 3000;
const STATUS_POLL_MAX = 40;

// Ошибки, означающие что черновик протух (TTL 30 мин) или невалиден.
// При них createSupplyForRow один раз пересоздаёт draft и пробует снова.
const DRAFT_EXPIRED_REASONS = new Set([
  "DRAFT_DOES_NOT_EXIST",
  "DRAFT_INCORRECT_STATE",
]);

function isDraftExpiredError(reasons) {
  if (!Array.isArray(reasons) || !reasons.length) return false;
  return reasons.some((r) => DRAFT_EXPIRED_REASONS.has(r));
}

class SupplyOrderService {
  async getDraftApi(account) {
    const creds = await OzonAccounts.getById({ id: account });
    if (creds?.status === 404 || creds?.status === 500) {
      throw new Error(`Кабинет Ozon ${account} не найден`);
    }
    return new DraftApi(creds.id, creds.client_id, creds.apikey);
  }

  async getOrderApi(account) {
    const creds = await OzonAccounts.getById({ id: account });
    if (creds?.status === 404 || creds?.status === 500) {
      throw new Error(`Кабинет Ozon ${account} не найден`);
    }
    return new SupplyOrderApi(creds.id, creds.client_id, creds.apikey);
  }

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Пересоздаёт черновик: затирает draft_id и зовёт DraftService.createDraftForRow.
  async recreateDraft(row) {
    console.warn(
      `[supply] draft ${row.draft_id} expired/invalid, recreating for ${row.doc_number}/${row.account}`
    );
    await row.update({ draft_id: null });
    await DraftService.createDraftForRow(row);
    await row.reload();
    if (!row.draft_id) {
      throw new Error("recreate draft failed: draft_id всё ещё null");
    }
  }

  async createSupplyForRow(row, { dateFrom, dateTo } = {}) {
    if (!row.draft_id) throw new Error("draft_id отсутствует");

    // До 2 попыток: при DRAFT_DOES_NOT_EXIST/DRAFT_INCORRECT_STATE пересоздаём
    // черновик (30-минутный TTL) и пробуем снова.
    let attempt = 0;
    let orderId = null;
    let target;
    let slot;

    while (attempt < 2 && !orderId) {
      attempt++;

      let info;
      try {
        info = await DraftService.getDraftInfo(row.account, row.draft_id);
      } catch (error) {
        if (attempt < 2 && /404|not.?found/i.test(String(error.message))) {
          await this.recreateDraft(row);
          continue;
        }
        throw error;
      }

      if (info?.status && info.status !== "SUCCESS" && info.status !== "IN_PROGRESS") {
        if (attempt < 2) {
          await this.recreateDraft(row);
          continue;
        }
        throw new Error(`draft/create/info status: ${info.status}`);
      }

      target =
        row.storage_warehouse_id && row.macrolocal_cluster_id
          ? {
              macrolocal_cluster_id: Number(row.macrolocal_cluster_id),
              storage_warehouse_id: Number(row.storage_warehouse_id),
              bundle_id: row.bundle_id,
            }
          : DraftService.selectBestWarehouse(info.clusters);

      if (!target) throw new Error("Нет доступных складов в черновике");

      const today = new Date();
      const fmt = (d) => d.toISOString().slice(0, 10);
      const df = dateFrom || fmt(today);
      const dt =
        dateTo ||
        fmt(new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000));

      const timeslots = await BookingService.getTimeslots({
        account: row.account,
        draft_id: row.draft_id,
        macrolocal_cluster_id: target.macrolocal_cluster_id,
        storage_warehouse_id: target.storage_warehouse_id,
        date_from: df,
        date_to: dt,
      });

      // Если пользователь выбрал слот заранее через /supply/select.slot,
      // используем его. Иначе — первый доступный.
      slot =
        row.timeslot_from && row.timeslot_to
          ? {
              from_in_timezone: row.timeslot_from,
              to_in_timezone: row.timeslot_to,
            }
          : BookingService.selectFirstAvailableTimeslot(timeslots.result);
      if (!slot) throw new Error("Нет доступных таймслотов в выбранном окне");

      const draftApi = await this.getDraftApi(row.account);
      const { data: created } = await draftApi.supplyCreate({
        draft_id: Number(row.draft_id),
        supply_type: "DIRECT",
        selected_cluster_warehouses: [
          {
            macrolocal_cluster_id: target.macrolocal_cluster_id,
            storage_warehouse_id: target.storage_warehouse_id,
          },
        ],
        timeslot: {
          from_in_timezone: slot.from_in_timezone || slot.from,
          to_in_timezone: slot.to_in_timezone || slot.to,
        },
      });

      if (isDraftExpiredError(created.error_reasons) && attempt < 2) {
        await this.recreateDraft(row);
        continue;
      }
      if (created.error_reasons?.length) {
        throw new Error(JSON.stringify(created.error_reasons));
      }

      let lastStatus = null;
      let needRecreate = false;
      for (let i = 0; i < STATUS_POLL_MAX; i++) {
        const { data: status } = await draftApi.supplyCreateStatus(
          Number(row.draft_id)
        );
        lastStatus = status;
        if (status.status === "SUCCESS" && status.order_id) {
          orderId = status.order_id;
          break;
        }
        if (status.status === "FAILED") {
          if (isDraftExpiredError(status.error_reasons) && attempt < 2) {
            needRecreate = true;
            break;
          }
          throw new Error(
            `supplyCreate FAILED: ${JSON.stringify(status.error_reasons)}`
          );
        }
        await this.delay(STATUS_POLL_INTERVAL);
      }
      if (needRecreate) {
        await this.recreateDraft(row);
        continue;
      }
      if (!orderId) {
        throw new Error(
          `supplyCreate timeout, last status: ${JSON.stringify(lastStatus)}`
        );
      }
    }

    const orderApi = await this.getOrderApi(row.account);
    const { data: details } = await orderApi.details(Number(orderId));
    const firstSupply = details?.supplies?.[0];
    if ((details?.supplies?.length || 0) > 1) {
      // Для DIRECT-пайплайна (`/v1/draft/direct/create`) всегда одна поставка
      // на заявку. Если внезапно пришло несколько — нужен multi-cluster
      // refactor (отдельная таблица queue_supplies). Пока — кричим в логи.
      console.warn(
        `[supply] order ${orderId} contains ${details.supplies.length} supplies — берём supplies[0].supply_id=${firstSupply?.supply_id}, остальные игнорируются`
      );
    }

    await row.update({
      order_id: orderId,
      order_number: details?.order_number || null,
      supply_id: firstSupply?.supply_id || null,
      data_filling_deadline_utc: details?.data_filling_deadline_utc || null,
      storage_warehouse_id:
        firstSupply?.storage_warehouse?.warehouse_id ||
        target.storage_warehouse_id,
      macrolocal_cluster_id:
        firstSupply?.macrolocal_cluster_id || target.macrolocal_cluster_id,
      bundle_id: target.bundle_id || row.bundle_id,
      state: details?.state || null,
      timeslot_from: slot.from_in_timezone || slot.from,
      timeslot_to: slot.to_in_timezone || slot.to,
      is_error: false,
      error_text: null,
    });
    return orderId;
  }

  async createSupplies(options = {}) {
    const rows = await OzonQueueModel.findAll({
      where: {
        draft_id: { [Op.not]: null },
        order_id: { [Op.is]: null },
        is_error: false,
      },
    });

    const results = [];
    for (const row of rows) {
      try {
        const order_id = await this.createSupplyForRow(row, options);
        results.push({
          doc_number: row.doc_number,
          account: row.account,
          order_id,
          ok: true,
        });
      } catch (error) {
        const msg = error.message || String(error);
        await row.update({ is_error: true, error_text: msg });
        results.push({
          doc_number: row.doc_number,
          account: row.account,
          ok: false,
          error: msg,
        });
      }
    }
    return results;
  }

  // Force refresh для одной строки — live API call в Ozon.
  // Использовать когда юзер ждать не хочет (cron парсера 1×/день в 03:10).
  async forceRefreshRow(row) {
    if (!row.order_id) return null;
    const api = await this.getOrderApi(row.account);
    const { data } = await api.details(Number(row.order_id));
    await row.update({ state: data.state });
    return data;
  }

  // Bulk refresh — триггерит ozon_parser, который обновит ozon_supply.supply_status
  // через /v3/supply-order/list + /v3/supply-order/get для всех кабинетов.
  async refreshStatuses() {
    const started = Date.now();
    try {
      await triggerSupplyStatusRefresh();
      return {
        ok: true,
        elapsed_ms: Date.now() - started,
        source: "ozon-parser",
      };
    } catch (error) {
      return {
        ok: false,
        elapsed_ms: Date.now() - started,
        error: error.message || String(error),
      };
    }
  }

  // Отмена заявки на поставку — /v1/supply-order/cancel + поллинг статуса.
  async cancelOrder(row) {
    if (!row.order_id) throw new Error("order_id отсутствует");
    const api = await this.getOrderApi(row.account);
    const { data: created } = await api.cancel(Number(row.order_id));
    const opId = created.operation_id;
    if (!opId) {
      throw new Error("cancel без operation_id");
    }
    let last = null;
    for (let i = 0; i < STATUS_POLL_MAX; i++) {
      const { data: status } = await api.cancelStatus(opId);
      last = status;
      const s = status.status || status.result;
      if (s === "SUCCESS" || s === "OK") {
        await row.update({ state: "CANCELLED" });
        return { ok: true, status };
      }
      if (s === "FAILED") {
        throw new Error(`cancel FAILED: ${JSON.stringify(status)}`);
      }
      await this.delay(STATUS_POLL_INTERVAL);
    }
    throw new Error(`cancel timeout, last: ${JSON.stringify(last)}`);
  }

  // Полный список поставок из ozon_supply.supply_status (наполняет
  // ozon_parser). LEFT JOIN с очередью по (account, order_number),
  // чтобы для своих документов подтянулись метаданные 1С.
  async getAllSupplyStatuses({ limit = 500 } = {}) {
    const statuses = await StatusModel.findAll({
      order: [["state_updated_date", "DESC"]],
      limit,
      raw: true,
    });
    if (!statuses.length) return [];

    const pairs = statuses.map((s) => ({
      account: s.company,
      order_number: s.supply_id,
    }));
    const queueRows = await OzonQueueModel.findAll({
      where: {
        [Op.or]: pairs.map((p) => ({
          account: p.account,
          order_number: p.order_number,
        })),
      },
      raw: true,
    });
    const queueByKey = new Map(
      queueRows.map((r) => [`${r.account}::${r.order_number}`, r])
    );

    return statuses.map((s) => {
      const q = queueByKey.get(`${s.company}::${s.supply_id}`) || null;
      return {
        account: s.company,
        order_number: s.supply_id,
        state: s.state,
        status: s.status,
        state_updated_date: s.state_updated_date,
        bundle_id: s.bundle_id,
        // Наши метаданные (если поставка в очереди 1С):
        in_queue: Boolean(q),
        doc_number: q?.doc_number || null,
        order_numbers: q?.order_numbers || null,
        onec_prefix: q?.onec_prefix || null,
        plan_date: q?.plan_date || null,
        items: q?.items || null,
        order_id: q?.order_id ? String(q.order_id) : null,
        supply_id: q?.supply_id ? String(q.supply_id) : null,
        is_error: q?.is_error || false,
        error_text: q?.error_text || null,
      };
    });
  }

  async getDashboardRows() {
    const rows = await OzonQueueModel.findAll({
      order: [["updated_at", "DESC"]],
      limit: 200,
    });

    const pairs = rows
      .filter((r) => r.account && r.order_number)
      .map((r) => ({ company: r.account, supply_id: String(r.order_number) }));
    if (!pairs.length) {
      return rows.map((r) => r.toJSON());
    }

    const statusRows = await StatusModel.findAll({
      where: {
        [Op.or]: pairs.map((p) => ({
          company: p.company,
          supply_id: p.supply_id,
        })),
      },
      raw: true,
    });
    const statusByKey = new Map(
      statusRows.map((s) => [`${s.company}::${s.supply_id}`, s])
    );

    // Counts по грузоместам для всех order_id одним запросом.
    const orderIds = rows
      .map((r) => r.order_id)
      .filter(Boolean)
      .map(Number);
    let boxCountsByOrder = new Map();
    if (orderIds.length) {
      const boxRows = await OzonBoxesModel.findAll({
        where: { order_id: { [Op.in]: orderIds } },
        raw: true,
      });
      for (const b of boxRows) {
        const key = String(b.order_id);
        const prev = boxCountsByOrder.get(key) || {
          total: 0,
          with_cargo: 0,
          with_label: 0,
          plan_qty: 0,
        };
        prev.total += 1;
        if (b.cargo_id) prev.with_cargo += 1;
        if (b.label_file_url || b.label_file_guid) prev.with_label += 1;
        prev.plan_qty += (b.items || []).reduce(
          (acc, it) => acc + (Number(it.quantity) || 0),
          0
        );
        boxCountsByOrder.set(key, prev);
      }
    }

    return rows.map((r) => {
      const json = r.toJSON();
      const key = `${r.account}::${r.order_number}`;
      const fromParser = statusByKey.get(key);
      if (fromParser) {
        json.state = fromParser.state || json.state;
        json.state_source = "parser";
        json.state_updated_date = fromParser.state_updated_date;
      } else {
        json.state_source = json.state ? "live" : null;
      }
      // Сумма quantity из items[] (план из 1С)
      json.items_plan_qty = (json.items || []).reduce(
        (acc, it) => acc + (Number(it.quantity) || 0),
        0
      );
      // Box-метрики
      json.boxes = json.order_id
        ? boxCountsByOrder.get(String(json.order_id)) || {
            total: 0,
            with_cargo: 0,
            with_label: 0,
            plan_qty: 0,
          }
        : { total: 0, with_cargo: 0, with_label: 0, plan_qty: 0 };
      return json;
    });
  }
}

export default new SupplyOrderService();
