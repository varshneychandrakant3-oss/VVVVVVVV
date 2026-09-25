// Verification orchestration: validates input, calls the provider, cross-checks
// names across documents, decides an outcome and stores a minimal record.
//
// Outcomes: 'verified' (auto-approved), 'review' (a person must look), 'failed'.
import crypto from 'node:crypto';
import { config } from './config.js';
import { read, write, appendLog } from './lib/store.js';
import { HttpError } from './lib/http.js';
import { compareNames } from './lib/names.js';
import { clean, PAN_RE, IFSC_RE, DL_RE, REG_RE, ACCOUNT_RE, DATE_RE, isValidGstin, panFromGstin, maskPan, maskTail, daysUntil } from './lib/validate.js';
import { sandbox } from './providers/sandbox.js';
import { cashfree, ProviderError } from './providers/cashfree.js';

export const provider = () => (config.provider === 'cashfree' ? cashfree : sandbox);

const SOURCES = {
  aadhaar: 'UIDAI e-Aadhaar via DigiLocker',
  pan: 'Income Tax Department (PAN)',
  gstin: 'GST Network (GSTN)',
  vehicle: 'MoRTH VAHAN vehicle registry',
  dl: 'MoRTH SARATHI licence registry',
  bank: 'Bank account penny-drop'
};

/* ---------- Records ---------- */
export const records = () => read('verifications', []);
export function latest(subjectId, type) {
  return records().filter(r => r.subjectId === subjectId && r.type === type).sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))[0] || null;
}
function save(rec) {
  const list = records();
  const via = rec.type === 'aadhaar' ? (config.digilocker.mode === 'live' ? 'DigiLocker' : 'Test mode (no real checks)') : provider().name;
  const full = { id: 'vr_' + crypto.randomBytes(6).toString('hex'), checkedAt: new Date().toISOString(), provider: via, source: SOURCES[rec.type], ...rec };
  list.push(full);
  write('verifications', list.slice(-5000));
  appendLog('audit', { at: full.checkedAt, actor: rec.actorId, action: 'verify.' + rec.type, subject: rec.subjectId, ref: rec.ref, outcome: rec.status });
  return full;
}
const outcome = (reasons) => reasons.some(r => r.level === 'fail') ? 'failed' : reasons.some(r => r.level === 'review') ? 'review' : 'verified';
const fail = (text) => ({ level: 'fail', text });
const review = (text) => ({ level: 'review', text });
const ok = (text) => ({ level: 'ok', text });

// The "KYC name" is the name on the latest verified Aadhaar, else the account name
export function kycName(subject) {
  const a = latest(subject.id, 'aadhaar');
  return a && a.status !== 'failed' ? a.data.name : subject.name;
}

async function run(type, subject, actor, ref, fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ProviderError && e.retryable) {
      // Source down: don't block the owner — queue for manual review
      return save({ type, subjectId: subject.id, actorId: actor.id, ref, status: 'review', reasons: [review(e.message)], data: {} });
    }
    if (e instanceof ProviderError) throw new HttpError(e.status === 400 ? 400 : 502, e.message, e.code);
    throw e;
  }
}

/* ---------- Aadhaar (from DigiLocker) ---------- */
export function recordAadhaar(subject, actor, profile) {
  const reasons = [];
  if (!profile.eaadhaar || !profile.aadhaarLast4) reasons.push(fail('Aadhaar is not linked to this DigiLocker account. Link it in DigiLocker and try again.'));
  const m = compareNames(profile.name, subject.name);
  if (m.result === 'match') reasons.push(ok(`Name matches your account (${m.score}%)`));
  else if (m.result === 'partial') reasons.push(review(`Name on Aadhaar (“${profile.name}”) only partly matches your account name`));
  else reasons.push(fail(`Name on Aadhaar (“${profile.name}”) doesn’t match your account name`));
  return save({
    type: 'aadhaar', subjectId: subject.id, actorId: actor.id, ref: profile.aadhaarLast4 ? 'XXXX-XXXX-' + profile.aadhaarLast4 : null,
    status: outcome(reasons), reasons,
    data: { name: profile.name, dob: profile.dob, gender: profile.gender, aadhaarLast4: profile.aadhaarLast4, issuedDocs: (profile.issuedDocs || []).map(d => d.doctype) }
  });
}

