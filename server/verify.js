// Server host for the shared verification rules (assets/js/core/verify-rules.js):
// picks the provider (Cashfree or test mode), stores minimal records and audits.
//
// Outcomes: 'verified' (auto-approved), 'review' (a person must look), 'failed'.
import crypto from 'node:crypto';
import { config } from './config.js';
import { core } from './core.js';
import { read, write, appendLog } from './lib/store.js';
import { sandbox } from './providers/sandbox.js';
import { cashfree } from './providers/cashfree.js';

export const provider = () => (config.provider === 'cashfree' ? cashfree : sandbox);
export const records = () => read('verifications', []);

const V = core.createVerifier({
  provider,
  aadhaarProviderName: () => (config.digilocker.mode === 'live' ? 'DigiLocker' : 'Test mode (no real checks)'),
  records,
  saveRecord: (full) => {
    write('verifications', [...records(), full].slice(-5000));
    appendLog('audit', { at: full.checkedAt, actor: full.actorId, action: 'verify.' + full.type, subject: full.subjectId, ref: full.ref, outcome: full.status });
  },
  uid: (p) => p + crypto.randomBytes(6).toString('hex'),
  now: () => new Date().toISOString()
});

// Records come back from the script sandbox; hand plain objects to the rest of the server
const plain = (fn) => async (...args) => JSON.parse(JSON.stringify(await fn(...args)));

export const latest = V.latest;
export const kycName = V.kycName;
export const recordAadhaar = (...a) => JSON.parse(JSON.stringify(V.recordAadhaar(...a)));
export const checkPan = plain(V.checkPan);
export const checkGstin = plain(V.checkGstin);
export const checkVehicle = plain(V.checkVehicle);
export const checkDrivingLicence = plain(V.checkDrivingLicence);
export const checkBank = plain(V.checkBank);
