import axios from "axios";

export default class BaseAxios {
  constructor(config = {}) {
    this.instance = axios.create({
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Marketplace-API-Client/1.0.0",
      },
      ...config,
    });

    this.rateLimitState = {
      remaining: null,
      limit: null,
      reset: null,
      retryAfter: null,
    };

    this.setupInterceptors();
  }

  setupInterceptors() {
    this.instance.interceptors.request.use(
      (config) => {
        this.onRequest(config);
        return config;
      },
      (error) => {
        this.onRequestError(error);
        return Promise.reject(error);
      }
    );

    this.instance.interceptors.response.use(
      (response) => {
        this.onResponse(response);
        this.updateRateLimitHeaders(response);
        return response;
      },
      (error) => {
        this.onResponseError(error);
        return Promise.reject(error);
      }
    );
  }

  updateRateLimitHeaders(response) {
    if (response.headers) {
      this.rateLimitState = {
        remaining: parseInt(response.headers["x-ratelimit-remaining"]) || null,
        limit: parseInt(response.headers["x-ratelimit-limit"]) || null,
        reset: parseInt(response.headers["x-ratelimit-reset"]) || null,
        retryAfter: parseInt(response.headers["x-ratelimit-retry"]) || null,
      };
    }
  }

  onRequest(config) {
    console.log(`📤 ${config.method?.toUpperCase()} ${config.url}`);
    if (this.rateLimitState.remaining !== null) {
      console.log(
        `🔄 RateLimit: ${this.rateLimitState.remaining}/${this.rateLimitState.limit}`
      );
    }
  }

  onRequestError(error) {
    console.log("❌ Ошибка запроса:", error.message);
  }

  onResponse(response) {
    console.log(`📥 ${response.status} ${response.config.url}`);
  }

  onResponseError(error) {
    console.log(`❌ ${error.response?.status || "Error"} ${error.config?.url}`);
  }

  getRateLimitState() {
    return { ...this.rateLimitState };
  }

  request(config) {
    return this.instance.request(config);
  }

  get(url, config = {}) {
    return this.instance.get(url, config);
  }

  post(url, data = {}, config = {}) {
    return this.instance.post(url, data, config);
  }

  put(url, data = {}, config = {}) {
    return this.instance.put(url, data, config);
  }

  delete(url, config = {}) {
    return this.instance.delete(url, config);
  }

  patch(url, data = {}, config = {}) {
    return this.instance.patch(url, data, config);
  }
}
