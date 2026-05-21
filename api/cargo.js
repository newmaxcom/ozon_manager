import ApiAxios from "#utils/apiAxios";

export default class CargoApi extends ApiAxios {
  constructor(id, client_id, apikey, config = {}) {
    super(id, client_id, apikey, {
      baseURL: "https://api-seller.ozon.ru",
      maxRetries: 5,
      baseDelay: 2000,
      ...config,
    });
    this.accountId = id;
  }

  async cargoesCreate(params) {
    const response = await this.post("/v1/cargoes/create", params);
    return { accountId: this.accountId, data: response.data };
  }

  async cargoesCreateInfo(operation_id) {
    const response = await this.post("/v2/cargoes/create/info", {
      operation_id,
    });
    return { accountId: this.accountId, data: response.data };
  }

  async cargoesGet(supply_ids) {
    const response = await this.post("/v1/cargoes/get", { supply_ids });
    return { accountId: this.accountId, data: response.data };
  }

  async cargoesDelete(params) {
    const response = await this.post("/v1/cargoes/delete", params);
    return { accountId: this.accountId, data: response.data };
  }

  async cargoesDeleteStatus(operation_id) {
    const response = await this.post("/v1/cargoes/delete/status", {
      operation_id,
    });
    return { accountId: this.accountId, data: response.data };
  }

  async labelCreate(params) {
    const response = await this.post("/v1/cargoes-label/create", params);
    return { accountId: this.accountId, data: response.data };
  }

  async labelGet(operation_id) {
    const response = await this.post("/v1/cargoes-label/get", { operation_id });
    return { accountId: this.accountId, data: response.data };
  }

  async labelFile(file_guid) {
    const response = await this.instance.get(
      `/v1/cargoes-label/file/${file_guid}`,
      { responseType: "arraybuffer" }
    );
    return { accountId: this.accountId, data: response.data };
  }
}
