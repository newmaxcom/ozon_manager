import Service from "#services/User";
import { serviceInvoker } from "newmax-utils";

class User {
  list = async (req, res) => {
    await serviceInvoker(req, res, Service.list, Service.schema);
  };

  create = async (req, res) => {
    await serviceInvoker(req, res, Service.create, Service.schema);
  };

  update = async (req, res) => {
    req.body = {
      ...(req.body || {}),
      id: Number(req.params.id),
      authUser: res.locals.user,
    };

    await serviceInvoker(req, res, Service.update, Service.schema);
  };

  remove = async (req, res) => {
    req.body = {
      ...(req.body || {}),
      id: Number(req.params.id),
      authUser: res.locals.user,
    };

    await serviceInvoker(req, res, Service.remove, Service.schema);
  };
}

export default new User();
