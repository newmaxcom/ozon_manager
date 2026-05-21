import ApiAxios from "#utils/apiAxios";

export default class SupplyOrderApi extends ApiAxios {
  constructor(id, client_id, apikey, config = {}) {
    super(id, client_id, apikey, {
      baseURL: "https://api-seller.ozon.ru",
      maxRetries: 5,
      baseDelay: 2000,
      ...config,
    });
    this.accountId = id;
  }

  async details(order_id) {
    const response = await this.post("/v1/supply-order/details", { order_id });
    return { accountId: this.accountId, data: response.data };
  }

  async statusCounter() {
    const response = await this.post("/v1/supply-order/status/counter", {});
    return { accountId: this.accountId, data: response.data };
  }

  async cancel(order_id) {
    const response = await this.post("/v1/supply-order/cancel", { order_id });
    return { accountId: this.accountId, data: response.data };
  }

  async cancelStatus(operation_id) {
    const response = await this.post("/v1/supply-order/cancel/status", {
      operation_id,
    });
    return { accountId: this.accountId, data: response.data };
  }

  async timeslotGet(supply_order_id) {
    const response = await this.post("/v1/supply-order/timeslot/get", {
      supply_order_id,
    });
    return { accountId: this.accountId, data: response.data };
  }

  async timeslotUpdate(supply_order_id, timeslot) {
    const response = await this.post("/v1/supply-order/timeslot/update", {
      supply_order_id,
      timeslot,
    });
    return { accountId: this.accountId, data: response.data };
  }

  async timeslotStatus(operation_id) {
    const response = await this.post("/v1/supply-order/timeslot/status", {
      operation_id,
    });
    return { accountId: this.accountId, data: response.data };
  }

  async contentUpdateValidation(params) {
    const response = await this.post(
      "/v1/supply-order/content/update/validation",
      params
    );
    return { accountId: this.accountId, data: response.data };
  }

  async contentUpdate(params) {
    const response = await this.post("/v1/supply-order/content/update", params);
    return { accountId: this.accountId, data: response.data };
  }

  async contentUpdateStatus(operation_id) {
    const response = await this.post(
      "/v1/supply-order/content/update/status",
      { operation_id }
    );
    return { accountId: this.accountId, data: response.data };
  }

  async availableWarehouses() {
    const response = await this.get("/v1/supplier/available_warehouses");
    return { accountId: this.accountId, data: response.data };
  }
}
