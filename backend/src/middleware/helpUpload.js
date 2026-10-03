import crypto from 'node:crypto';
import fs from 'node:fs';
import multer from 'multer';
import { config } from '../config.js';
import { HttpError } from '../utils/httpError.js';

const EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
export const MAX_HELP_PHOTO_BYTES = 5 * 1024 * 1024;

const reject = (message) => new HttpError(422, 'Please fix the highlighted fields', { photo: message });

fs.mkdirSync(config.helpUploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: config.helpUploadDir,
    // The name never comes from the client; the extension comes from the verified mime type.
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${EXTENSIONS[file.mimetype]}`),
  }),
  limits: { fileSize: MAX_HELP_PHOTO_BYTES, files: 1, fields: 20 },
  fileFilter: (_req, file, cb) => (EXTENSIONS[file.mimetype] ? cb(null, true) : cb(reject('Photo must be a JPG, PNG or WEBP image'))),
});

/** The real file type, from the first bytes. A renamed or disguised file is refused. */
function looksLikeImage(file) {
  const fd = fs.openSync(file.path, 'r');
  const head = Buffer.alloc(12);
  fs.readSync(fd, head, 0, 12, 0);
  fs.closeSync(fd);
  if (file.mimetype === 'image/jpeg') return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (file.mimetype === 'image/png') return head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP';
}

/** Parses multipart/form-data with an optional `photo` file and checks that it really is an image. */
export function uploadHelpPhoto(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (err instanceof multer.MulterError) return next(reject(err.code === 'LIMIT_FILE_SIZE' ? 'Photo must be smaller than 5 MB' : 'Invalid photo upload'));
    if (err) return next(err);
    if (req.file && !looksLikeImage(req.file)) {
      fs.rmSync(req.file.path, { force: true });
      return next(reject('That file is not a valid JPG, PNG or WEBP image'));
    }
    next();
  });
}

export const helpPhotoPath = (storedName) => `${config.helpUploadDir}/${storedName}`;
