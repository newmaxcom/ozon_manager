import Service from "#services/Plan";
import { serviceInvoker } from "newmax-utils";

class Plan {
  setSelling = async (req, res) => {
    await serviceInvoker(req, res, Service.setSelling, Service.schema);
  };
}

export default new Plan();
