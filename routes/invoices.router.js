import Router from "express";
import Controller from "#controllers/Invoices";

const router = Router();

router.post("/push.sheet", Controller.pushToSheet);
router.get("/push.sheet", Controller.pushToSheet);

export default router;
