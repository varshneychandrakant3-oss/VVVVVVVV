// In-memory fixed-window rate limiter. Verification calls cost money and expose
// personal data, so they are limited per user and per IP.
import { HttpError } from './http.js';

const windows = new Map();

export function limit(key, max, windowMs) {
  const now = Date.now();
  let w = windows.get(key);
  if (!w || now - w.start >= windowMs) { w = { start: now, count: 0 }; windows.set(key, w); }
  w.count++;
  if (w.count > max) {
    const retry = Math.ceil((w.start + windowMs - now) / 1000);
    throw new HttpError(429, `Too many attempts. Try again in ${Math.ceil(retry / 60)} min.`, 'rate_limited');
  }
}

export function resetLimits() { windows.clear(); }

setInterval(() => { const now = Date.now(); for (const [k, w] of windows) if (now - w.start > 24 * 3600e3) windows.delete(k); }, 3600e3).unref();
