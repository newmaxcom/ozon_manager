import ApiAxios from "#utils/apiAxios";

export default class DraftApi extends ApiAxios {
  constructor(id, client_id, apikey, config = {}) {
    super(id, client_id, apikey, {
      baseURL: "https://api-seller.ozon.ru",
      maxRetries: 5,
      baseDelay: 2000,
      ...config,
    });
    this.accountId = id;
  }

  async directCreate(params) {
    const response = await this.post("/v1/draft/direct/create", params);
    return { accountId: this.accountId, data: response.data };
  }

  async createInfo(draft_id) {
    const response = await this.post("/v2/draft/create/info", { draft_id });
    return { accountId: this.accountId, data: response.data };
  }

  async timeslotInfo(params) {
    const response = await this.post("/v2/draft/timeslot/info", params);
    return { accountId: this.accountId, data: response.data };
  }

  async supplyCreate(params) {
    const response = await this.post("/v2/draft/supply/create", params);
    return { accountId: this.accountId, data: response.data };
  }

  async supplyCreateStatus(draft_id) {
    const response = await this.post("/v2/draft/supply/create/status", {
      draft_id,
    });
    return { accountId: this.accountId, data: response.data };
  }
}
