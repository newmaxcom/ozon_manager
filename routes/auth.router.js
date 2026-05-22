import Router from "express";
import Controller from "#controllers/Auth";
import verifyAccessToken from "#middlewares/verifyAccessToken";

const router = Router();

router.post("/sign-in", Controller.signIn);
router.get("/me", verifyAccessToken, Controller.me);
router.get("/sign-out", Controller.signOut);

export default router;
