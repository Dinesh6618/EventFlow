import { formatWait } from '../utils/format.js';

const BASE = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'eventflow_token';

// localStorage can throw (private mode, blocked storage); the app should still render.
export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* the session simply will not persist */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* nothing to clear */
    }
  },
};

export class ApiError extends Error {
  constructor(message, status, errors, code, retryAfter) {
    super(message);
    this.status = status;
    this.errors = errors || {};
    // A machine-readable reason from the server, for example EMAIL_NOT_VERIFIED.
    this.code = code || null;
    // Set on a 429: how many seconds until the request may be tried again.
    this.retryAfter = retryAfter || null;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = handler;
};

/** Turn a stored upload path (/uploads/x.png) into a loadable URL. */
export const assetUrl = (path) => (path ? `${BASE}${path}` : null);

/**
 * A 429 is the server asking us to slow down. It becomes a friendly message that says how long to wait
 * (from the body, or the Retry-After header). The request is never repeated automatically: only a person
 * pressing the button again, after the wait, sends another one.
 */
function tooManyRequests(response, data) {
  const fromBody = Number(data?.retryAfter);
  const fromHeader = Number(response.headers.get('Retry-After')); // a date instead of seconds is ignored
  const seconds = [fromBody, fromHeader].find((n) => Number.isFinite(n) && n > 0);
  const retryAfter = seconds ? Math.ceil(seconds) : null;
  const base = (data?.message || 'Too many requests. Please try again later.').replace(/\s*Please try again later\.?$/i, '').trim();
  const message = retryAfter ? `${base} Please try again in ${formatWait(retryAfter)}.` : `${base} Please try again later.`;
  return new ApiError(message, 429, undefined, 'RATE_LIMITED', retryAfter);
}

export async function request(path, { method = 'GET', body, signal, auth = true } = {}) {
  const headers = { Accept: 'application/json' };
  const token = tokenStore.get();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (body instanceof FormData) {
    payload = body; // the browser sets the multipart boundary
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${BASE}${path}`, { method, headers, body: payload, signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Cannot reach the server. Make sure the backend is running.', 0);
  }

  const data = await response.json().catch(() => null);
  // Reading the body can be cut short by an abort; surface that as an abort, not as empty data.
  if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
  if (!response.ok) {
    if (auth && token && (response.status === 401 || (response.status === 403 && data?.code === 'EMAIL_NOT_VERIFIED'))) onUnauthorized();
    if (response.status === 429) throw tooManyRequests(response, data);
    throw new ApiError(data?.message || `Request failed (${response.status})`, response.status, data?.errors, data?.code);
  }
  return data;
}

/** Fetch a file with the auth header and hand it to the browser as a download. */
export async function download(path, fallbackName) {
  const token = tokenStore.get();
  let response;
  try {
    response = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError('Cannot reach the server. Make sure the backend is running.', 0);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(data?.message || `Download failed (${response.status})`, response.status);
  }
  const match = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') || '');
  const url = URL.createObjectURL(await response.blob());
  const link = Object.assign(document.createElement('a'), { href: url, download: match?.[1] || fallbackName });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Fetch a file with the sign-in token and return a temporary blob URL (revoke it when done). */
export async function blobUrl(path) {
  const token = tokenStore.get();
  let response;
  try {
    response = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError('Cannot reach the server. Make sure the backend is running.', 0);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(data?.message || `Could not open the file (${response.status})`, response.status);
  }
  return URL.createObjectURL(await response.blob());
}
