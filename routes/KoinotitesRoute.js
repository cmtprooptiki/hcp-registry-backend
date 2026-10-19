import express from "express";
import { getKoinotites, getKoinotitesGeometry, getKoinotitesNames } from "../controllers/Koinotites.js";
import { verifyUser, hcpOnly } from "../middleware/AuthUser.js";

const router = express.Router();

router.get('/koinotites/names', verifyUser, hcpOnly, getKoinotitesNames);
router.get('/koinotites/geometry', verifyUser, hcpOnly, getKoinotitesGeometry);
router.get('/koinotites', verifyUser, hcpOnly, getKoinotites);

export default router;
