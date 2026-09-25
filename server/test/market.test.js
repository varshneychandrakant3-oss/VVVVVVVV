// Marketplace API: the server decides every verification status.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vanyatra-market-'));
process.env.DATA_DIR = dataDir;
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret';
process.env.VERIFY_PROVIDER = 'sandbox';
process.env.DIGILOCKER_MODE = 'sandbox';

let server, base, market;
before(async () => {
  const { createServer } = await import('../index.js');
  const { config } = await import('../config.js');
  market = await import('../market.js');
  server = createServer();
  await new Promise(r => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
  config.publicUrl = base;
});
after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
beforeEach(async () => (await import('../lib/ratelimit.js')).resetLimits());

function client() {
  let jar = '';
  const req = async (method, p, body) => {
    const res = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(jar ? { Cookie: jar } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie'); if (sc) jar = sc.split(';')[0];
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  return { get: (p) => req('GET', p), post: (p, b = {}) => req('POST', p, b), patch: (p, b) => req('PATCH', p, b), put: (p, b) => req('PUT', p, b) };
}
const login = async (email) => { const c = client(); assert.equal((await c.post('/api/auth/login', { email, password: 'demo1234' })).status, 200); return c; };

test('public view hides registry data, documents and unpublished vans', async () => {
  const r = await client().get('/api/market');
  assert.ok(r.json.vans.length > 0);
  assert.ok(r.json.vans.every(v => v.status === 'published'));
  assert.ok(r.json.vans.every(v => !('regNo' in v) && !('registry' in v) && !('steps' in v)));
  assert.equal(r.json.documents.length, 0);
  // Owner badge data only: no payout/KYC details
  assert.ok(Object.values(r.json.owners).every(o => !o.payout?.data && !o.kyc?.data));
  // Host names are shared, but never emails or anyone who isn't hosting a listed van
  assert.ok(r.json.people.length > 0 && r.json.people.every(p => p.name && !p.email && p.role === 'owner'));
});

test('owners only see and change their own data; admin routes are admin-only', async () => {
  const meera = await login('meera@vanyatra.in');
  const view = (await meera.get('/api/market')).json;
  assert.ok(view.documents.every(d => d.ownerId === 'u_owner2'));
  assert.equal((await meera.patch('/api/owner/vans/v1', { name: 'Hijacked' })).status, 403);
  assert.equal((await meera.post('/api/owner/vans/v1/status', { status: 'paused' })).status, 403);
  const doc = view.documents.find(d => d.status === 'pending' || d.status === 'action_required') || view.documents[0];
  assert.equal((await meera.post(`/api/admin/documents/${doc.id}/decision`, { status: 'verified' })).status, 403);
  const traveller = await login('traveller@vanyatra.in');
  assert.equal((await traveller.post('/api/owner/vans')).status, 403);
});

test('a van can only go live after the server has verified every step', async () => {
  const owner = await login('owner@vanyatra.in');
  const admin = await login('admin@vanyatra.in');
  const { van } = (await owner.post('/api/owner/vans')).json;

  // Registry check creates RC / PUC / permit / insurance / ownership records on the server
  const rc = await owner.post('/api/verify/vehicle', { regNo: 'HP01CD5678', relation: 'owner', vanId: van.id, consent: true });
  assert.equal(rc.json.result.status, 'verified');
  let docs = (await owner.get('/api/market')).json.documents.filter(d => d.vanId === van.id);
  const byType = Object.fromEntries(docs.map(d => [d.type, d]));
  assert.equal(byType.rc.status, 'verified');
  assert.equal(byType.puc.status, 'verified');
  assert.equal(byType.ownership_rc.status, 'verified');
  assert.equal(byType.insurance.status, 'pending', 'rental cover still needs a person');

  // Content
  const photos = ['photo-1584198775168-cd76729ac207', 'photo-1773123441753-e87f821ec76d', 'photo-1645099815537-cea03d831528', 'photo-1558724065-2f80d1ae6002'];
  assert.equal((await owner.patch(`/api/owner/vans/${van.id}`, { photos: ['<script>'] })).status, 400);
  const upd = await owner.patch(`/api/owner/vans/${van.id}`, {
    name: 'Kangra Camper', description: 'A comfortable camper for the Kangra valley with a full kitchen, solar power and a proper bed.',
    destinationId: 'himachal', photos, beds: '1 double + 2 bunks', pricePerNight: 6000, deposit: 15000,
    pickup: { city: 'Dharamshala', address: 'Van base, McLeod Ganj', time: '11:00', returnTime: '10:00', lat: 32.2, lng: 76.3 }
  });
  assert.equal(upd.json.van.verification.photos, 'verified');
  assert.equal(upd.json.van.verification.listing, 'verified');

  // Documents that need a person
  assert.equal((await owner.post(`/api/owner/vans/${van.id}/documents`, { type: 'fitness', fileName: 'f.pdf', expiry: '2001-01-01' })).status, 400);
  const future = new Date(Date.now() + 400 * 864e5).toISOString().slice(0, 10);
  for (const type of ['rent_cab_licence', 'fitness']) assert.equal((await owner.post(`/api/owner/vans/${van.id}/documents`, { type, fileName: type + '.pdf', expiry: future })).status, 201);
  assert.equal((await owner.post(`/api/owner/vans/${van.id}/documents`, { type: 'insurance', fileName: 'schedule.pdf' })).status, 201);
  assert.equal((await owner.post(`/api/owner/vans/${van.id}/documents`, { type: 'inspection', fileName: 'inspection.pdf', expiry: future })).status, 201);

  // Can't publish or approve early
  assert.equal((await owner.post(`/api/owner/vans/${van.id}/status`, { status: 'published' })).status, 400);
  assert.equal((await owner.post(`/api/owner/vans/${van.id}/submit`)).status, 200);
  assert.equal((await owner.patch(`/api/owner/vans/${van.id}`, { name: 'Edited during review' })).status, 409);
  assert.equal((await admin.post(`/api/admin/vans/${van.id}/review`, { approve: true })).status, 400, 'pending docs block approval');

  // Admin clears the manual documents, then approves
  docs = (await admin.get('/api/market')).json.documents.filter(d => d.vanId === van.id && d.status === 'pending');
  assert.equal(docs.length, 4);
  for (const d of docs) assert.equal((await admin.post(`/api/admin/documents/${d.id}/decision`, { status: 'verified' })).status, 200);
  assert.equal((await admin.post(`/api/admin/vans/${van.id}/review`, { approve: true })).status, 200);
  assert.equal((await owner.post(`/api/owner/vans/${van.id}/status`, { status: 'published' })).status, 200);
  const pub = (await client().get('/api/market')).json.vans.find(v => v.id === van.id);
  assert.equal(pub.name, 'Kangra Camper');
  // Owner was notified on the server
  assert.ok((await owner.get('/api/market')).json.notifications.some(n => /approved/.test(n.text)));
});

test('expired documents suspend a listing; a VAHAN re-check plus review reinstates it', async () => {
  const s = market.state();
  const puc = s.documents.find(d => d.vanId === 'v2' && d.type === 'puc');
  Object.assign(puc, { status: 'verified', expiry: '2020-01-01' });
  market.runExpiryJob();
  assert.equal(market.getVan('v2').status, 'suspended');
  assert.equal(puc.status, 'action_required');

  const admin = await login('admin@vanyatra.in');
  const r = await admin.post('/api/admin/vans/v2/recheck');
  assert.equal(r.status, 200);
  assert.equal(s.documents.find(d => d.vanId === 'v2' && d.type === 'puc').status, 'verified');
  // Registry shows a different policy number → rental cover must be re-confirmed first
  const ins = s.documents.find(d => d.vanId === 'v2' && d.type === 'insurance');
  assert.equal(ins.status, 'pending');
  assert.equal(market.getVan('v2').status, 'suspended');
  await admin.post(`/api/admin/documents/${ins.id}/decision`, { status: 'verified' });
  assert.equal(market.getVan('v2').status, 'published');
});

test('KYC status comes from government checks, not from the browser', async () => {
  const karan = await login('karan@vanyatra.in');
  // There is no endpoint to set KYC directly; a PAN check updates it
  await karan.post('/api/verify/pan', { pan: 'BQRPS5521L', name: 'Karan Singh', dob: '1988-02-10', consent: true });
  const view = (await karan.get('/api/market')).json;
  const pan = view.documents.find(d => d.type === 'pan' && !d.vanId);
  assert.equal(pan.status, 'verified');
  assert.equal(pan.check.source, 'Income Tax Department (PAN)');
  // GSTIN must be verified before business details can be saved
  const bad = await karan.post('/api/owner/profile', { business: { business: 'Desert Rover Co.', gstin: '08ABCDE1234F1Z5', address: 'Jaipur', city: 'Jaipur', state: 'RJ', pin: '302001' } });
  assert.equal(bad.status, 400);
});

test('suspending a user ends their sessions and pauses their listings', async () => {
  const tenzin = await login('tenzin@vanyatra.in');
  const admin = await login('admin@vanyatra.in');
  assert.equal((await admin.post('/api/admin/users/u_owner3/status', { status: 'suspended', note: 'test' })).status, 200);
  assert.equal((await tenzin.get('/api/auth/me')).json.user, null);
  assert.ok(market.state().vans.filter(v => v.ownerId === 'u_owner3').every(v => v.status !== 'published'));
  assert.equal((await client().post('/api/auth/login', { email: 'tenzin@vanyatra.in', password: 'demo1234' })).status, 403);
  await admin.post('/api/admin/users/u_owner3/status', { status: 'active' });
});
