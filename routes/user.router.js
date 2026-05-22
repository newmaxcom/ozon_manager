import Router from "express";
import Controller from "#controllers/User";
import verifyAccessToken from "#middlewares/verifyAccessToken";
import requireAdmin from "#middlewares/requireAdmin";

const router = Router();

router.use(verifyAccessToken);
router.use(requireAdmin);

router.get("/", Controller.list);
router.post("/", Controller.create);
router.patch("/:id", Controller.update);
router.delete("/:id", Controller.remove);

export default router;