/* ---------- PAN ---------- */
export async function checkPan(subject, actor, { pan, name, dob }) {
  pan = clean(pan);
  if (!PAN_RE.test(pan)) throw new HttpError(400, 'Enter a valid 10-character PAN (e.g. ABCDE1234F).');
  if (!DATE_RE.test(dob || '')) throw new HttpError(400, 'Enter your date of birth.');
  name = String(name || kycName(subject)).trim();
  return run('pan', subject, actor, maskPan(pan), async () => {
    const r = await provider().verifyPan({ pan, name, dob });
    const reasons = [];
    if (!r.found) reasons.push(fail('PAN not found in Income Tax records.'));
    else {
      reasons.push(r.nameMatch ? ok('Name matches PAN records') : fail('Name doesn’t match PAN records'));
      if (!r.dobMatch) reasons.push(review('Date of birth doesn’t match PAN records'));
      if (r.aadhaarLinked === false) reasons.push(review('PAN is not linked with Aadhaar (PAN may be inoperative)'));
      const aad = latest(subject.id, 'aadhaar');
      if (aad && aad.status !== 'failed' && compareNames(aad.data.name, name).result !== 'match') reasons.push(review('Name used for PAN differs from the name on Aadhaar'));
      if (aad && aad.data.dob && aad.data.dob !== dob) reasons.push(review('Date of birth differs from Aadhaar'));
    }
    return save({ type: 'pan', subjectId: subject.id, actorId: actor.id, ref: maskPan(pan), status: outcome(reasons), reasons, data: { panMasked: maskPan(pan), panLast5: pan.slice(5), aadhaarLinked: r.aadhaarLinked ?? null } });
  });
}

/* ---------- GSTIN ---------- */
export async function checkGstin(subject, actor, { gstin, businessName, kind }) {
  gstin = clean(gstin);
  if (!isValidGstin(gstin)) throw new HttpError(400, 'That GSTIN isn’t valid (check the 15 characters).');
  return run('gstin', subject, actor, gstin, async () => {
    const r = await provider().verifyGstin({ gstin, businessName });
    const reasons = [];
    if (!r.found) reasons.push(fail('GSTIN not found on the GST portal.'));
    else {
      if (r.status !== 'Active') reasons.push(fail(`GST registration is ${r.status}.`));
      else reasons.push(ok('GST registration is active'));
      const names = [businessName, kycName(subject)].filter(Boolean);
      const best = Math.max(...names.map(n => Math.max(compareNames(r.legalName, n, { company: true }).score, compareNames(r.tradeName || '', n, { company: true }).score)));
      if (best >= 85) reasons.push(ok('Business name matches GST records'));
      else reasons.push(review(`GST legal name is “${r.legalName}”, which doesn’t clearly match your details`));
      const pan = latest(subject.id, 'pan');
      if (kind !== 'company' && pan && pan.status === 'verified' && pan.data.panLast5 !== panFromGstin(gstin).slice(5)) reasons.push(review('GSTIN is registered to a different PAN than yours'));
    }
    return save({ type: 'gstin', subjectId: subject.id, actorId: actor.id, ref: gstin, status: outcome(reasons), reasons, data: { gstin, legalName: r.legalName, tradeName: r.tradeName, gstStatus: r.status, registeredOn: r.registeredOn, constitution: r.constitution, address: r.address } });
  });
}

/* ---------- Vehicle (RC, insurance, PUC, permit) ---------- */
export async function checkVehicle(subject, actor, { regNo, relation = 'owner', vanId }) {
  regNo = clean(regNo);
  if (!REG_RE.test(regNo)) throw new HttpError(400, 'Enter a valid registration number (e.g. MH12AB1234).');
  if (!['owner', 'company', 'authorised'].includes(relation)) relation = 'owner';
  vanId = typeof vanId === 'string' ? vanId.slice(0, 40) : undefined;
  const names = [kycName(subject), subject.name, latest(subject.id, 'gstin')?.data?.legalName].filter(Boolean);
  return run('vehicle', subject, actor, regNo, async () => {
    const r = await provider().verifyVehicle({ regNo, expectedOwner: kycName(subject) });
    const reasons = [];
    const docs = {};
    let ownerMatch = null;
    if (!r.found) reasons.push(fail('Vehicle not found in the VAHAN registry.'));
    else {
      if (r.blacklisted) reasons.push(fail('Vehicle is blacklisted in VAHAN.'));
      if (r.rcStatus && r.rcStatus !== 'ACTIVE') reasons.push(fail(`RC status is ${r.rcStatus}.`));
      const best = Math.max(...names.map(n => compareNames(r.owner, n, { company: relation === 'company' }).score));
      ownerMatch = best >= 85 ? 'match' : relation === 'authorised' ? 'review' : 'mismatch';
      if (ownerMatch === 'match') reasons.push(ok('Registered owner matches your verified identity'));
      else if (ownerMatch === 'review') reasons.push(review(`Registered owner is “${r.owner}”. Your NOC/authorisation will be checked.`));
      else reasons.push(fail(`Registered owner is “${r.owner}”, not you. Choose “authorised by owner” and upload an NOC.`));
      if (!r.isCommercial) reasons.push(review('Vehicle is registered as private. Self-drive rental needs commercial (rent-a-cab) registration.'));
      const exp = (iso) => iso == null ? 'missing' : daysUntil(iso) < 0 ? 'expired' : 'valid';
      docs.rc = { status: r.rcStatus === 'ACTIVE' && !r.blacklisted ? 'valid' : 'invalid', validUpto: r.rcValidUpto };
      docs.insurance = { status: exp(r.insurance.validUpto), validUpto: r.insurance.validUpto, company: r.insurance.company, policyNumber: r.insurance.policyNumber };
      docs.puc = { status: exp(r.puc.validUpto), validUpto: r.puc.validUpto, number: r.puc.number };
      const permitUpto = r.permit.validUpto || r.nationalPermit.validUpto;
      docs.permit = { status: exp(permitUpto), validUpto: permitUpto, type: r.permit.type || (r.nationalPermit.number ? 'NATIONAL PERMIT' : null) };
      if (docs.insurance.status !== 'valid') reasons.push(fail(docs.insurance.status === 'expired' ? `Insurance expired on ${r.insurance.validUpto}.` : 'No insurance on record in VAHAN.'));
      if (docs.puc.status !== 'valid') reasons.push(review(docs.puc.status === 'expired' ? `PUC expired on ${r.puc.validUpto}.` : 'No PUC on record.'));
    }
    return save({
      type: 'vehicle', subjectId: subject.id, actorId: actor.id, ref: regNo, vanId, status: outcome(reasons), reasons,
      data: r.found ? { regNo, owner: r.owner, ownerMatch, relation, rcStatus: r.rcStatus, maker: r.maker, model: r.model, makeModel: r.makeModel, fuel: r.fuel, vehicleClass: r.vehicleClass, regDate: r.regDate, seats: r.seats, sleeperCapacity: r.sleeperCapacity, isCommercial: r.isCommercial, regAuthority: r.regAuthority, blacklisted: r.blacklisted, docs } : { regNo }
    });
  });
}

