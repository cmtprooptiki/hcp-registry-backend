import multer from 'multer';
import path from 'path';

// Define storage for multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads');  // Path to store the uploaded images
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const filename = `${file.fieldname}-${Date.now()}${ext}`;
        cb(null, filename);
    }
});

// File filtering (to allow only images)
const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type, only JPEG and PNG are allowed!'), false);
    }
};

// Middleware for handling image upload
export const upload = multer({
    storage: storage,
    limits: { fileSize: 1024 * 1024 * 5 },  // 5MB limit
    fileFilter: fileFilter
});
