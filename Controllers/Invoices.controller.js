import Service from "#services/Invoices";
import { serviceInvoker } from "newmax-utils";

class Invoices {
  pushToSheet = async (req, res) => {
    await serviceInvoker(req, res, Service.pushToSheet, Service.schema);
  };
}

export default new Invoices();
