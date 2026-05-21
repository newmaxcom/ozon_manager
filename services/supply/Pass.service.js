import OnecSupplySchema from "#models/onec_supply";
import OzonAccounts from "#services/Account";
import PassApi from "../../api/pass.js";

const { OzonQueueModel } = OnecSupplySchema;

const POLL_INTERVAL = 2000;
const POLL_MAX = 30;

class PassService {
  async getApi(account) {
    const creds = await OzonAccounts.getById({ id: account });
    if (creds?.status === 404 || creds?.status === 500) {
      throw new Error(`Кабинет Ozon ${account} не найден`);
    }
    return new PassApi(creds.id, creds.client_id, creds.apikey);
  }

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async setPass({ doc_number, account, supply_order_id, vehicle }) {
    let order_id = supply_order_id;
    if (!order_id && doc_number && account) {
      const row = await OzonQueueModel.findOne({
        where: { doc_number, account },
      });
      if (!row?.order_id) throw new Error("order_id не найден для doc_number");
      order_id = row.order_id;
    }
    if (!order_id) throw new Error("supply_order_id обязателен");

    if (
      !vehicle?.driver_name ||
      !vehicle?.driver_phone ||
      !vehicle?.vehicle_model ||
      !vehicle?.vehicle_number
    ) {
      throw new Error(
        "vehicle: driver_name, driver_phone, vehicle_model, vehicle_number обязательны"
      );
    }

    const api = await this.getApi(account);
    const { data: created } = await api.passCreate(Number(order_id), vehicle);
    if (created.error_reasons?.length) {
      throw new Error(JSON.stringify(created.error_reasons));
    }
    const opId = created.operation_id;
    if (!opId) {
      throw new Error("pass/create без operation_id");
    }

    let final = null;
    let lastStatus = null;
    for (let i = 0; i < POLL_MAX; i++) {
      const { data: status } = await api.passStatus(opId);
      lastStatus = status;
      if (status.result === "SUCCESS" || status.result === "OK") {
        final = status;
        break;
      }
      if (status.result === "FAILED" || status.errors?.length) {
        throw new Error(`pass/status FAILED: ${JSON.stringify(status.errors)}`);
      }
      await this.delay(POLL_INTERVAL);
    }
    if (!final) {
      throw new Error(`pass/status timeout, last: ${JSON.stringify(lastStatus)}`);
    }
    return { order_id, ...final };
  }
}

export default new PassService();