/* ---------- Driving licence (travellers) ---------- */
export async function checkDrivingLicence(subject, actor, { dlNumber, dob, name, tripEnd }) {
  dlNumber = clean(dlNumber);
  if (!DL_RE.test(dlNumber)) throw new HttpError(400, 'Enter a valid driving licence number (e.g. MH1220150012345).');
  if (!DATE_RE.test(dob || '')) throw new HttpError(400, 'Enter the driver’s date of birth.');
  return run('dl', subject, actor, maskTail(dlNumber), async () => {
    const r = await provider().verifyDrivingLicence({ dlNumber, dob, name });
    const reasons = [];
    if (!r.found) reasons.push(fail('Licence not found in the SARATHI registry (check number and date of birth).'));
    else {
      const d = daysUntil(r.validUpto);
      if (d == null || d < 0) reasons.push(fail('This driving licence has expired.'));
      else if (tripEnd && r.validUpto < tripEnd) reasons.push(fail('Licence expires before the trip ends.'));
      else reasons.push(ok('Licence is valid'));
      const m = compareNames(r.name, name);
      if (m.result === 'mismatch') reasons.push(fail('Name on licence doesn’t match the driver name.'));
      else if (m.result === 'partial') reasons.push(review('Name on licence only partly matches the driver name.'));
      if (r.classes?.length && !r.classes.some(c => /LMV|MCWG|TRANS|LMV-NT|LMV-TR/i.test(c))) reasons.push(review('Licence class may not cover this vehicle.'));
    }
    return save({ type: 'dl', subjectId: subject.id, actorId: actor.id, ref: maskTail(dlNumber), status: outcome(reasons), reasons, data: { dlMasked: maskTail(dlNumber), validUpto: r.validUpto || null, classes: r.classes || [] } });
  });
}

/* ---------- Bank account (penny drop) ---------- */
export async function checkBank(subject, actor, { account, ifsc, holder }) {
  account = String(account || '').replace(/\s/g, ''); ifsc = clean(ifsc);
  if (!ACCOUNT_RE.test(account)) throw new HttpError(400, 'Enter a valid bank account number.');
  if (!IFSC_RE.test(ifsc)) throw new HttpError(400, 'Enter a valid IFSC (e.g. HDFC0001234).');
  holder = String(holder || kycName(subject)).trim();
  return run('bank', subject, actor, maskTail(account), async () => {
    const r = await provider().verifyBank({ account, ifsc, name: holder });
    const reasons = [];
    if (!r.valid) reasons.push(fail('Bank account could not be verified (closed, invalid or blocked).'));
    else {
      const names = [holder, kycName(subject), latest(subject.id, 'gstin')?.data?.legalName].filter(Boolean);
      const best = Math.max(...names.map(n => compareNames(r.nameAtBank, n, { company: true }).score));
      if (best >= 85) reasons.push(ok('Account holder name matches'));
      else if (best >= 65) reasons.push(review(`Name at bank is “${r.nameAtBank}”, a partial match`));
      else reasons.push(fail(`Name at bank is “${r.nameAtBank}”, which doesn’t match your verified name`));
    }
    return save({ type: 'bank', subjectId: subject.id, actorId: actor.id, ref: maskTail(account), status: outcome(reasons), reasons, data: { accountLast4: account.slice(-4), ifsc, bankName: r.bankName, nameAtBank: r.nameAtBank } });
  });
}
