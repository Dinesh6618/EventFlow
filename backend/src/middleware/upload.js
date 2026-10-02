import crypto from 'node:crypto';
import fs from 'node:fs';
import multer from 'multer';
import { config } from '../config.js';
import { HttpError } from '../utils/httpError.js';

const EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

fs.mkdirSync(config.uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    // Never trust the client's file name; derive the extension from the verified mime type.
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${EXTENSIONS[file.mimetype]}`),
  }),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (EXTENSIONS[file.mimetype]) return cb(null, true);
    cb(new HttpError(422, 'Please fix the highlighted fields', { image: 'Banner must be a JPG, PNG, WEBP or GIF image' }));
  },
});

/** Parses multipart/form-data with an optional `image` file field. */
export const uploadEventImage = upload.single('image');

