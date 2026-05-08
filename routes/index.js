import Router from "express";
import plan from "./plan.router.js";
import brandMonitor from "./brandMonitor.router.js";
import invoices from "./invoices.router.js";

const router = new Router();

router.use("/plan", plan);
router.use("/brand-monitor", brandMonitor);
router.use("/invoices", invoices);

export default router;
