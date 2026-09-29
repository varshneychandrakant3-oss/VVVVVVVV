/*
 * In-browser demo backend.
 *
 * Used automatically when no VanYatra server is reachable (e.g. the static
 * GitHub Pages preview). It answers the same /api/* requests as server/index.js
 * with the same shared rules (assets/js/core/*), keeping its data in this
 * browser's localStorage. Verification always runs in test mode here.
 *
 * Swapping to the real backend needs no UI changes: App.server() simply sends
 * the same requests over HTTP instead.
 */
window.App = window.App || {};
(() => {
  const KEY = 'vanyatra.demobackend.v1';
  // Bump when demo data gains fields that returning visitors should get
  const DEMO_VERSION = 3;
  const core = App.core;
  let st = null;

  const now = () => new Date().toISOString();
  const uid = (p) => p + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* storage full or blocked: keep working in memory */ } };
  const audit = (actor, action, target) => { st.audit.unshift({ at: now(), actor, action, target }); st.audit = st.audit.slice(0, 1000); };

  function load() {
    try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { st = null; }
    if (st) {
      // Browsers that saved demo data before traveller verification existed
      if (!st.market.travellers || (st.demoVersion || 1) < DEMO_VERSION) {
        const seed = App.buildSeed();
        st.market.travellers = st.market.travellers || seed.travellers;
        for (const u of seed.users) if (!st.accounts.some(a => a.id === u.id || a.email === u.email)) st.accounts.push({ id: u.id, name: u.name, email: u.email, role: u.role, password: u.password, status: 'active', createdAt: u.createdAt });
        for (const v of seed.vans) core.backfillDemoVan(st.market.vans.find(x => x.id === v.id), v);
        st.demoVersion = DEMO_VERSION;
        persist();
      }
      return;
    }
    const seed = App.buildSeed();
    for (const d of seed.documents) if (d.type === 'insurance' && d.status === 'verified') d.coverApproved = true;
    st = {
      version: 1, sessionUserId: null,
      accounts: seed.users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, password: u.password, status: 'active', createdAt: u.createdAt })),
      market: { vans: seed.vans, documents: seed.documents, owners: seed.owners, travellers: seed.travellers, notifications: [] },
      verifications: [], audit: [], dlStates: {}, demoVersion: DEMO_VERSION
    };
    persist();
  }

  // Test-mode provider with a short, realistic delay
  const delay = () => new Promise(r => setTimeout(r, 350));
  const sandbox = { name: 'Test mode (in-browser demo)' };
  for (const k of ['verifyPan', 'verifyGstin', 'verifyVehicle', 'verifyDrivingLicence', 'verifyBank']) sandbox[k] = async (input) => { await delay(); return core.sandbox[k](input); };

  let market, verifier;
  function init() {
    load();
    market = core.createMarket({ state: () => st.market, persist, now, uid, audit, accounts: () => st.accounts, C: App.C });
    verifier = core.createVerifier({
      provider: () => sandbox, aadhaarProviderName: () => 'Test mode (in-browser demo)',
      records: () => st.verifications,
      saveRecord: (r) => { st.verifications.push(r); audit(r.actorId, 'verify.' + r.type, `${r.subjectId} ${r.ref || ''} → ${r.status}`); persist(); },
      uid, now
    });
    market.runExpiryJob();
  }

  const bad = core.fail;
  const pub = (u) => u && { id: u.id, name: u.name, email: u.email, role: u.role };
  const me = () => { const u = st.accounts.find(a => a.id === st.sessionUserId); return u && u.status === 'active' ? u : null; };
  const requireUser = (roles) => {
    const u = me();
    if (!u) throw bad(401, 'Please sign in.', 'unauthenticated');
    if (roles && !roles.includes(u.role)) throw bad(403, 'You don’t have access to this.', 'forbidden');
    return u;
  };
  const passwordOk = (pw) => String(pw).length >= 8 && /\d/.test(pw) && /[a-z]/i.test(pw);

  const VERIFY = {
    pan: [['owner', 'admin'], (s, a, b) => verifier.checkPan(s, a, b)],
    gstin: [['owner', 'admin'], (s, a, b) => verifier.checkGstin(s, a, b)],
    vehicle: [['owner', 'admin'], (s, a, b) => verifier.checkVehicle(s, a, b)],
    bank: [['owner', 'admin'], (s, a, b) => verifier.checkBank(s, a, b)],
    dl: [['customer', 'owner', 'admin'], (s, a, b) => verifier.checkDrivingLicence(s, a, b)]
  };

  async function route(method, path, body = {}) {
    const url = new URL(path, 'https://demo.local');
    const p = url.pathname;
    if (p === '/api/config') return { provider: sandbox.name, testMode: true, digilocker: 'sandbox', demo: true };

    /* ----- Auth ----- */
    if (p === '/api/auth/me') return { user: pub(me()) };
    if (p === '/api/auth/login') {
      const u = st.accounts.find(a => a.email.toLowerCase() === String(body.email || '').trim().toLowerCase());
      if (!u || u.password !== App.hashPassword(String(body.password || ''))) throw bad(401, 'Email or password is incorrect.');
      if (u.status !== 'active') throw bad(403, 'This account is suspended. Contact support.');
      st.sessionUserId = u.id; audit(u.id, 'user.login', u.email); persist();
      return { user: pub(u) };
    }
    if (p === '/api/auth/signup') {
      const name = String(body.name || '').trim(), email = String(body.email || '').trim().toLowerCase();
      if (name.length < 2) throw bad(400, 'Please enter your full name.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad(400, 'Please enter a valid email.');
      if (!passwordOk(body.password)) throw bad(400, 'Password needs at least 8 characters including a letter and a number.');
      if (st.accounts.some(a => a.email === email)) throw bad(409, 'An account with this email already exists.');
      const u = { id: uid('u_'), name, email, role: body.role === 'owner' ? 'owner' : 'customer', password: App.hashPassword(body.password), status: 'active', createdAt: now() };
      st.accounts.push(u); st.sessionUserId = u.id; audit(u.id, 'user.signup', email); persist();
      return { user: pub(u) };
    }
    if (p === '/api/auth/logout') { st.sessionUserId = null; persist(); return { ok: true }; }
    if (p === '/api/auth/password') {
      const u = requireUser();
      if (u.password !== App.hashPassword(String(body.oldPassword || ''))) throw bad(400, 'Current password is incorrect.');
      if (!passwordOk(body.newPassword)) throw bad(400, 'New password needs 8+ characters with a letter and a number.');
      u.password = App.hashPassword(body.newPassword); persist();
      return { ok: true };
    }

    /* ----- Verification ----- */
    const vm = p.match(/^\/api\/verify\/([a-z]+)$/);
    if (vm && method === 'POST' && VERIFY[vm[1]]) {
      const [roles, fn] = VERIFY[vm[1]];
      const actor = requireUser(roles);
      if (body.consent !== true) throw bad(400, 'Consent is required before we can check this document.', 'consent_required');
      let subject = actor;
      if (actor.role === 'admin' && body.subjectId) {
        subject = st.accounts.find(a => a.id === body.subjectId);
        if (!subject) throw bad(404, 'User not found.');
      }
      if (vm[1] === 'vehicle' && body.vanId && market.ownVan(actor, body.vanId).ownerId !== subject.id) throw bad(400, 'That van belongs to a different owner.');
      if (vm[1] === 'dl' && body.purpose === 'profile') body.name = verifier.kycName(subject);
      const result = await fn(subject, actor, body);
      market.onVerification(result, actor, { purpose: body.purpose, vanId: body.vanId, name: body.name });
      return { result };
    }
    if (p === '/api/verify/mine') {
      const u = requireUser();
      return { records: st.verifications.filter(r => r.subjectId === u.id).slice(-100), kycName: verifier.kycName(u) };
    }
    if (p === '/api/admin/verifications') {
      requireUser(['admin']);
      const subject = url.searchParams.get('subjectId');
      return { records: st.verifications.filter(r => !subject || r.subjectId === subject).slice(-500).reverse().map(r => ({ ...r, subjectName: st.accounts.find(a => a.id === r.subjectId)?.name })) };
    }
    if (p === '/api/admin/audit') {
      requireUser(['admin']);
      return { entries: st.audit.slice(0, 500).map(e => ({ ...e, actorName: e.actor === 'system' ? 'System' : st.accounts.find(a => a.id === e.actor)?.name || e.actor })) };
    }

    /* ----- DigiLocker (test consent screen inside the app) ----- */
    if (p === '/api/digilocker/start') {
      const u = requireUser(['customer', 'owner', 'admin']);
      const state = uid('dl');
      const returnTo = (url.searchParams.get('returnTo') || '#/').replace(/^\//, '');
      st.dlStates[state] = { userId: u.id, returnTo: returnTo.startsWith('#/') ? returnTo : '#/', expires: Date.now() + 10 * 60e3 };
      persist();
      return { url: '#/digilocker-demo?state=' + encodeURIComponent(state) };
    }
    if (p === '/api/digilocker/demo-complete') {
      const u = requireUser();
      const pending = st.dlStates[body.state];
      delete st.dlStates[body.state];
      if (!pending || pending.expires < Date.now()) throw bad(400, 'DigiLocker session expired. Please try again.');
      if (pending.userId !== u.id) throw bad(403, 'DigiLocker session belongs to another account.');
      const back = (status, msg) => pending.returnTo + (pending.returnTo.includes('?') ? '&' : '?') + new URLSearchParams({ digilocker: status, ...(msg ? { msg } : {}) });
      if (body.decision !== 'allow') { persist(); return { redirect: back('denied', 'You cancelled DigiLocker consent.') }; }
      const rec = verifier.recordAadhaar(u, u, { name: String(body.name || '').slice(0, 80), dob: body.dob, gender: body.gender, eaadhaar: !body.noaadhaar, aadhaarLast4: body.noaadhaar ? null : String(body.last4 || '').slice(0, 4), issuedDocs: [] });
      market.onVerification(rec);
      return { redirect: back(rec.status) };
    }

    /* ----- Marketplace ----- */
    if (p === '/api/market') return market.viewFor(me());
    if (p === '/api/notifications/read') { market.markNotificationsRead(requireUser()); return { ok: true }; }
    if (p === '/api/traveller/documents') { market.submitTravellerDocs(requireUser(['customer']), body); return { ok: true }; }
    if (p === '/api/owner/profile') { market.updateOwnerProfile(requireUser(['owner']), body); return { ok: true }; }
    if (p === '/api/owner/selfie') { market.addSelfie(requireUser(['owner']), body.fileName); return { ok: true }; }
    if (p === '/api/owner/vans' && method === 'POST') return { van: market.createVan(requireUser(['owner'])) };
    const ov = p.match(/^\/api\/owner\/vans\/([\w-]{1,40})(?:\/(documents|blocked|submit|status))?$/);
    if (ov) {
      const u = requireUser(['owner']);
      const van = market.ownVan(u, ov[1]);
      if (!ov[2] && method === 'PATCH') return { van: market.updateVan(u, van, body) };
      if (ov[2] === 'documents') return { document: market.addDocument(u, van, body) };
      if (ov[2] === 'blocked') { market.setBlocked(van, body.blocked); return { ok: true }; }
      if (ov[2] === 'submit') { market.submitForReview(u, van); return { ok: true }; }
      if (ov[2] === 'status') { market.setOwnerStatus(u, van, body.status); return { ok: true }; }
    }
    const ad = p.match(/^\/api\/admin\/(documents|vans|users|travellers)\/([\w-]{1,40})\/(decision|remind|review|status|recheck)$/);
    if (ad) {
      const admin = requireUser(['admin']);
      const [, kind, id, action] = ad;
      if (kind === 'documents' && action === 'decision') market.decideDocument(admin, id, body.status, body.note);
      else if (kind === 'documents' && action === 'remind') market.remind(admin, id);
      else if (kind === 'travellers' && action === 'decision') market.decideTraveller(admin, id, body.part, body.status, body.note);
      else if (kind === 'vans' && action === 'review') market.reviewListing(admin, market.ownVan(admin, id), body.approve === true, body.note);
      else if (kind === 'vans' && action === 'status') market.adminSetVanStatus(admin, market.ownVan(admin, id), body.status, body.note);
      else if (kind === 'vans' && action === 'recheck') {
        const van = market.ownVan(admin, id);
        const regNo = van.regNo || st.market.documents.find(d => d.vanId === van.id && d.type === 'rc')?.number;
        if (!regNo) throw bad(400, 'This van has no registration number yet.');
        const owner = st.accounts.find(a => a.id === van.ownerId);
        const result = await verifier.checkVehicle(owner, admin, { regNo, relation: van.relation || 'owner', vanId: van.id });
        market.onVerification(result);
        return { result };
      } else if (kind === 'users' && action === 'status') {
        const target = st.accounts.find(a => a.id === id);
        if (!target) throw bad(404, 'User not found.');
        if (target.role === 'admin') throw bad(400, 'Admins can’t be suspended here.');
        if (!['active', 'suspended'].includes(body.status)) throw bad(400, 'Invalid status.');
        target.status = body.status;
        if (target.status === 'suspended') market.suspendOwnerVans(target.id);
        audit(admin.id, 'user.' + (target.status === 'suspended' ? 'suspend' : 'reactivate'), target.email);
        persist();
      } else throw bad(404, 'Not found');
      return { ok: true };
    }
    throw bad(404, 'Not found');
  }

  App.mockServer = {
    // Same contract as the HTTP API; results are deep-copied so the page can't mutate backend state directly
    async handle(method, path, body) {
      if (!st) init();
      const out = await route(method, path, body ? JSON.parse(JSON.stringify(body)) : {});
      return JSON.parse(JSON.stringify(out));
    },
    reset() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } st = null; }
  };
})();
