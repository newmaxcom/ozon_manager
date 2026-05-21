import { Op } from "sequelize";
import OnecSupplySchema from "#models/onec_supply";
import OzonAccounts from "#services/Account";
import DraftApi from "../../api/draft.js";
import SupplyOrderApi from "../../api/supplyOrder.js";
import DraftService from "./Draft.service.js";
import BookingService from "./Booking.service.js";

const { OzonQueueModel } = OnecSupplySchema;

const STATUS_POLL_INTERVAL = 3000;
const STATUS_POLL_MAX = 40;

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

  async createSupplyForRow(row, { dateFrom, dateTo } = {}) {
    if (!row.draft_id) throw new Error("draft_id отсутствует");

    const info = await DraftService.getDraftInfo(row.account, row.draft_id);
    const target =
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

    const slot = BookingService.selectFirstAvailableTimeslot(timeslots.result);
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

    if (created.error_reasons?.length) {
      throw new Error(JSON.stringify(created.error_reasons));
    }

    let orderId = null;
    let lastStatus = null;
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
        throw new Error(
          `supplyCreate FAILED: ${JSON.stringify(status.error_reasons)}`
        );
      }
      await this.delay(STATUS_POLL_INTERVAL);
    }
    if (!orderId) {
      throw new Error(
        `supplyCreate timeout, last status: ${JSON.stringify(lastStatus)}`
      );
    }

    await row.update({
      order_id: orderId,
      storage_warehouse_id: target.storage_warehouse_id,
      macrolocal_cluster_id: target.macrolocal_cluster_id,
      bundle_id: target.bundle_id || row.bundle_id,
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

  async refreshStatus(row) {
    if (!row.order_id) return null;
    const api = await this.getOrderApi(row.account);
    const { data } = await api.details(Number(row.order_id));
    await row.update({ state: data.state });
    return data;
  }

  async refreshStatuses() {
    const rows = await OzonQueueModel.findAll({
      where: { order_id: { [Op.not]: null } },
    });
    const out = [];
    for (const row of rows) {
      try {
        const data = await this.refreshStatus(row);
        out.push({ doc_number: row.doc_number, state: data?.state, ok: true });
      } catch (error) {
        out.push({
          doc_number: row.doc_number,
          ok: false,
          error: error.message || String(error),
        });
      }
    }
    return out;
  }
}

export default new SupplyOrderService();
