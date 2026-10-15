import express from "express";
import {
    getDimotikesEnotites,
    getDimotikesEnotitesGeometry,
    getDimotikesEnotitesOfDimos,
} from "../controllers/DimotikesEnotites.js";
import { verifyUser, hcpOnly } from "../middleware/AuthUser.js";

const router = express.Router();

router.get('/dimotikes-enotites', verifyUser, hcpOnly, getDimotikesEnotites);
router.get('/dimotikes-enotites/geometry', verifyUser, hcpOnly, getDimotikesEnotitesGeometry);
router.get('/dimoi/:code/dimotikes-enotites', verifyUser, hcpOnly, getDimotikesEnotitesOfDimos);

export default router;
