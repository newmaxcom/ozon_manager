import axios from "axios";
import { BRAND_MONITOR_CONFIG } from "#configs/brandMonitor";

export const dispatcherClient = axios.create({
  baseURL: BRAND_MONITOR_CONFIG.DISPATCHER_URL,
  timeout: BRAND_MONITOR_CONFIG.REQUEST_TIMEOUT_MS,
});
