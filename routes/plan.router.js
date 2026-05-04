import Router from "express";
import Controller from "#controllers/Plan";

const router = Router();

router.post("/set.selling", Controller.setSelling);

export default router;
