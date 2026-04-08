import { Router } from "express";
const router = Router();
router.get("/health", (_req, res) => res.status(200).json({ status: "ok", service: "respond-ghl-middleware", ts: new Date().toISOString() }));
export default router;