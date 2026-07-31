import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const uploadDir = join(__dirname, '..', '..', 'public', 'uploads');
mkdirSync(uploadDir, { recursive: true });

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = (extname(file.originalname) || '.jpg').toLowerCase().slice(0, 6);
    cb(null, `${Date.now()}-${randomBytes(5).toString('hex')}${ext}`);
  },
});

// Single optional `image` field, 5 MB cap, images only.
export const uploadImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    ALLOWED.has(file.mimetype)
      ? cb(null, true)
      : cb(Object.assign(new Error('Upload a JPG, PNG, WEBP or GIF image.'), { status: 400 })),
}).single('image');

// Wrap multer so its errors become clean JSON instead of crashing the request.
export const handleUpload = (req, res, next) =>
  uploadImage(req, res, (err) => {
    if (!err) return next();
    const msg =
      err.code === 'LIMIT_FILE_SIZE' ? 'That image is larger than 5 MB.' : err.message;
    res.status(400).json({ error: msg });
  });
