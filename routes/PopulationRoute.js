import express from "express";
import { getPopulationAges } from "../controllers/PopulationAges.js";
import { verifyUser, hcpOnly } from "../middleware/AuthUser.js";

const router = express.Router();

router.get('/population/ages', verifyUser, hcpOnly, getPopulationAges);

export default router;
