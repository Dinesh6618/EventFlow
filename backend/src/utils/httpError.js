export class HttpError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export const badRequest = (message, errors) => new HttpError(400, message, errors);
export const unauthorized = (message = 'Authentication required') => new HttpError(401, message);
export const forbidden = (message = 'You do not have permission to do that') => new HttpError(403, message);
export const notFound = (message = 'Not found') => new HttpError(404, message);
export const conflict = (message, errors) => new HttpError(409, message, errors);
export const unprocessable = (message, errors) => new HttpError(422, message, errors);
