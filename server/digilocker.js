// DigiLocker (MeitY) integration for Aadhaar e-KYC, following the Authorized
// Partner API Specification v2.x: OAuth 2.0 authorization-code flow with PKCE.
//
// Privacy: we keep only name, date of birth, gender and the last 4 Aadhaar
// digits. The e-Aadhaar XML (photo, address, full data) is discarded right after
// parsing and the access token is revoked.
import crypto from 'node:crypto';
import { config } from './config.js';
import { toIsoDate } from './lib/validate.js';
import { HttpError } from './lib/http.js';

const DL_BASE = 'https://digilocker.meripehchaan.gov.in/public';
const pending = new Map();        // state -> { userId, verifier, purpose, returnTo, expires }
const sandboxCodes = new Map();   // code  -> { challenge, profile, expires }
const b64url = (buf) => Buffer.from(buf).toString('base64url');

setInterval(() => { const now = Date.now(); for (const m of [pending, sandboxCodes]) for (const [k, v] of m) if (v.expires < now) m.delete(k); }, 60e3).unref();

export function startAuth(user, { purpose = 'kyc', returnTo = '/#/owner/onboarding?step=2' } = {}) {
  const verifier = b64url(crypto.randomBytes(48));                       // 64 chars, within 43–128
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(24));
  pending.set(state, { userId: user.id, verifier, purpose, returnTo: returnTo.startsWith('/#/') ? returnTo : '/#/', expires: Date.now() + 10 * 60e3 });
  const params = new URLSearchParams({
    response_type: 'code', client_id: config.digilocker.clientId || 'sandbox', redirect_uri: config.digilocker.redirectUri,
    state, code_challenge: challenge, code_challenge_method: 'S256'
  });
  const authorize = config.digilocker.mode === 'live' ? `${DL_BASE}/oauth2/1/authorize` : `${config.publicUrl}/sandbox/digilocker/authorize`;
  return `${authorize}?${params}`;
}

export function takeState(state, userId) {
  const p = pending.get(state);
  pending.delete(state);
  if (!p || p.expires < Date.now()) throw new HttpError(400, 'DigiLocker session expired. Please try again.', 'state_expired');
  if (p.userId !== userId) throw new HttpError(403, 'DigiLocker session belongs to another account.', 'state_mismatch');
  return p;
}

// Returns { name, dob, gender, aadhaarLast4, eaadhaar, issuedDocs }
export async function fetchProfile(code, verifier) {
  if (config.digilocker.mode !== 'live') return sandboxExchange(code, verifier);
  const form = new URLSearchParams({
    code, grant_type: 'authorization_code', client_id: config.digilocker.clientId, client_secret: config.digilocker.clientSecret,
    redirect_uri: config.digilocker.redirectUri, code_verifier: verifier
  });
  const tokRes = await fetch(`${DL_BASE}/oauth2/1/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form, signal: AbortSignal.timeout(20000) });
  const tok = await tokRes.json().catch(() => ({}));
  if (!tokRes.ok || !tok.access_token) throw new HttpError(502, 'DigiLocker sign-in could not be completed.', tok.error || 'token_failed');
  const auth = { Authorization: `Bearer ${tok.access_token}` };
  try {
    const profile = { name: tok.name, dob: toIsoDate(tok.dob), gender: tok.gender, eaadhaar: tok.eaadhaar === 'Y', aadhaarLast4: null, issuedDocs: [] };
    if (profile.eaadhaar) {
      const xRes = await fetch(`${DL_BASE}/oauth2/3/xml/eaadhaar`, { headers: auth, signal: AbortSignal.timeout(20000) });
      if (xRes.ok) {
        const xml = await xRes.text();
        verifyHmac(xml, xRes.headers.get('hmac'));
        Object.assign(profile, parseEAadhaar(xml, profile));
      }
    }
    const fRes = await fetch(`${DL_BASE}/oauth2/2/files/issued`, { headers: auth, signal: AbortSignal.timeout(20000) });
    if (fRes.ok) profile.issuedDocs = ((await fRes.json()).items || []).map(i => ({ doctype: i.doctype, description: i.description, issuer: i.issuer }));
    return profile;
  } finally {
    // Data minimisation: we don't need ongoing access
    fetch(`${DL_BASE}/oauth2/1/revoke`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: tok.access_token }) }).catch(() => {});
  }
}

function verifyHmac(body, header) {
  if (!header) return;
  const expected = crypto.createHmac('sha256', config.digilocker.clientSecret).update(body).digest('base64');
  const a = Buffer.from(expected), b = Buffer.from(header.trim());
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(502, 'DigiLocker data failed its integrity check.', 'hmac_mismatch');
}

// Pull only what we need from the e-Aadhaar XML (<UidData uid=".."><Poi name dob gender/>)
export function parseEAadhaar(xml, fallback = {}) {
  const attr = (tag, name) => { const m = xml.match(new RegExp(`<${tag}\\b[^>]*\\b${name}="([^"]*)"`, 'i')); return m ? m[1] : null; };
  const uid = attr('UidData', 'uid') || '';
  return {
    name: attr('Poi', 'name') || fallback.name,
    dob: toIsoDate(attr('Poi', 'dob')) || fallback.dob,
    gender: attr('Poi', 'gender') || fallback.gender,
    aadhaarLast4: (uid.match(/(\d{4})$/) || [])[1] || null
  };
}

