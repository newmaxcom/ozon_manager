import Service from "#services/Auth";
import { serviceInvoker } from "newmax-utils";

class Auth {
  signIn = async (req, res) => {
    await serviceInvoker(req, res, Service.signIn, Service.schema);
  };

  me = async (req, res) => {
    req.body = {
      ...(req.body || {}),
      authUser: res.locals.user,
    };

    await serviceInvoker(req, res, Service.me, Service.schema);
  };

  signOut = async (req, res) => {
    await serviceInvoker(req, res, Service.signOut, Service.schema);
  };
}

export default new Auth();
