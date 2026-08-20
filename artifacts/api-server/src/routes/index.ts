import { Router, type IRouter } from "express";
import healthRouter        from "./health";
import dropsRouter         from "./drops";
import ordersRouter        from "./orders";
import chefsRouter         from "./chefs";
import adminRouter         from "./admin";
import subscriptionsRouter from "./subscriptions";
import authRouter          from "./auth";
import aiRouter            from "./ai";
import fulfillmentRouter   from "./fulfillment";
import uploadsRouter       from "./uploads";
import storageRouter       from "./storage";
import favoritesRouter     from "./favorites";
import nfcRouter           from "./nfc";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/drops",         dropsRouter);
router.use("/orders",        ordersRouter);
router.use("/chefs",         chefsRouter);
router.use("/admin",         adminRouter);
router.use("/subscriptions", subscriptionsRouter);
router.use("/auth",          authRouter);
router.use("/ai",            aiRouter);
router.use("/fulfillment",   fulfillmentRouter);
router.use("/uploads",       uploadsRouter);
router.use("/favorites",     favoritesRouter);
router.use("/nfc",           nfcRouter);
router.use(storageRouter);

export default router;
