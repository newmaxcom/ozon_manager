import ApiAxios from "#utils/apiAxios";

export default class PassApi extends ApiAxios {
  constructor(id, client_id, apikey, config = {}) {
    super(id, client_id, apikey, {
      baseURL: "https://api-seller.ozon.ru",
      maxRetries: 5,
      baseDelay: 2000,
      ...config,
    });
    this.accountId = id;
  }

  async passCreate(supply_order_id, vehicle) {
    const response = await this.post("/v1/supply-order/pass/create", {
      supply_order_id,
      vehicle,
    });
    return { accountId: this.accountId, data: response.data };
  }

  async passStatus(operation_id) {
    const response = await this.post("/v1/supply-order/pass/status", {
      operation_id,
    });
    return { accountId: this.accountId, data: response.data };
  }
}
