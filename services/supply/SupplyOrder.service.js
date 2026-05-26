import { Op } from "sequelize";
import OnecSupplySchema from "#models/onec_supply";
import OzonSupplySchema from "#models/ozon_supply";
import OzonAccounts from "#services/Account";
import DraftApi from "../../api/draft.js";
import SupplyOrderApi from "../../api/supplyOrder.js";
import { triggerSupplyStatusRefresh } from "../../api/ozonParser.js";
import DraftService from "./Draft.service.js";
import BookingService from "./Booking.service.js";

const { OzonQueueModel } = OnecSupplySchema;
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

      slot = BookingService.selectFirstAvailableTimeslot(timeslots.result);
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
      return json;
    });
  }
}

export default new SupplyOrderService();
