// Server-side marketplace state for everything that affects trust:
// vans (listing + verification), documents, owner verification steps,
// admin decisions and owner notifications.
//
// The browser can read this and *request* changes; every status is decided
// here, so a user can't mark their own documents or listings as verified.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from './config.js';
import { read, write, appendLog } from './lib/store.js';
import { HttpError } from './lib/http.js';
import { findAccount, accounts } from './lib/auth.js';

/* ---------- Shared config + demo seed, loaded from the web app's own files ---------- */
const browser = (() => {
  const ctx = { console, Intl, Date, Math, JSON };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['assets/js/config.js', 'assets/js/seed.js', 'assets/js/db.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return ctx.App;
})();
export const C = browser.C;
const STEP_IDS = ['account', 'kyc', 'business', 'ownership', 'registration', 'insurance', 'inspection', 'photos', 'listing', 'payout', 'review'];
const OWNER_STEPS = ['account', 'kyc', 'business', 'payout'];

// Bump when the demo data gains new vans/owners; existing servers get them merged in
const SEED_VERSION = 2;

function demoSeed() {
  const seed = browser.buildSeed();
  // Demo insurance that's already verified counts as rental cover already checked
  for (const d of seed.documents) if (d.type === 'insurance' && d.status === 'verified') d.coverApproved = true;
  return seed;
}

export function state() {
  let s = read('market', null);
  if (!s) {
    const seed = demoSeed();
    s = { version: 1, seedVersion: SEED_VERSION, vans: seed.vans, documents: seed.documents, owners: seed.owners, notifications: [] };
    write('market', s);
  } else if ((s.seedVersion || 1) < SEED_VERSION) {
    // Add demo vans, documents and owners this server doesn't have yet; never overwrite real data
    const seed = demoSeed();
    const vanIds = new Set(s.vans.map(v => v.id));
    const docKeys = new Set(s.documents.map(d => `${d.ownerId}|${d.vanId || ''}|${d.type}`));
    for (const v of seed.vans) {
      if (!vanIds.has(v.id)) s.vans.push(v);
      else {
        // Refresh photos on untouched demo vans (they used to have only 4)
        const cur = s.vans.find(x => x.id === v.id);
        if (cur.ownerId === v.ownerId && cur.photos.length < 5 && cur.photos.every(p => p.startsWith('photo-'))) cur.photos = v.photos;
      }
    }
    for (const d of seed.documents) {
      const key = `${d.ownerId}|${d.vanId || ''}|${d.type}`;
      if (!docKeys.has(key) && (!d.vanId || !vanIds.has(d.vanId))) { s.documents.push({ ...d, id: uid('doc') }); docKeys.add(key); }
    }
    for (const [id, o] of Object.entries(seed.owners)) if (!s.owners[id]) s.owners[id] = o;
    s.seedVersion = SEED_VERSION;
    write('market', s);
  }
  return s;
}
const persist = () => write('market', state());
const now = () => new Date().toISOString();
const uid = (p) => p + crypto.randomBytes(6).toString('hex');
const today = () => new Date().toISOString().slice(0, 10);
const daysUntil = (iso) => Math.floor((Date.parse(iso) - Date.parse(today())) / 86400000);

export function audit(actorId, action, target) {
  appendLog('audit', { at: now(), actor: actorId, action, target });
}
export function notify(userId, text, link = '') {
  const s = state();
  s.notifications.unshift({ id: uid('sn'), userId, text, link, at: now(), read: false });
  s.notifications = s.notifications.slice(0, 2000);
}
const notifyAdmins = (text, link) => accounts().filter(a => a.role === 'admin').forEach(a => notify(a.id, text, link));

/* ---------- Lookups & access ---------- */
export const getVan = (id) => state().vans.find(v => v.id === id);
export function ownVan(user, id) {
  const van = getVan(id);
  if (!van) throw new HttpError(404, 'Van not found.');
  if (user.role !== 'admin' && van.ownerId !== user.id) throw new HttpError(403, 'This isn’t your van.');
  return van;
}
const docsFor = (f) => state().documents.filter(d => Object.entries(f).every(([k, v]) => (v === undefined ? !d[k] : d[k] === v)));

/* ---------- Status rules ---------- */
export function rollup(statuses) {
  if (statuses.includes('rejected')) return 'rejected';
  if (statuses.includes('action_required')) return 'action_required';
  if (statuses.includes('pending')) return 'pending';
  if (statuses.length && statuses.every(s => s === 'verified')) return 'verified';
  return 'not_started';
}
const fromOutcome = (o) => (o === 'verified' ? 'verified' : o === 'review' ? 'pending' : 'action_required');

// Complete only when every required document exists
function requiredStatus(docs, defs) {
  const req = defs.filter(d => d.required);
  const have = docs.filter(d => req.some(r => r.type === d.type));
  if (!have.length) return null;
  const s = rollup(have.map(d => d.status));
  return have.length < req.length && ['verified', 'pending'].includes(s) ? 'not_started' : s;
}

export function recomputeOwner(ownerId) {
  const o = state().owners[ownerId] ||= {};
  const kycDocs = docsFor({ ownerId, vanId: undefined }).filter(d => ['aadhaar', 'pan', 'selfie'].includes(d.type));
  const kyc = requiredStatus(kycDocs, [{ type: 'aadhaar', required: true }, { type: 'pan', required: true }, { type: 'selfie', required: true }]);
  if (kyc) o.kyc = { ...(o.kyc || {}), status: kyc };
}

export function recomputeVan(van) {
  const docs = docsFor({ vanId: van.id });
  const own = docs.filter(d => d.type.startsWith('ownership'));
  if (own.length) van.verification.ownership = rollup(own.map(d => d.status));
  const reg = requiredStatus(docs, C.registrationDocs);
  if (reg) van.verification.registration = reg;
  const ins = requiredStatus(docs, C.insuranceDocs);
  if (ins) van.verification.insurance = ins;
  const insp = docs.filter(d => d.type === 'inspection');
  if (insp.length) van.verification.inspection = rollup(insp.map(d => d.status));
  // Reinstate a listing that was suspended only because documents lapsed
  if (van.status === 'suspended' && van.suspendedFor === 'documents' && ['ownership', 'registration', 'insurance', 'inspection'].every(k => van.verification[k] === 'verified')) {
    van.status = 'published'; delete van.suspendedFor;
    notify(van.ownerId, `${van.name} is live again — all documents are valid.`, '#/owner/vans');
    audit('system', 'listing.reinstate', `${van.id} ${van.name} — documents valid`);
  }
}

export function stepStatuses(van) {
  const o = state().owners[van?.ownerId] || {};
  return Object.fromEntries(STEP_IDS.map(k => [k, OWNER_STEPS.includes(k) ? (o[k]?.status || 'not_started') : (van?.verification?.[k] || 'not_started')]));
}

function upsertDoc(ownerId, vanId, type, label, fields) {
  const s = state();
  let d = s.documents.find(x => x.ownerId === ownerId && (x.vanId || undefined) === vanId && x.type === type);
  if (!d) { d = { id: uid('doc'), ownerId, ...(vanId ? { vanId } : {}), type, label, submittedAt: now() }; s.documents.push(d); }
  Object.assign(d, { reminded: false }, fields);
  return d;
}

/* ---------- Hooks: results of government checks update the records ---------- */
export function onVerification(rec, actor) {
  const s = state();
  const check = { source: rec.source, checkedAt: rec.checkedAt, outcome: rec.status, recordId: rec.id };
  const owner = s.owners[rec.subjectId] ||= {};
  if (rec.type === 'aadhaar') {
    upsertDoc(rec.subjectId, undefined, 'aadhaar', 'Aadhaar (via DigiLocker)', { number: rec.ref, status: fromOutcome(rec.status), note: noteOf(rec), check });
    recomputeOwner(rec.subjectId);
  } else if (rec.type === 'pan') {
    upsertDoc(rec.subjectId, undefined, 'pan', 'PAN', { number: rec.ref, status: fromOutcome(rec.status), note: noteOf(rec), check });
    recomputeOwner(rec.subjectId);
  } else if (rec.type === 'gstin') {
    owner.gst = { gstin: rec.ref, status: rec.status, legalName: rec.data.legalName, recordId: rec.id };
    if (owner.business?.data?.gstin === rec.ref) owner.business.status = fromOutcome(rec.status);
  } else if (rec.type === 'bank') {
    owner.payout = { status: fromOutcome(rec.status), note: noteOf(rec), data: { bank: rec.data.bankName, last4: rec.data.accountLast4, ifsc: rec.data.ifsc, holder: rec.data.nameAtBank }, check };
  } else if (rec.type === 'vehicle' && rec.vanId) {
    const van = getVan(rec.vanId);
    if (van && van.ownerId === rec.subjectId) applyVehicle(van, rec, check);
  }
  persist();
}
const noteOf = (rec) => rec.reasons.filter(x => x.level !== 'ok').map(x => x.text).join(' ');

function applyVehicle(van, rec, check) {
  const d = rec.data;
  van.regNo = rec.ref;
  if (d.relation) van.relation = d.relation;
  van.registry = { ...d, status: rec.status, checkedAt: rec.checkedAt, source: rec.source, reasons: rec.reasons };
  if (!d.docs) { recomputeVan(van); return; }
  const docs = d.docs;
  const st = (x) => (x === 'valid' ? 'verified' : 'action_required');
  if (d.ownerMatch) {
    const ok = d.ownerMatch === 'match' && !d.blacklisted && d.rcStatus === 'ACTIVE';
    upsertDoc(van.ownerId, van.id, 'ownership_rc', `Ownership (VAHAN: ${d.owner})`, {
      number: rec.ref, check, status: ok ? 'verified' : d.ownerMatch === 'review' && !d.blacklisted ? 'pending' : 'action_required',
      note: ok ? '' : d.blacklisted ? 'Vehicle is blacklisted in VAHAN.' : d.ownerMatch === 'review' ? 'Registered owner differs — NOC under review.' : 'Registered owner doesn’t match your verified identity.'
    });
  }
  upsertDoc(van.ownerId, van.id, 'rc', 'Registration Certificate (RC)', {
    number: rec.ref, expiry: docs.rc.validUpto, check,
    status: docs.rc.status !== 'valid' ? 'action_required' : d.isCommercial ? 'verified' : 'action_required',
    note: docs.rc.status !== 'valid' ? 'RC is not active in VAHAN.' : d.isCommercial ? '' : 'Registered as a private vehicle — self-drive rental needs commercial registration.'
  });
  upsertDoc(van.ownerId, van.id, 'puc', 'Pollution Under Control (PUC) certificate', { number: docs.puc.number, expiry: docs.puc.validUpto, check, status: st(docs.puc.status), note: docs.puc.status === 'valid' ? '' : 'PUC expired or missing in VAHAN.' });
  if (docs.permit.validUpto) upsertDoc(van.ownerId, van.id, 'tourist_permit', 'All India Tourist Permit (for interstate trips)', { number: docs.permit.type, expiry: docs.permit.validUpto, check, status: st(docs.permit.status), note: '' });
  // VAHAN proves the policy is valid, not that it covers self-drive rental. A person
  // checks the schedule once; later re-checks keep that approval for the same policy.
  const prev = docsFor({ vanId: van.id }).find(x => x.type === 'insurance');
  const approved = prev && prev.status === 'verified' && prev.coverApproved && prev.number === docs.insurance.policyNumber;
  upsertDoc(van.ownerId, van.id, 'insurance', 'Commercial comprehensive insurance (self-drive rental cover)', {
    number: docs.insurance.policyNumber, insurer: docs.insurance.company, expiry: docs.insurance.validUpto, check,
    status: docs.insurance.status !== 'valid' ? 'action_required' : approved ? 'verified' : 'pending',
    note: docs.insurance.status !== 'valid' ? 'Insurance expired or missing in VAHAN.' : approved ? '' : 'Valid in VAHAN. Upload the policy schedule so we can confirm self-drive rental cover.'
  });
  recomputeVan(van);
}

/* ---------- Owner actions ---------- */
const VAN_TYPES = ['Campervan', 'Motorhome', 'Pop-top', '4x4 Overlander', 'Caravan'];
const AMENITY_IDS = new Set(['kitchen', 'fridge', 'shower', 'toilet', 'ac', 'heater', 'solar', 'inverter', 'wifi', 'awning', 'bikerack', 'childseat', 'pets', 'gps', 'campingchairs', 'watertank']);
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const num = (v, min, max) => { const n = Number(v); if (!Number.isFinite(n)) throw new HttpError(400, 'Invalid number.'); return Math.min(max, Math.max(min, n)); };
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const PHOTO_RE = /^(photo-[0-9]{10,16}-[0-9a-f]{6,16}|data:image\/jpeg;base64,[A-Za-z0-9+/=]+)$/;

export function updateOwnerProfile(user, body) {
  const s = state();
  const o = s.owners[user.id] ||= {};
  if (body.accountVerified === true) o.account = { status: 'verified' };
  if (body.business) {
    const b = body.business;
    const data = { kind: b.kind === 'company' ? 'company' : 'individual', business: str(b.business, 80), gstin: str(b.gstin, 15).toUpperCase(), phone: str(b.phone, 20), emergency: str(b.emergency, 80), address: str(b.address, 300), city: str(b.city, 60), state: str(b.state, 60), pin: str(b.pin, 6) };
    if (!data.business || !data.address || !/^\d{6}$/.test(data.pin)) throw new HttpError(400, 'Please complete your business details.');
    let status = 'verified'; // self-declared when there's no GSTIN (below the GST threshold)
    if (data.gstin) {
      const g = o.gst && o.gst.gstin === data.gstin ? o.gst : null;
      if (!g) throw new HttpError(400, 'Verify your GSTIN before saving.');
      if (g.status === 'failed') throw new HttpError(400, 'This GSTIN failed verification.');
      status = fromOutcome(g.status);
    }
    o.business = { status, data };
  }
  persist();
}

export function addSelfie(user, fileName) {
  upsertDoc(user.id, undefined, 'selfie', 'Live selfie', { fileName: str(fileName, 120), status: 'pending', note: '', submittedAt: now() });
  recomputeOwner(user.id);
  notifyAdmins(`${user.name} submitted a selfie for KYC review.`, '#/admin/verifications');
  persist();
}

export function createVan(user) {
  const v = {
    id: uid('v'), ownerId: user.id, name: '', type: 'Campervan', destinationId: 'goa', city: '', sleeps: 4, seats: 4,
    make: '', model: '', year: new Date().getFullYear(), fuel: 'Diesel', transmission: 'Manual', amenities: [], familyFriendly: false, petFriendly: false,
    instantBook: false, cancellation: 'moderate', pricePerNight: 5000, weekendPrice: 5500, cleaningFee: 1200, deposit: 15000, minNights: 2,
    discounts: { weekly: 10, monthly: 20 }, kmPerDay: 250, extraKmFee: 12, beds: '', length: '', licence: 'Standard LMV car licence', mileage: '',
    pickup: { city: '', address: '', lat: 0, lng: 0, time: '11:00', returnTime: '10:00' }, rules: ['No smoking inside the van', 'Return with the same fuel level'],
    description: '', photos: [], blocked: [], status: 'draft',
    verification: { ownership: 'not_started', registration: 'not_started', insurance: 'not_started', inspection: 'not_started', photos: 'not_started', listing: 'not_started', review: 'not_started' },
    views: 0, createdAt: now()
  };
  state().vans.push(v);
  audit(user.id, 'listing.create', v.id);
  persist();
  return v;
}

export function updateVan(user, van, body) {
  if (van.status === 'in_review') throw new HttpError(409, 'This listing is under review. Wait for the decision before editing.');
  const set = {};
  if ('name' in body) set.name = str(body.name, 40);
  if ('description' in body) set.description = str(body.description, 2000);
  if ('type' in body) { if (!VAN_TYPES.includes(body.type)) throw new HttpError(400, 'Unknown van type.'); set.type = body.type; }
  for (const k of ['make', 'model', 'beds', 'length', 'licence', 'mileage', 'city', 'rcName', 'chassis']) if (k in body) set[k] = str(body[k], 80);
  for (const [k, min, max] of [['year', 1990, 2100], ['sleeps', 1, 10], ['seats', 1, 12], ['pricePerNight', 500, 200000], ['weekendPrice', 500, 200000], ['cleaningFee', 0, 50000], ['deposit', 0, 500000], ['minNights', 1, 30], ['kmPerDay', 0, 2000], ['extraKmFee', 0, 1000]]) if (k in body) set[k] = num(body[k], min, max);
  if ('transmission' in body) set.transmission = body.transmission === 'Automatic' ? 'Automatic' : 'Manual';
  if ('fuel' in body) set.fuel = ['Diesel', 'Petrol', 'CNG', 'Electric'].includes(body.fuel) ? body.fuel : 'Diesel';
  if ('destinationId' in body) set.destinationId = str(body.destinationId, 40);
  if ('amenities' in body) set.amenities = [...new Set([].concat(body.amenities || []).filter(a => AMENITY_IDS.has(a)))];
  if ('familyFriendly' in body) set.familyFriendly = !!body.familyFriendly;
  if ('instantBook' in body) set.instantBook = !!body.instantBook;
  if ('cancellation' in body) set.cancellation = ['flexible', 'moderate', 'strict'].includes(body.cancellation) ? body.cancellation : 'moderate';
  if ('discounts' in body) set.discounts = { weekly: num(body.discounts.weekly, 0, 50), monthly: num(body.discounts.monthly, 0, 60) };
  if ('rules' in body) set.rules = [].concat(body.rules || []).map(r => str(r, 200)).filter(Boolean).slice(0, 20);
  if ('relation' in body) set.relation = ['owner', 'company', 'authorised'].includes(body.relation) ? body.relation : 'owner';
  if ('pickup' in body) {
    const p = body.pickup || {};
    set.pickup = { ...van.pickup, city: str(p.city, 60), address: str(p.address, 200), time: str(p.time, 5), returnTime: str(p.returnTime, 5), lat: num(p.lat ?? van.pickup.lat, -90, 90), lng: num(p.lng ?? van.pickup.lng, -180, 180) };
  }
  if ('photos' in body) {
    const photos = [].concat(body.photos || []);
    if (photos.length > 12) throw new HttpError(400, 'Up to 12 photos.');
    if (!photos.every(p => typeof p === 'string' && p.length < 600000 && PHOTO_RE.test(p))) throw new HttpError(400, 'Photos must be JPEG images.');
    set.photos = photos;
  }
  Object.assign(van, set);
  van.petFriendly = (van.amenities || []).includes('pets');
  // Content steps are complete when the required fields are filled in
  if (van.photos.length >= 4 && van.beds && van.sleeps && van.seats) van.verification.photos = 'verified';
  else if ('photos' in body) van.verification.photos = 'action_required';
  if (van.name && van.description.length >= 60 && van.destinationId && van.pickup.city && van.pickup.address && van.pricePerNight) van.verification.listing = 'verified';
  persist();
  return van;
}

const DOC_TYPES = {
  rent_cab_licence: 'Rent-a-Motor-Cab / self-drive rental licence', fitness: 'Fitness certificate (commercial vehicle)',
  caravan_reg: 'Caravan registration with State Tourism (if applicable)', tourist_permit: 'All India Tourist Permit (for interstate trips)',
  insurance: 'Commercial comprehensive insurance (self-drive rental cover)', inspection: 'Safety & roadworthiness inspection report',
  ownership_noc: 'Owner NOC & agreement', ownership_company: 'Company authorisation', ownership_rc: 'RC copy', rc: 'Registration Certificate (RC)', puc: 'Pollution Under Control (PUC) certificate'
};
export function addDocument(user, van, body) {
  const type = body.type;
  if (!DOC_TYPES[type]) throw new HttpError(400, 'Unknown document type.');
  const fileName = str(body.fileName, 200);
  if (!fileName) throw new HttpError(400, 'Attach the document file.');
  const expiry = body.expiry ? String(body.expiry) : null;
  if (expiry && (!isDate(expiry) || daysUntil(expiry) < 1)) throw new HttpError(400, 'Expiry date must be in the future.');
  const existing = docsFor({ vanId: van.id }).find(d => d.type === type);
  // Registry-confirmed fields (number, expiry, insurer) aren't overwritten by uploads
  const fields = { fileName, status: 'pending', note: '', submittedAt: now() };
  if (!existing?.check) Object.assign(fields, { number: str(body.number, 60), expiry, insurer: str(body.insurer, 80) });
  const d = upsertDoc(van.ownerId, van.id, type, existing?.label || DOC_TYPES[type], fields);
  recomputeVan(van);
  notifyAdmins(`${d.label} submitted by ${user.name} for ${van.name || 'a new van'}.`, '#/admin/verifications');
  audit(user.id, 'document.submit', `${d.id} ${type} for ${van.id}`);
  persist();
  return d;
}

export function setBlocked(van, blocked) {
  const list = [].concat(blocked || []).slice(0, 200).map(r => ({ start: String(r.start), end: String(r.end), note: str(r.note, 60) }));
  if (!list.every(r => isDate(r.start) && isDate(r.end) && r.end >= r.start)) throw new HttpError(400, 'Invalid date range.');
  van.blocked = list.sort((a, b) => a.start.localeCompare(b.start));
  persist();
}

export function submitForReview(user, van) {
  const steps = stepStatuses(van);
  const blocking = STEP_IDS.slice(0, 10).filter(k => !['verified', 'pending'].includes(steps[k]));
  if (blocking.length) throw new HttpError(400, 'Finish these steps first: ' + blocking.join(', '));
  if (!['draft', 'in_review'].includes(van.status) && van.verification.review !== 'rejected') throw new HttpError(409, 'This listing has already been reviewed.');
  van.verification.review = 'pending'; van.status = 'in_review'; van.submittedAt = now();
  notifyAdmins(`${user.name} submitted “${van.name}” for listing approval.`, '#/admin/listings');
  audit(user.id, 'listing.submit', `${van.id} ${van.name}`);
  persist();
}

export function setOwnerStatus(user, van, status) {
  const allowed = { published: 'paused', paused: 'published' };
  if (status === 'published' && van.status === 'draft') {
    const steps = stepStatuses(van);
    const missing = STEP_IDS.filter(k => steps[k] !== 'verified');
    if (missing.length) throw new HttpError(400, 'Every step must be verified before publishing: ' + missing.join(', '));
    van.status = 'published'; van.publishedAt = now();
    audit(user.id, 'listing.publish', `${van.id} ${van.name}`);
  } else if (allowed[van.status] === status) {
    van.status = status;
    audit(user.id, 'listing.' + (status === 'paused' ? 'pause' : 'resume'), `${van.id} ${van.name}`);
  } else throw new HttpError(409, `Can’t change a ${van.status.replace('_', ' ')} listing to ${status}.`);
  persist();
}

/* ---------- Admin actions ---------- */
export function decideDocument(admin, docId, status, note) {
  if (!['verified', 'action_required', 'rejected'].includes(status)) throw new HttpError(400, 'Invalid decision.');
  if (status !== 'verified' && !str(note)) throw new HttpError(400, 'Add a note for the owner.');
  const d = state().documents.find(x => x.id === docId);
  if (!d) throw new HttpError(404, 'Document not found.');
  Object.assign(d, { status, note: str(note, 500), reviewedAt: now(), reviewedBy: admin.id });
  if (d.type === 'insurance') d.coverApproved = status === 'verified';
  if (d.vanId) recomputeVan(getVan(d.vanId)); else recomputeOwner(d.ownerId);
  notify(d.ownerId, `${d.label}: ${status.replace('_', ' ')}${note ? ' — ' + note : ''}`, '#/owner/documents');
  audit(admin.id, 'document.' + status, `${d.label} (${d.id})${note ? ' — ' + note : ''}`);
  persist();
}

export function reviewListing(admin, van, approve, note) {
  if (van.status !== 'in_review') throw new HttpError(409, 'This listing isn’t waiting for review.');
  if (approve) {
    const steps = stepStatuses(van);
    const notVerified = STEP_IDS.slice(0, 10).filter(k => steps[k] !== 'verified');
    if (notVerified.length) throw new HttpError(400, 'Verify these steps before approving: ' + notVerified.join(', '));
    van.verification.review = 'verified'; van.status = 'draft'; van.approvedAt = now();
    notify(van.ownerId, `${van.name} is approved! Publish it from your dashboard to go live.`, `#/owner/onboarding?van=${van.id}&step=12`);
  } else {
    if (!str(note)) throw new HttpError(400, 'Tell the owner what to change.');
    van.verification.review = 'rejected'; van.status = 'draft';
    notify(van.ownerId, `${van.name} needs changes before approval: ${note}`, `#/owner/onboarding?van=${van.id}`);
  }
  audit(admin.id, approve ? 'listing.approve' : 'listing.reject', `${van.id} ${van.name}${note ? ' — ' + note : ''}`);
  persist();
}

export function adminSetVanStatus(admin, van, status, note) {
  if (status === 'suspended') {
    if (!str(note)) throw new HttpError(400, 'Add a reason.');
    van.status = 'suspended'; van.suspendedFor = 'admin';
    notify(van.ownerId, `${van.name} was suspended by VanYatra: ${note}`, '#/owner/vans');
  } else if (status === 'published' && van.status === 'suspended') {
    van.status = 'published'; delete van.suspendedFor;
    notify(van.ownerId, `${van.name} has been reinstated.`, '#/owner/vans');
  } else throw new HttpError(400, 'Invalid status change.');
  audit(admin.id, 'listing.' + (status === 'suspended' ? 'suspend' : 'reinstate'), `${van.id} ${van.name}${note ? ' — ' + note : ''}`);
  persist();
}

export function remind(admin, docId) {
  const d = state().documents.find(x => x.id === docId);
  if (!d) throw new HttpError(404, 'Document not found.');
  notify(d.ownerId, `Reminder: please renew ${d.label}${d.vanId ? ' for ' + (getVan(d.vanId)?.name || '') : ''}.`, '#/owner/documents');
  audit(admin.id, 'document.reminder', `${d.label} ${d.id}`);
  persist();
}

export function suspendOwnerVans(ownerId) {
  for (const v of state().vans) if (v.ownerId === ownerId && v.status === 'published') { v.status = 'suspended'; v.suspendedFor = 'account'; }
  persist();
}

/* ---------- Scheduled job: document expiry ---------- */
export function runExpiryJob() {
  let changed = false;
  for (const d of state().documents) {
    if (!d.expiry || d.status === 'rejected') continue;
    const days = daysUntil(d.expiry);
    const van = d.vanId && getVan(d.vanId);
    if (days < 0 && d.status === 'verified') {
      d.status = 'action_required';
      d.note = `Expired on ${d.expiry}. Upload a renewed copy or re-check with VAHAN.`;
      if (van) {
        recomputeVan(van);
        if (van.status === 'published' && ['insurance', 'rc', 'rent_cab_licence', 'fitness', 'puc'].includes(d.type)) {
          van.status = 'suspended'; van.suspendedFor = 'documents';
          audit('system', 'listing.suspend', `${van.id} ${van.name} — ${d.label} expired`);
        }
      }
      notify(d.ownerId, `${d.label}${van ? ' for ' + van.name : ''} has expired.${van ? ' The listing is paused until it’s renewed.' : ''}`, '#/owner/documents');
      changed = true;
    } else if (days >= 0 && days <= C.expiryWarningDays && !d.reminded) {
      d.reminded = true;
      notify(d.ownerId, `${d.label}${van ? ' for ' + van.name : ''} expires in ${days} days.`, '#/owner/documents');
      changed = true;
    }
  }
  if (changed) persist();
}

/* ---------- What each user may see ---------- */
export function viewFor(user) {
  const s = state();
  const withSteps = (v) => ({ ...v, steps: stepStatuses(v) });
  const publicVan = (v) => { const { regNo, rcName, chassis, registry, relation, verificationNotes, ...rest } = v; return rest; };
  // Hosts' display names (and join date) so any browser can show who owns a van;
  // admins get the full account list for user management
  const people = (vans) => {
    if (user?.role === 'admin') return accounts().map(a => ({ id: a.id, name: a.name, email: a.email, role: a.role, status: a.status, createdAt: a.createdAt }));
    const ids = new Set(vans.map(v => v.ownerId));
    return accounts().filter(a => ids.has(a.id)).map(a => ({ id: a.id, name: a.name, role: a.role, createdAt: a.createdAt }));
  };
  if (!user) {
    const vans = s.vans.filter(v => v.status === 'published').map(publicVan);
    return { vans, documents: [], owners: verifiedFlags(), notifications: [], people: people(vans) };
  }
  const mine = (v) => v.ownerId === user.id;
  const isAdmin = user.role === 'admin';
  const vans = s.vans.filter(v => isAdmin || mine(v) || v.status === 'published').map(v => (isAdmin || mine(v) ? withSteps(v) : publicVan(v)));
  return {
    vans,
    documents: s.documents.filter(d => isAdmin || d.ownerId === user.id),
    owners: isAdmin ? s.owners : { ...verifiedFlags(), ...(s.owners[user.id] ? { [user.id]: s.owners[user.id] } : {}) },
    notifications: s.notifications.filter(n => n.userId === user.id).slice(0, 50),
    people: people(vans)
  };
}
// Public "verified owner" badge needs only the four owner-step statuses
function verifiedFlags() {
  return Object.fromEntries(Object.entries(state().owners).map(([id, o]) => [id, Object.fromEntries(OWNER_STEPS.map(k => [k, { status: o[k]?.status || 'not_started' }]))]));
}

export function markNotificationsRead(user) {
  for (const n of state().notifications) if (n.userId === user.id) n.read = true;
  persist();
}

export { findAccount };
