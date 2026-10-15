import express from "express";
import {
    getPerifereiakesEnotites,
    getPerifereiakesEnotitesGeometry,
    getDimoiOfPerifereiakiEnotita,
} from "../controllers/PerifereiakesEnotites.js";
import { verifyUser, hcpOnly } from "../middleware/AuthUser.js";

const router = express.Router();

router.get('/perifereiakes-enotites', verifyUser, hcpOnly, getPerifereiakesEnotites);
router.get('/perifereiakes-enotites/geometry', verifyUser, hcpOnly, getPerifereiakesEnotitesGeometry);
router.get('/perifereiakes-enotites/:code/dimoi', verifyUser, hcpOnly, getDimoiOfPerifereiakiEnotita);

export default router;
