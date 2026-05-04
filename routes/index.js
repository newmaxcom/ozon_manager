import Router from "express";
import plan from "./plan.router.js";

const router = new Router();

router.use("/plan", plan);

export default router;
