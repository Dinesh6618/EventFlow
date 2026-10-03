import multer from 'multer';
import { config } from '../config.js';
import { MAX_IMAGE_BYTES } from './upload.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `Banner must be smaller than ${MAX_IMAGE_BYTES / 1024 / 1024} MB`
        : 'Invalid file upload';
    return res.status(422).json({ message: 'Please fix the highlighted fields', errors: { image: message } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Request body is not valid JSON' });
  }
  if (err.status) {
    return res.status(err.status).json({ message: err.message, ...(err.errors && { errors: err.errors }), ...(err.errorCode && { code: err.errorCode }) });
  }
  if (err.code === '23505') {
    return res.status(409).json({ message: 'That record already exists' });
  }

  console.error(err);
  res.status(500).json({ message: config.env === 'production' ? 'Something went wrong' : err.message });
}
