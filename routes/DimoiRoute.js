import express from "express";
import { getDimoi, getDimoiGeometry, getDimosAt } from "../controllers/Dimoi.js";
import { verifyUser, hcpOnly } from "../middleware/AuthUser.js";

const router = express.Router();

router.get('/dimoi', verifyUser, hcpOnly, getDimoi);
router.get('/dimoi/geometry', verifyUser, hcpOnly, getDimoiGeometry);
router.get('/dimoi/at', verifyUser, hcpOnly, getDimosAt);

export default router;
