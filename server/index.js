// VanYatra server: serves the web app and the auth + verification API.
// Run with `npm start`. No third-party dependencies.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, validateConfig, ROOT } from './config.js';
import { HttpError, sendJson, redirect, readJson, clientIp, SECURITY_HEADERS } from './lib/http.js';
import { limit } from './lib/ratelimit.js';
import * as auth from './lib/auth.js';
import * as verify from './verify.js';
import * as digilocker from './digilocker.js';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

function serveStatic(req, res, pathname) {
  // Only index.html and /assets/ are public; everything else (server/, data/, .env) is not
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (rel !== 'index.html' && !rel.startsWith('assets/')) throw new HttpError(404, 'Not found');
  const full = path.resolve(ROOT, rel);
  if (!full.startsWith(path.join(ROOT, 'assets')) && full !== path.join(ROOT, 'index.html')) throw new HttpError(404, 'Not found');
  let data;
  try { data = fs.readFileSync(full); } catch { throw new HttpError(404, 'Not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...SECURITY_HEADERS });
  res.end(data);
}

// Reject cross-site POSTs (CSRF) — browsers always send Origin on POST
function checkOrigin(req) {
  const origin = req.headers.origin;
  if (origin && origin !== new URL(config.publicUrl).origin && origin !== `http://${req.headers.host}`) throw new HttpError(403, 'Cross-site request blocked.');
}

async function readForm(req) {
  let body = '';
  for await (const c of req) { body += c; if (body.length > 8192) throw new HttpError(413, 'Too large'); }
  return Object.fromEntries(new URLSearchParams(body));
}

// Owners verify themselves; admins may verify on behalf of a user (subjectId)
function subjectFor(actor, body) {
  if (actor.role === 'admin' && body.subjectId) {
    const s = auth.findAccount(body.subjectId);
    if (!s) throw new HttpError(404, 'User not found.');
    return s;
  }
  return actor;
}

const VERIFY_ROUTES = {
  pan: { roles: ['owner', 'admin'], fn: verify.checkPan },
  gstin: { roles: ['owner', 'admin'], fn: verify.checkGstin },
  vehicle: { roles: ['owner', 'admin'], fn: verify.checkVehicle },
  bank: { roles: ['owner', 'admin'], fn: verify.checkBank },
  dl: { roles: ['customer', 'owner', 'admin'], fn: verify.checkDrivingLicence }
};

async function handleApi(req, res, url) {
  const p = url.pathname;
  const ip = clientIp(req);
  if (req.method === 'POST') checkOrigin(req);

  if (p === '/api/config' && req.method === 'GET') {
    return sendJson(res, 200, { provider: verify.provider().name, testMode: config.provider === 'sandbox', digilocker: config.digilocker.mode });
  }

  /* ----- Auth ----- */
  if (p === '/api/auth/me' && req.method === 'GET') return sendJson(res, 200, { user: auth.publicUser(auth.currentUser(req)) });
  if (p === '/api/auth/login' && req.method === 'POST') {
    const body = await readJson(req);
    limit('login-ip:' + ip, 20, 15 * 60e3);
    limit('login-email:' + String(body.email).toLowerCase(), 8, 15 * 60e3);
    const u = auth.login(body.email, body.password);
    auth.createSession(res, u);
    return sendJson(res, 200, { user: auth.publicUser(u) });
  }
  if (p === '/api/auth/signup' && req.method === 'POST') {
    limit('signup-ip:' + ip, 10, 3600e3);
    const u = auth.signup(await readJson(req));
    auth.createSession(res, u);
    return sendJson(res, 201, { user: auth.publicUser(u) });
  }
  if (p === '/api/auth/logout' && req.method === 'POST') { auth.destroySession(req, res); return sendJson(res, 200, { ok: true }); }
  if (p === '/api/auth/password' && req.method === 'POST') {
    const u = auth.requireUser(req);
    limit('pw:' + u.id, 5, 15 * 60e3);
    const body = await readJson(req);
    auth.changePassword(u.id, body.oldPassword, body.newPassword);
    auth.createSession(res, u);
    return sendJson(res, 200, { ok: true });
  }

  /* ----- Verification ----- */
  const m = p.match(/^\/api\/verify\/([a-z]+)$/);
  if (m && req.method === 'POST' && VERIFY_ROUTES[m[1]]) {
    const route = VERIFY_ROUTES[m[1]];
    const actor = auth.requireUser(req, route.roles);
    const body = await readJson(req);
    if (body.consent !== true) throw new HttpError(400, 'Consent is required before we can check this document.', 'consent_required');
    // Checks cost money and touch personal data: cap them per user
    limit(`verify:${actor.id}:${m[1]}`, actor.role === 'admin' ? 200 : 10, 3600e3);
    limit(`verify-day:${actor.id}`, actor.role === 'admin' ? 1000 : 40, 24 * 3600e3);
    const result = await route.fn(subjectFor(actor, body), actor, body);
    return sendJson(res, 200, { result });
  }
  if (p === '/api/verify/mine' && req.method === 'GET') {
    const u = auth.requireUser(req);
    const mine = verify.records().filter(r => r.subjectId === u.id);
    return sendJson(res, 200, { records: mine.slice(-100), kycName: verify.kycName(u) });
  }
  if (p === '/api/admin/verifications' && req.method === 'GET') {
    auth.requireUser(req, ['admin']);
    const subject = url.searchParams.get('subjectId');
    const list = verify.records().filter(r => !subject || r.subjectId === subject).slice(-500).reverse();
    return sendJson(res, 200, { records: list.map(r => ({ ...r, subjectName: auth.findAccount(r.subjectId)?.name })) });
  }

  /* ----- DigiLocker ----- */
  if (p === '/api/digilocker/start' && req.method === 'GET') {
    const u = auth.requireUser(req, ['owner', 'admin']);
    limit('dl-start:' + u.id, 10, 3600e3);
    return sendJson(res, 200, { url: digilocker.startAuth(u, { returnTo: url.searchParams.get('returnTo') || undefined }) });
  }
  if (p === '/api/digilocker/callback' && req.method === 'GET') {
    const u = auth.requireUser(req);
    const state = url.searchParams.get('state') || '';
    const pending = digilocker.takeState(state, u.id);
    const back = (status, msg) => redirect(res, pending.returnTo + (pending.returnTo.includes('?') ? '&' : '?') + new URLSearchParams({ digilocker: status, ...(msg ? { msg } : {}) }));
    if (url.searchParams.get('error')) return back('denied', 'You cancelled DigiLocker consent.');
    try {
      const profile = await digilocker.fetchProfile(url.searchParams.get('code') || '', pending.verifier);
      const rec = verify.recordAadhaar(u, u, profile);
      return back(rec.status);
    } catch (e) {
      return back('error', e instanceof HttpError ? e.message : 'DigiLocker is unavailable. Please try again.');
    }
  }
  throw new HttpError(404, 'Not found');
}

async function handle(req, res) {
  const url = new URL(req.url, config.publicUrl);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname === '/sandbox/digilocker/authorize' && config.digilocker.mode !== 'live') {
      const u = auth.requireUser(req);
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
        return res.end(digilocker.sandboxAuthorizePage(Object.fromEntries(url.searchParams), u.name));
      }
      if (req.method === 'POST') { checkOrigin(req); return redirect(res, digilocker.sandboxDecide(await readForm(req))); }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
    return serveStatic(req, res, decodeURIComponent(url.pathname));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    if (url.pathname.startsWith('/api/') || req.method === 'POST') return sendJson(res, status, { error: status === 500 ? 'Something went wrong.' : e.message, code: e.code });
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
    res.end(status === 404 ? 'Not found' : e.message);
  }
}

export function createServer() {
  validateConfig();
  auth.accounts(); // seed demo accounts on first run
  return http.createServer(handle);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer();
  server.listen(config.port, () => {
    console.log(`VanYatra running at ${config.publicUrl}`);
    console.log(`Verification: ${verify.provider().name} · DigiLocker: ${config.digilocker.mode}`);
  });
}
