import OzonAccounts from "#services/Account";
import DraftApi from "../../api/draft.js";

class BookingService {
  async getApi(account) {
    const creds = await OzonAccounts.getById({ id: account });
    if (creds?.status === 404 || creds?.status === 500) {
      throw new Error(`Кабинет Ozon ${account} не найден`);
    }
    return new DraftApi(creds.id, creds.client_id, creds.apikey);
  }

  async getTimeslots({
    account,
    draft_id,
    macrolocal_cluster_id,
    storage_warehouse_id,
    date_from,
    date_to,
  }) {
    const api = await this.getApi(account);
    const { data } = await api.timeslotInfo({
      draft_id: Number(draft_id),
      supply_type: "DIRECT",
      date_from,
      date_to,
      selected_cluster_warehouses: [
        {
          macrolocal_cluster_id: Number(macrolocal_cluster_id),
          storage_warehouse_id: Number(storage_warehouse_id),
        },
      ],
    });
    return data;
  }

  selectFirstAvailableTimeslot(timeslotResult) {
    const days = timeslotResult?.drop_off_warehouse_timeslots?.days || [];
    for (const day of days) {
      const slots = day.timeslots || [];
      if (slots.length) {
        return slots[0];
      }
    }
    return null;
  }
}

export default new BookingService();
