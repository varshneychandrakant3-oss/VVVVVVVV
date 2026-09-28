// Server host for the shared marketplace rules (assets/js/core/market-rules.js):
// provides storage (data/market.json), the audit log and demo-data seeding.
//
// The browser can read this and *request* changes; every status is decided by
// the shared rules here, so a user can't mark their own documents or listings
// as verified.
import crypto from 'node:crypto';
import { App, core } from './core.js';
import { read, write, appendLog } from './lib/store.js';
import { accounts, findAccount } from './lib/auth.js';

export const C = App.C;

// Bump when the demo data gains new vans/owners; existing servers get them merged in
const SEED_VERSION = 3;

const uid = (p) => p + crypto.randomBytes(6).toString('hex');
const now = () => new Date().toISOString();

function demoSeed() {
  const seed = App.buildSeed();
  // Demo insurance that's already verified counts as rental cover already checked
  for (const d of seed.documents) if (d.type === 'insurance' && d.status === 'verified') d.coverApproved = true;
  return JSON.parse(JSON.stringify(seed)); // plain objects, detached from the script sandbox
}

export function state() {
  let s = read('market', null);
  if (!s) {
    const seed = demoSeed();
    s = { version: 1, seedVersion: SEED_VERSION, vans: seed.vans, documents: seed.documents, owners: seed.owners, travellers: seed.travellers, notifications: [] };
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
    s.travellers = s.travellers || {};
    for (const [id, t] of Object.entries(seed.travellers)) if (!s.travellers[id]) s.travellers[id] = t;
    s.seedVersion = SEED_VERSION;
    write('market', s);
  }
  return s;
}

export function audit(actorId, action, target) {
  appendLog('audit', { at: now(), actor: actorId, action, target });
}

const M = core.createMarket({
  state, persist: () => write('market', state()), now, uid, audit, accounts, C
});

export const {
  getVan, ownVan, recomputeOwner, recomputeVan, stepStatuses, onVerification, updateOwnerProfile, addSelfie, createVan, updateVan,
  addDocument, setBlocked, submitForReview, setOwnerStatus, decideDocument, reviewListing, adminSetVanStatus, remind, suspendOwnerVans,
  runExpiryJob, viewFor, markNotificationsRead, notify, submitTravellerDocs, decideTraveller
} = M;
export const rollup = core.rollup;
export { findAccount };
