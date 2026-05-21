import { Op } from "sequelize";
import OnecSupplySchema from "#models/onec_supply";
import OzonAccounts from "#services/Account";
import DraftApi from "../../api/draft.js";

const { OzonQueueModel } = OnecSupplySchema;

class DraftService {
  async getApi(account) {
    const creds = await OzonAccounts.getById({ id: account });
    if (creds?.status === 404 || creds?.status === 500) {
      throw new Error(`Кабинет Ozon ${account} не найден`);
    }
    return new DraftApi(creds.id, creds.client_id, creds.apikey);
  }

  async createDraftForRow(row) {
    const api = await this.getApi(row.account);
    const items = (row.items || []).map((i) => ({
      sku: Number(i.sku),
      quantity: Number(i.quantity),
    }));
    if (!items.length) {
      throw new Error("items пустой");
    }
    if (!row.macrolocal_cluster_id) {
      throw new Error("macrolocal_cluster_id не указан");
    }

    const { data } = await api.directCreate({
      cluster_info: {
        items,
        macrolocal_cluster_id: Number(row.macrolocal_cluster_id),
      },
      deletion_sku_mode: "PARTIAL",
    });

    if (data.errors?.length) {
      throw new Error(JSON.stringify(data.errors));
    }

    await row.update({
      draft_id: data.draft_id,
      is_error: false,
      error_text: null,
    });
    return data.draft_id;
  }

  async createDrafts() {
    const rows = await OzonQueueModel.findAll({
      where: {
        draft_id: { [Op.is]: null },
        is_error: false,
      },
    });

    const results = [];
    for (const row of rows) {
      try {
        const draft_id = await this.createDraftForRow(row);
        results.push({
          doc_number: row.doc_number,
          account: row.account,
          draft_id,
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

  async getDraftInfo(account, draft_id) {
    const api = await this.getApi(account);
    const { data } = await api.createInfo(Number(draft_id));
    return data;
  }

  selectBestWarehouse(clusters) {
    const all = (clusters || []).flatMap((c) =>
      (c.warehouses || []).map((w) => ({
        macrolocal_cluster_id: c.macrolocal_cluster_id,
        storage_warehouse_id: w.storage_warehouse?.warehouse_id,
        bundle_id: w.bundle_id,
        total_rank: w.total_rank ?? Number.MAX_SAFE_INTEGER,
        total_score: w.total_score ?? 0,
        is_available: w.availability_status?.state === "AVAILABLE",
      }))
    );

    const available = all.filter(
      (w) => w.is_available && w.storage_warehouse_id
    );
    if (!available.length) return null;

    available.sort((a, b) => {
      if (a.total_rank !== b.total_rank) return a.total_rank - b.total_rank;
      return b.total_score - a.total_score;
    });
    return available[0];
  }
}

export default new DraftService();
