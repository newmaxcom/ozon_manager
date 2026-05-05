import Service from "#services/BrandMonitor";
import { serviceInvoker } from "newmax-utils";

class BrandMonitor {
  run = async (req, res) => {
    await serviceInvoker(req, res, Service.run, Service.schema);
  };
}

export default new BrandMonitor();
