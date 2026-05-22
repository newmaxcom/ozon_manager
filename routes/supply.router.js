import Router from "express";
import Controller from "#controllers/Supply";
import verifyAccessToken from "#middlewares/verifyAccessToken";

const router = Router();

router.use(verifyAccessToken);

router.get("/dashboard", Controller.dashboard);
router.get("/boxes", Controller.boxes);

router.get("/draft.info", Controller.draftInfo);
router.post("/timeslots", Controller.timeslots);

router.get("/create.drafts", Controller.createDrafts);
router.post("/create.supplies", Controller.createSupplies);
router.get("/create.cargoes", Controller.createCargoes);
router.get("/create.labels", Controller.createLabels);
router.get("/label.file", Controller.labelFile);

router.get("/refresh.statuses", Controller.refreshStatuses);

router.post("/set.pass", Controller.setPass);

export default router;
