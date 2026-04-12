import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import agentsRouter from "./agents.js";
import servicesRouter from "./services.js";
import sessionsRouter from "./sessions.js";
import paymentsRouter from "./payments.js";
import ratingsRouter from "./ratings.js";
import demoRouter from "./demo.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(agentsRouter);
router.use(servicesRouter);
router.use(sessionsRouter);
router.use(paymentsRouter);
router.use(ratingsRouter);
router.use(demoRouter);

export default router;
