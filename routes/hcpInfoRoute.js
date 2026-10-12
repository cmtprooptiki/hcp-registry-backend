import express from "express";
import { getHcpInfo, getHcpInfoById, createHcpInfo, updateHcpInfo, createHcpInfoJson, deleteHcpInfo, getHcpProviderInfoByHcpId} from "../controllers/hcpInfo.js";
import { verifyUser,adminOnly, } from "../middleware/AuthUser.js";
import { uploadJson } from "../middleware/multer-config2.js";
const router = express.Router();

router.get('/hcpInfo',verifyUser, getHcpInfo);
router.get('/hcpInfo/:id',verifyUser,getHcpInfoById);
router.post('/hcpInfo',verifyUser,createHcpInfo);
router.post('/hcpInfo_json',verifyUser,uploadJson.single('file'),createHcpInfoJson);
router.patch('/hcpInfo/:id',verifyUser,updateHcpInfo);
router.delete('/hcpInfo/:id',verifyUser,deleteHcpInfo);
router.get('/hcpInfoSpec/:hcp_id', verifyUser, getHcpProviderInfoByHcpId)


export default router;