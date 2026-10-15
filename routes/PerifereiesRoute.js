import express from "express";
import { getPerifereies, getPerifereiesGeometry, getDimoiOfPerifereia } from "../controllers/Perifereies.js";
import { verifyUser, hcpOnly } from "../middleware/AuthUser.js";

const router = express.Router();

router.get('/perifereies', verifyUser, hcpOnly, getPerifereies);
router.get('/perifereies/geometry', verifyUser, hcpOnly, getPerifereiesGeometry);
router.get('/perifereies/:id/dimoi', verifyUser, hcpOnly, getDimoiOfPerifereia);

export default router;
