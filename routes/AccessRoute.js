import express from "express";
import { getSettlementAccess } from "../controllers/Access.js";
import { getHealthCentreAccess } from "../controllers/HealthCentreAccess.js";
import { verifyUser, hcpOnly } from "../middleware/AuthUser.js";

const router = express.Router();

router.get('/access/settlements', verifyUser, hcpOnly, getSettlementAccess);
router.get('/access/health-centres', verifyUser, hcpOnly, getHealthCentreAccess);

export default router;
