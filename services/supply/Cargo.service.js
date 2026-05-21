import { Op } from "sequelize";
import OnecSupplySchema from "#models/onec_supply";
import OzonAccounts from "#services/Account";
import CargoApi from "../../api/cargo.js";

const { OzonQueueModel, OzonBoxesModel } = OnecSupplySchema;

const POLL_INTERVAL = 3000;
const POLL_MAX = 40;

class CargoService {
  async getApi(account) {
    const creds = await OzonAccounts.getById({ id: account });
    if (creds?.status === 404 || creds?.status === 500) {
      throw new Error(`Кабинет Ozon ${account} не найден`);
    }
    return new CargoApi(creds.id, creds.client_id, creds.apikey);
  }

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async createCargoesForOrder(row) {
    if (!row.order_id) throw new Error("order_id отсутствует");

    const boxes = await OzonBoxesModel.findAll({
      where: {
        order_id: row.order_id,
        cargo_id: { [Op.is]: null },
      },
      order: [["box_index", "ASC"]],
    });
    if (!boxes.length) return { skipped: "no boxes pending" };

    const api = await this.getApi(row.account);

    const cargoes = boxes.map((b, idx) => ({
      key: b.box_key || `${row.order_id}-${b.box_index ?? idx + 1}`,
      value: {
        type: b.cargo_type || "BOX",
        items: (b.items || []).map((i) => ({
          barcode: i.barcode,
          expires_at: i.expires_at,
          offer_id: i.offer_id,
          quant: i.quant,
          quantity: Number(i.quantity),
        })),
      },
    }));

    const { data: created } = await api.cargoesCreate({
      cargoes,
      supply_id: Number(row.order_id),
      delete_current_version: false,
    });

    const opId = created.operation_id;
    if (!opId) {
      throw new Error(`cargoes/create без operation_id: ${JSON.stringify(created.errors)}`);
    }

    let resultCargoes = null;
    let lastStatus = null;
    for (let i = 0; i < POLL_MAX; i++) {
      const { data: info } = await api.cargoesCreateInfo(opId);
      lastStatus = info;
      if (info.status === "SUCCESS" || info.status === "OK") {
        resultCargoes = info.result?.cargoes || [];
        break;
      }
      if (info.status === "FAILED") {
        throw new Error(`cargoes/create FAILED: ${JSON.stringify(info.errors)}`);
      }
      await this.delay(POLL_INTERVAL);
    }
    if (!resultCargoes) {
      throw new Error(
        `cargoes/create timeout, last: ${JSON.stringify(lastStatus)}`
      );
    }

    const keyToCargoId = new Map(
      resultCargoes.map((c) => [c.key, c.value?.cargo_id])
    );

    const updated = [];
    for (const b of boxes) {
      const key = b.box_key || `${row.order_id}-${b.box_index}`;
      const cargo_id = keyToCargoId.get(key);
      if (cargo_id) {
        await b.update({ cargo_id, box_key: key, ozon_status: "CREATED" });
        updated.push({ box_index: b.box_index, cargo_id });
      }
    }
    return { cargoes: updated };
  }

  async createCargoes() {
    const rows = await OzonQueueModel.findAll({
      where: {
        order_id: { [Op.not]: null },
        is_error: false,
      },
    });
    const results = [];
    for (const row of rows) {
      try {
        const r = await this.createCargoesForOrder(row);
        results.push({
          doc_number: row.doc_number,
          order_id: String(row.order_id),
          ok: true,
          ...r,
        });
      } catch (error) {
        const msg = error.message || String(error);
        results.push({
          doc_number: row.doc_number,
          order_id: String(row.order_id),
          ok: false,
          error: msg,
        });
      }
    }
    return results;
  }

  async createLabelsForOrder(row) {
    if (!row.order_id) throw new Error("order_id отсутствует");
    const boxes = await OzonBoxesModel.findAll({
      where: {
        order_id: row.order_id,
        cargo_id: { [Op.not]: null },
        label_file_guid: { [Op.is]: null },
      },
    });
    if (!boxes.length) return { skipped: "no cargoes pending label" };

    const api = await this.getApi(row.account);
    const { data: created } = await api.labelCreate({
      supply_id: Number(row.order_id),
      cargoes: boxes.map((b) => ({ cargo_id: Number(b.cargo_id) })),
    });

    const opId = created.operation_id;
    if (!opId) {
      throw new Error(
        `cargoes-label/create без operation_id: ${JSON.stringify(created.errors)}`
      );
    }

    let fileGuid = null;
    let lastStatus = null;
    for (let i = 0; i < POLL_MAX; i++) {
      const { data: info } = await api.labelGet(opId);
      lastStatus = info;
      if (info.status === "SUCCESS" || info.status === "OK") {
        fileGuid = info.result?.file_guid;
        break;
      }
      if (info.status === "FAILED") {
        throw new Error(`label/get FAILED: ${JSON.stringify(info.errors)}`);
      }
      await this.delay(POLL_INTERVAL);
    }
    if (!fileGuid) {
      throw new Error(`label/get timeout, last: ${JSON.stringify(lastStatus)}`);
    }

    for (const b of boxes) {
      await b.update({ label_file_guid: fileGuid });
    }
    return { file_guid: fileGuid };
  }

  async createLabels() {
    const rows = await OzonQueueModel.findAll({
      where: { order_id: { [Op.not]: null } },
    });
    const results = [];
    for (const row of rows) {
      try {
        const r = await this.createLabelsForOrder(row);
        results.push({ doc_number: row.doc_number, ok: true, ...r });
      } catch (error) {
        results.push({
          doc_number: row.doc_number,
          ok: false,
          error: error.message || String(error),
        });
      }
    }
    return results;
  }

  async fetchLabelFile(account, file_guid) {
    const api = await this.getApi(account);
    const { data } = await api.labelFile(file_guid);
    return data;
  }
}

export default new CargoService();
