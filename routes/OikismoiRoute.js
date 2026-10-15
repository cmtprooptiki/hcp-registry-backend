import express from "express";
import { getOikismoi, getOikismoiOfDimos, getOikismoiNames } from "../controllers/Oikismoi.js";
import { verifyUser, hcpOnly } from "../middleware/AuthUser.js";

const router = express.Router();

router.get('/oikismoi/names', verifyUser, hcpOnly, getOikismoiNames);
router.get('/oikismoi', verifyUser, hcpOnly, getOikismoi);
router.get('/dimoi/:code/oikismoi', verifyUser, hcpOnly, getOikismoiOfDimos);

export default router;
