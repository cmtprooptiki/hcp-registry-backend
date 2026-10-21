import express from "express";
import { getSettlementAccess } from "../controllers/Access.js";
import { verifyUser, hcpOnly } from "../middleware/AuthUser.js";

const router = express.Router();

router.get('/access/settlements', verifyUser, hcpOnly, getSettlementAccess);

export default router;
