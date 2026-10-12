// import express from "express";
// import {
//     getUsers,
//     getUserById,
//     createUser,
//     updateUser,
//     deleteUser
// } from "../controllers/Users.js"
// import { verifyUser,adminOnly } from "../middleware/AuthUser.js";

// const router = express.Router();

// router.get('/users',verifyUser,adminOnly, getUsers);
// router.get('/users/:id',verifyUser,adminOnly,getUserById);
// router.post('/users',createUser);
// router.patch('/users/:id',verifyUser,adminOnly,updateUser);
// router.delete('/users/:id',verifyUser,adminOnly,deleteUser);


// export default router;
import express from "express";
import {
    getUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser
} from "../controllers/Users.js";
import { verifyUser, adminOnly } from "../middleware/AuthUser.js";
import { upload } from "../middleware/multer-config.js";  // Import multer config

const router = express.Router();

// Routes
router.get('/users', getUsers);
router.get('/users/:id', verifyUser, adminOnly, getUserById);
router.get('/SimpleUser/:id', verifyUser, getUserById)
// Profile image upload routes
router.post('/users', upload.single('profileImage'), createUser);
router.patch('/users/:id', verifyUser, adminOnly, upload.single('profileImage'), updateUser);

router.delete('/users/:id', verifyUser, adminOnly, deleteUser);

router.patch('/SimpleUser/:id', verifyUser, upload.single('profileImage'), updateUser);


export default router;
