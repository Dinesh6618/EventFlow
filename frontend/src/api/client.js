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
  constructor(message, status, errors) {
    super(message);
    this.status = status;
    this.errors = errors || {};
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = handler;
};

/** Turn a stored upload path (/uploads/x.png) into a loadable URL. */
export const assetUrl = (path) => (path ? `${BASE}${path}` : null);

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
    if (response.status === 401 && auth && token) onUnauthorized();
    throw new ApiError(data?.message || `Request failed (${response.status})`, response.status, data?.errors);
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
