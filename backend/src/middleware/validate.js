import fs from 'node:fs/promises';
import { HttpError } from '../utils/httpError.js';

/** { field: 'first message' } from a zod error. */
function fieldErrors(zodError) {
  const errors = {};
  for (const issue of zodError.issues) {
    const key = issue.path.join('.') || '_';
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/** Validate req[source] with a zod schema and replace it with the parsed value. */
export const validate =
  (schema, source = 'body') =>
  async (req, _res, next) => {
    const result = schema.safeParse(req[source] ?? {});
    if (result.success) {
      // Express 5 exposes req.query as a read-only getter, so redefine it.
      Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
      return next();
    }
    // A rejected request must not leave an uploaded file behind.
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    next(new HttpError(422, 'Please fix the highlighted fields', fieldErrors(result.error)));
  };
