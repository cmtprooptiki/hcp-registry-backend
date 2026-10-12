import multer from 'multer';
import path from 'path';

// Middleware for handling image uploads (existing)
export const uploadImages = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, './uploads');  // Path to store the uploaded images
        },
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname);
            const filename = `${file.fieldname}-${Date.now()}${ext}`;
            cb(null, filename);
        }
    }),
    limits: { fileSize: 1024 * 1024 * 5 },  // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type, only JPEG and PNG are allowed!'), false);
        }
    }
});

// Middleware for handling JSON file uploads
export const uploadJson = multer({
    storage: multer.memoryStorage(), // Store JSON in memory
    limits: { fileSize: 10 * 1024 * 1024 },  // Set size limit for JSON file (e.g., 10MB)
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        if (ext === '.json') {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type, only JSON files are allowed!'), false);
        }
    }  // Use the custom JSON file filter
});