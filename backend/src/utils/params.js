import { notFound } from './httpError.js';

/** Parse a numeric route parameter; anything that is not a positive integer is a 404. */
export function idParam(value, what = 'Resource') {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw notFound(`${what} not found`);
  return id;
}
