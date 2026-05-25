import axios from "axios";

const env = process.env.NODE_ENV || "development";
const host =
  env === "production"
    ? `ozon-parser:${process.env.OZON_PORT || 5522}`
    : `127.0.0.1:${process.env.DEV_OZON_PORT || 5522}`;

const baseURL = `http://${host}`;

async function call(method, path, data) {
  try {
    const res = await axios.request({
      url: `${baseURL}${path}`,
      method,
      data,
      timeout: 60000,
    });
    return res.data;
  } catch (error) {
    console.warn(
      `[ozon-parser] ${method.toUpperCase()} ${path} failed: ${error.message}`
    );
    throw error;
  }
}

export async function triggerSupplyStatusRefresh() {
  return call("get", "/supply/get.status");
}
