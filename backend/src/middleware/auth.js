import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import * as users from '../models/userModel.js';
import { UNVERIFIED_MESSAGE, verificationRequired } from '../services/email/index.js';
import { HttpError, forbidden, unauthorized } from '../utils/httpError.js';

export const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

/** Requires a valid Bearer token and loads the user into req.user. */
export async function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw unauthorized();

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw unauthorized('Your session has expired. Please log in again.');
  }

  const user = await users.findById(payload.sub);
  if (!user) throw unauthorized('Account no longer exists');
  // Where verification is required, an unverified account gets no access at all until it is verified.
  if (verificationRequired() && !user.emailVerified) {
    throw new HttpError(403, UNVERIFIED_MESSAGE, undefined, 'EMAIL_NOT_VERIFIED');
  }
  req.user = user;
  next();
}

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };
