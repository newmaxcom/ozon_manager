import ApiAxios from "#utils/apiAxios";

export default class SupplyApi extends ApiAxios {
  constructor(id, client_id, apikey, config = {}) {
    super(id, client_id, apikey, {
      baseURL: "https://api-seller.ozon.ru",
      maxRetries: 5,
      baseDelay: 2000,
      ...config,
    });
    this.accountId = id;
  }

  async v3SupplyOrderList(params) {
    try {
      const response = await this.post("/v3/supply-order/list", params);
      return { accountId: this.accountId, data: response.data };
    } catch (error) {
      console.log(error);
      throw { accountId: this.accountId, error: error.status };
    }
  }

  async v3SupplyOrderGet(chank) {
    try {
      const response = await this.post("/v3/supply-order/get", {
        order_ids: chank,
      });
      return { accountId: this.accountId, data: response.data };
    } catch (error) {
      console.log(error);
      throw { accountId: this.accountId, error: error.status };
    }
  }

  async v1SupplyOrderBundle(params) {
    let has_next = true;
    const result = [];
    try {
      while (has_next) {
        const response = await this.post("/v1/supply-order/bundle", {
          ...params,
        });

        has_next = response.data.has_next;
        params.last_id = response.data.last_id;
        result.push(...response.data.items);
      }

      return { accountId: this.accountId, data: result };
    } catch (error) {
      console.log(error);
      throw { accountId: this.accountId, error: error.status };
    }
  }

  async v1ClusterList(params) {
    try {
      const response = await this.post("/v1/cluster/list", params);
      return { accountId: this.accountId, data: response.data };
    } catch (error) {
      console.log(error);
      throw { accountId: this.accountId, error: error.status };
    }
  }

  async v1FboList(params) {
    try {
      const response = await this.post("/v1/warehouse/fbo/list", params);
      return { accountId: this.accountId, data: response.data };
    } catch (error) {
      console.log(error);
      throw { accountId: this.accountId, error: error.status };
    }
  }
}
