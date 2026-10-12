import express from "express";
import {
    getHCProviders,
    getHCProvidersById,
    getHCProvidersByUserId,
    createHCProviders,
    createHCProvidersJson,
    updateHCProviders,
    deleteHCProvider
} from "../controllers/HCProviders.js"
import { verifyUser,adminOnly,hcpOnly } from "../middleware/AuthUser.js";
import { uploadJson } from "../middleware/multer-config2.js";
const router = express.Router();

router.get('/HCProviders',verifyUser,hcpOnly, getHCProviders);
router.get('/HCProvidersByUser/:id',verifyUser,hcpOnly, getHCProvidersByUserId);
router.get('/HCProviders/:id',verifyUser,hcpOnly,getHCProvidersById);
router.post('/HCProviders',verifyUser,hcpOnly,createHCProviders);
router.post('/HCProviders_json',verifyUser,hcpOnly,uploadJson.single('file'),createHCProvidersJson);
router.patch('/HCProviders/:id',verifyUser,hcpOnly,updateHCProviders);
router.delete('/HCProviders/:id',verifyUser,hcpOnly,deleteHCProvider);


export default router;