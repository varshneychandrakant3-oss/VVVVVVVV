// End-to-end API tests against a real server instance in test mode.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vanyatra-test-'));
process.env.DATA_DIR = dataDir;
process.env.PORT = '0';
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret';
process.env.VERIFY_PROVIDER = 'sandbox';
process.env.DIGILOCKER_MODE = 'sandbox';

let server, base;
before(async () => {
  const { createServer } = await import('../index.js');
  const { config } = await import('../config.js');
  server = createServer();
  await new Promise(r => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
  config.publicUrl = base;
  config.digilocker.redirectUri = base + '/api/digilocker/callback';
});
after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
// Each test starts with fresh rate-limit windows (the limits themselves are tested below)
beforeEach(async () => (await import('../lib/ratelimit.js')).resetLimits());

test('login is rate limited per email', async () => {
  let last;
  for (let i = 0; i < 9; i++) last = await client().post('/api/auth/login', { email: 'tenzin@vanyatra.in', password: 'wrong-password1' });
  assert.equal(last.status, 429);
});

// Minimal cookie-keeping client
function client() {
  let jar = '';
  const req = async (method, p, body, headers = {}) => {
    const res = await fetch(base + p, {
      method, redirect: 'manual',
      headers: { ...(body !== undefined ? { 'Content-Type': typeof body === 'string' ? 'application/x-www-form-urlencoded' : 'application/json' } : {}), ...(jar ? { Cookie: jar } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
    });
    const sc = res.headers.get('set-cookie');
    if (sc) jar = sc.split(';')[0];
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, json, text, location: res.headers.get('location'), headers: res.headers };
  };
  return { get: (p, h) => req('GET', p, undefined, h), post: (p, b, h) => req('POST', p, b, h) };
}
const login = async (email) => { const c = client(); const r = await c.post('/api/auth/login', { email, password: 'demo1234' }); assert.equal(r.status, 200); return c; };

test('static allow-list never exposes secrets or server code', async () => {
  const c = client();
  assert.equal((await c.get('/')).status, 200);
  assert.equal((await c.get('/assets/js/app.js')).status, 200);
  for (const p of ['/.env', '/.env.example', '/server/index.js', '/data/accounts.json', '/package.json', '/assets/../server/config.js', '/%2e%2e/server/config.js']) {
    assert.equal((await c.get(p)).status, 404, p);
  }
  const home = await c.get('/');
  assert.match(home.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});

test('auth: login, wrong password, me, logout', async () => {
  const c = client();
  assert.equal((await c.post('/api/auth/login', { email: 'owner@vanyatra.in', password: 'nope' })).status, 401);
  const ok = await c.post('/api/auth/login', { email: 'owner@vanyatra.in', password: 'demo1234' });
  assert.equal(ok.json.user.role, 'owner');
  assert.equal((await c.get('/api/auth/me')).json.user.email, 'owner@vanyatra.in');
  await c.post('/api/auth/logout', {});
  assert.equal((await c.get('/api/auth/me')).json.user, null);
});

test('password hashes are scrypt and never returned', async () => {
  const accounts = JSON.parse(fs.readFileSync(path.join(dataDir, 'accounts.json'), 'utf8'));
  assert.ok(accounts.every(a => a.password.startsWith('scrypt$')));
  const c = await login('owner@vanyatra.in');
  assert.equal((await c.get('/api/auth/me')).json.user.password, undefined);
});

test('verification requires sign-in, the right role and consent', async () => {
  assert.equal((await client().post('/api/verify/pan', { pan: 'ABCDE1234F', dob: '1990-01-15', consent: true })).status, 401);
  const traveller = await login('traveller@vanyatra.in');
  assert.equal((await traveller.post('/api/verify/pan', { pan: 'ABCDE1234F', dob: '1990-01-15', consent: true })).status, 403);
  const owner = await login('owner@vanyatra.in');
  const r = await owner.post('/api/verify/pan', { pan: 'ABCDE1234F', dob: '1990-01-15' });
  assert.equal(r.status, 400);
  assert.equal(r.json.code, 'consent_required');
});

test('cross-site POSTs are blocked', async () => {
  const c = client();
  const r = await c.post('/api/auth/login', { email: 'owner@vanyatra.in', password: 'demo1234' }, { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('PAN outcomes', async () => {
  const c = await login('owner@vanyatra.in');
  const v = await c.post('/api/verify/pan', { pan: 'abcde1234f', name: 'Rohan Mehta', dob: '1990-01-15', consent: true });
  assert.equal(v.json.result.status, 'verified');
  assert.equal(v.json.result.data.panMasked, 'XXXXX1234F');
  assert.ok(!JSON.stringify(v.json).includes('ABCDE1234F'), 'full PAN must not be stored or returned');
  assert.equal((await c.post('/api/verify/pan', { pan: 'ABCDE1234X', name: 'Rohan Mehta', dob: '1990-01-15', consent: true })).json.result.status, 'failed');
  assert.equal((await c.post('/api/verify/pan', { pan: 'ABCDZ1234F', name: 'Rohan Mehta', dob: '1990-01-15', consent: true })).json.result.status, 'failed');
  assert.equal((await c.post('/api/verify/pan', { pan: 'BAD', dob: '1990-01-15', consent: true })).status, 400);
});

test('vehicle registry: owner match, expired insurance, mismatch, blacklist, private, source down', async () => {
  const c = await login('owner@vanyatra.in');
  const check = async (regNo, relation = 'owner') => (await c.post('/api/verify/vehicle', { regNo, relation, consent: true })).json.result;
  const ok = await check('HP01AB1234');
  assert.equal(ok.status, 'verified');
  assert.equal(ok.data.docs.insurance.status, 'valid');
  assert.ok(ok.data.docs.puc.validUpto);
  assert.equal((await check('HP01AB0000')).status, 'failed');
  const ins = await check('HP01AB1111');
  assert.equal(ins.status, 'failed');
  assert.equal(ins.data.docs.insurance.status, 'expired');
  assert.equal((await check('HP01AB2222')).status, 'failed');
  assert.equal((await check('HP01AB2222', 'authorised')).status, 'review');
  assert.equal((await check('HP01AB3333')).status, 'failed');
  assert.equal((await check('HP01AB4444')).status, 'review');
  assert.equal((await check('HP01AB9999')).status, 'review', 'source down falls back to manual review');
});

test('GSTIN, bank and driving licence', async () => {
  const c = await login('owner@vanyatra.in');
  const { gstinCheckChar } = await import('../lib/validate.js');
  const g = '02ABCDE1234F1Z'; const gstin = g + gstinCheckChar(g);
  const gv = await c.post('/api/verify/gstin', { gstin, businessName: 'Mehta Mountain Vans', consent: true });
  assert.equal(gv.json.result.data.gstStatus, 'Active');
  assert.equal((await c.post('/api/verify/gstin', { gstin: '02ABCDE1234F1ZZ', consent: true })).status, 400);
  const b = await c.post('/api/verify/bank', { account: '123456789012', ifsc: 'HDFC0001234', holder: 'Rohan Mehta', consent: true });
  assert.equal(b.json.result.status, 'verified');
  assert.equal(b.json.result.data.accountLast4, '9012');
  assert.equal((await c.post('/api/verify/bank', { account: '123456782222', ifsc: 'HDFC0001234', holder: 'Rohan Mehta', consent: true })).json.result.status, 'failed');
  const t = await login('traveller@vanyatra.in');
  const dl = await t.post('/api/verify/dl', { dlNumber: 'DL0420110012345', dob: '1992-04-01', name: 'Priya Sharma', consent: true });
  assert.equal(dl.json.result.status, 'verified');
  assert.equal((await t.post('/api/verify/dl', { dlNumber: 'DL0420110011111', dob: '1992-04-01', name: 'Priya Sharma', consent: true })).json.result.status, 'failed');
});

test('DigiLocker sandbox flow with PKCE and state binding', async () => {
  const c = await login('karan@vanyatra.in');
  const start = await c.get('/api/digilocker/start?returnTo=/%23/owner/onboarding%3Fstep%3D2');
  const authUrl = new URL(start.json.url);
  assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');
  const page = await c.get(authUrl.pathname + authUrl.search);
  assert.equal(page.status, 200);
  assert.match(page.text, /TEST MODE/);
  const form = new URLSearchParams({ state: authUrl.searchParams.get('state'), code_challenge: authUrl.searchParams.get('code_challenge'), redirect_uri: authUrl.searchParams.get('redirect_uri'), name: 'Karan Singh', dob: '1988-02-10', gender: 'M', last4: '9034', decision: 'allow' });
  const decide = await c.post('/sandbox/digilocker/authorize', form.toString());
  assert.equal(decide.status, 302);
  const cb = new URL(decide.location);
  const done = await c.get(cb.pathname + cb.search);
  assert.equal(done.status, 302);
  assert.match(done.location, /digilocker=verified/);
  // Replaying the same state must fail
  const replay = await c.get(cb.pathname + cb.search);
  assert.equal(replay.status, 400);
  const mine = await c.get('/api/verify/mine');
  const aad = mine.json.records.find(r => r.type === 'aadhaar');
  assert.equal(aad.data.aadhaarLast4, '9034');
  assert.equal(mine.json.kycName, 'Karan Singh');
  // Another user cannot complete someone else's DigiLocker session
  const other = await login('owner@vanyatra.in');
  const s2 = new URL((await c.get('/api/digilocker/start')).json.url);
  const cb2 = await other.get('/api/digilocker/callback?code=x&state=' + s2.searchParams.get('state'));
  assert.equal(cb2.status, 403);
});

test('admin can list records; owners cannot', async () => {
  const owner = await login('owner@vanyatra.in');
  assert.equal((await owner.get('/api/admin/verifications')).status, 403);
  const admin = await login('admin@vanyatra.in');
  const r = await admin.get('/api/admin/verifications');
  assert.ok(r.json.records.length > 0);
  assert.ok(r.json.records[0].subjectName);
});

test('rate limits cap paid checks per user', async () => {
  const c = await login('meera@vanyatra.in');
  let last;
  for (let i = 0; i < 11; i++) last = await c.post('/api/verify/vehicle', { regNo: 'KL07AB12' + String(10 + i), consent: true });
  assert.equal(last.status, 429);
});
