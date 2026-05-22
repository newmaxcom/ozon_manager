import Router from "express";
import auth from "./auth.router.js";
import users from "./user.router.js";
import plan from "./plan.router.js";
import brandMonitor from "./brandMonitor.router.js";
import invoices from "./invoices.router.js";
import supply from "./supply.router.js";

const router = new Router();

router.use("/auth", auth);
router.use("/users", users);
router.use("/plan", plan);
router.use("/brand-monitor", brandMonitor);
router.use("/invoices", invoices);
router.use("/supply", supply);

export default router;
