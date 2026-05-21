import BaseAxios from "./baseAxios.js";

export default class ApiAxios extends BaseAxios {
  constructor(id, client_id, apikey, config = {}) {
    super({
      ...config,
    });

    this.accountId = id;
    this.clientId = client_id;
    this.apiKey = apikey;
    this.retryConfig = {
      maxRetries: config.maxRetries || 3,
      baseDelay: config.baseDelay || 1000,
      ...config.retryConfig,
    };
    this.setupApiInterceptors();
  }

  setupApiInterceptors() {
    this.instance.interceptors.request.use((config) => {
      return this.addAuthHeader(config);
    });

    this.instance.interceptors.response.use(
      (response) => response,
      (error) => {
        return this.handleApiError(error);
      }
    );
  }

  addAuthHeader(config) {
    if (this.apiKey) {
      config.headers["Client-Id"] = this.clientId;
      config.headers["Api-Key"] = this.apiKey;
    }
    return config;
  }

  handleApiError(error) {
    const status = error.response?.status;

    switch (status) {
      case 401:
        console.log(`⚠️ Требуется авторизация | ${this.accountId}`);
        break;
      case 403:
        console.log(`🚫 Доступ запрещен | ${this.accountId}`);
        break;
      case 404:
        console.log(`🔍 Ресурс не найден | ${this.accountId}`);
        break;
      case 429:
        return this.handleRateLimitError(error);
      case 500:
        console.log(`💥 Ошибка сервера | ${this.accountId}`);
        break;
    }
    return Promise.reject(error);
  }

  async handleRateLimitError(error) {
    const config = error.config;

    if (config.__retryCount >= this.retryConfig.maxRetries) {
      console.log("🚫 Превышено максимальное количество попыток повтора");
      return Promise.reject(error);
    }

    config.__retryCount = config.__retryCount || 0;
    config.__retryCount++;

    const retryAfter = this.calculateRetryDelay(error);

    console.log(
      `⏰ Rate Limit превышен. Повтор через ${retryAfter}ms (попытка ${config.__retryCount}/${this.retryConfig.maxRetries})`
    );

    await this.delay(retryAfter);

    return this.instance.request(config);
  }

  calculateRetryDelay(error) {
    const response = error.response;

    if (response?.headers?.["x-ratelimit-retry"]) {
      const retrySeconds = parseInt(response.headers["x-ratelimit-retry"]);
      console.log(`⏱️ Используем X-Ratelimit-Retry: ${retrySeconds} секунд`);
      return retrySeconds * 1000;
    }

    const exponentialDelay =
      this.retryConfig.baseDelay *
      Math.pow(2, (error.config.__retryCount || 1) - 1);
    console.log(`⏱️ Используем exponential backoff: ${exponentialDelay}ms`);
    return exponentialDelay;
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getRateLimitInfo() {
    const state = this.getRateLimitState();
    return {
      remaining: state.remaining,
      limit: state.limit,
      resetIn: state.reset ? `${state.reset} секунд` : "неизвестно",
      canMakeRequest: state.remaining === null || state.remaining > 0,
    };
  }
}