/* ---------- Test mode: local consent page that behaves like DigiLocker ---------- */
export function sandboxAuthorizePage(query, accountName) {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DigiLocker (test mode)</title>
<style>body{font-family:system-ui,sans-serif;background:#eef2f7;margin:0;display:grid;place-items:center;min-height:100vh;color:#1b2a3a}
.box{background:#fff;max-width:420px;width:calc(100% - 32px);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.12);overflow:hidden}
header{background:#3a2d8f;color:#fff;padding:16px 20px;font-weight:700}header small{display:block;font-weight:400;opacity:.85}
form{padding:20px;display:grid;gap:12px}label{display:grid;gap:4px;font-size:14px;font-weight:600}input,select{padding:10px;border:1px solid #c8d0db;border-radius:8px;font:inherit}
.note{font-size:13px;background:#fff6db;padding:10px;border-radius:8px}.row{display:flex;gap:10px}button{flex:1;padding:12px;border-radius:8px;border:0;font:inherit;font-weight:700;cursor:pointer}
.ok{background:#3a2d8f;color:#fff}.no{background:#e6e9ef}</style></head><body><div class="box">
<header>DigiLocker <small>TEST MODE — no real Aadhaar data is used</small></header>
<form method="post" action="/sandbox/digilocker/authorize">
<p class="note">VanYatra is requesting your <b>eAadhaar</b> (name, date of birth, gender, last 4 digits) and list of issued documents.</p>
<input type="hidden" name="state" value="${esc(query.state)}"><input type="hidden" name="code_challenge" value="${esc(query.code_challenge)}"><input type="hidden" name="redirect_uri" value="${esc(query.redirect_uri)}">
<label>Name on Aadhaar<input name="name" value="${esc(accountName)}" required maxlength="80"></label>
<div class="row"><label style="flex:1">Date of birth<input type="date" name="dob" value="1990-01-15" required></label>
<label style="flex:1">Gender<select name="gender"><option>M</option><option>F</option><option>T</option></select></label></div>
<label>Aadhaar (last 4 digits)<input name="last4" value="4821" pattern="[0-9]{4}" maxlength="4" required></label>
<label><span><input type="checkbox" name="noaadhaar"> Simulate: Aadhaar not linked to DigiLocker</span></label>
<div class="row"><button class="no" name="decision" value="deny">Deny</button><button class="ok" name="decision" value="allow">Allow</button></div>
</form></div></body></html>`;
}

export function sandboxDecide(form) {
  const redirectUri = config.digilocker.redirectUri;
  if (form.redirect_uri !== redirectUri) throw new HttpError(400, 'redirect_uri mismatch');
  const q = new URLSearchParams({ state: form.state || '' });
  if (form.decision !== 'allow') { q.set('error', 'access_denied'); q.set('error_description', 'User denied access'); return `${redirectUri}?${q}`; }
  const code = 'SBX_' + b64url(crypto.randomBytes(18));
  sandboxCodes.set(code, {
    challenge: form.code_challenge, expires: Date.now() + 5 * 60e3,
    profile: { name: String(form.name || '').slice(0, 80), dob: form.dob, gender: form.gender, eaadhaar: !form.noaadhaar, aadhaarLast4: form.noaadhaar ? null : String(form.last4 || '').slice(0, 4), issuedDocs: [{ doctype: 'PANCR', description: 'PAN Verification Record', issuer: 'Income Tax Department' }, { doctype: 'DRVLC', description: 'Driving License', issuer: 'MoRTH' }] }
  });
  q.set('code', code);
  return `${redirectUri}?${q}`;
}

function sandboxExchange(code, verifier) {
  const c = sandboxCodes.get(code);
  sandboxCodes.delete(code);
  if (!c || c.expires < Date.now()) throw new HttpError(400, 'DigiLocker code expired. Please try again.', 'invalid_grant');
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  if (challenge !== c.challenge) throw new HttpError(400, 'PKCE verification failed.', 'invalid_grant');
  return c.profile;
}
