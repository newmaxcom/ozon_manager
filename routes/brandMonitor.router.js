import Router from "express";
import Controller from "#controllers/BrandMonitor";

const router = Router();

router.post("/run", Controller.run);

export default router;
