/*
 * Shared core — marketplace rules for everything that affects trust:
 * vans (listing + verification), documents, owner verification steps, admin
 * decisions, document expiry and what each user may see.
 *
 * Every status is decided here. Hosts (server/market.js and the in-browser demo
 * backend) supply storage:
 *
 *   App.core.createMarket({
 *     state: () => ({ vans, documents, owners, notifications }),
 *     persist: () => void, now: () => ISO, uid: (prefix) => string,
 *     audit: (actorId, action, target) => void, accounts: () => [...], C: countryConfig
 *   })
 */
(function (root) {
  const App = root.App = root.App || {};
  const core = App.core = App.core || {};

  const STEP_IDS = ['account', 'kyc', 'business', 'ownership', 'registration', 'insurance', 'inspection', 'photos', 'listing', 'payout', 'review'];
  const OWNER_STEPS = ['account', 'kyc', 'business', 'payout'];
  const VAN_TYPES = ['Campervan', 'Motorhome', 'Pop-top', '4x4 Overlander', 'Caravan'];
  const AMENITY_IDS = new Set(['kitchen', 'fridge', 'shower', 'toilet', 'ac', 'heater', 'solar', 'inverter', 'wifi', 'awning', 'bikerack', 'childseat', 'pets', 'gps', 'campingchairs', 'watertank']);
  // Shots owners are guided to take (see the photo guide in onboarding)
  const PHOTO_SHOTS = ['exterior', 'bed', 'kitchen', 'bathroom', 'dashboard', 'storage', 'other'];
  core.PHOTO_SHOTS = PHOTO_SHOTS;
  // Photos are complete when there are enough, including the outside of the van
  core.photosComplete = (van, C) => (van.photos || []).length >= (C.minPhotos || 5) && (van.photoLabels || []).includes('exterior');
  const PHOTO_RE = /^(photo-[0-9]{10,16}-[0-9a-f]{6,16}|data:image\/jpeg;base64,[A-Za-z0-9+/=]+)$/;
  const DOC_TYPES = {
    rent_cab_licence: 'Rent-a-Motor-Cab / self-drive rental licence', fitness: 'Fitness certificate (commercial vehicle)',
    caravan_reg: 'Caravan registration with State Tourism (if applicable)', tourist_permit: 'All India Tourist Permit (for interstate trips)',
    insurance: 'Commercial comprehensive insurance (self-drive rental cover)', inspection: 'Safety & roadworthiness inspection report',
    ownership_noc: 'Owner NOC & agreement', ownership_company: 'Company authorisation', ownership_rc: 'RC copy', rc: 'Registration Certificate (RC)', puc: 'Pollution Under Control (PUC) certificate'
  };

  core.rollup = (statuses) => {
    if (statuses.includes('rejected')) return 'rejected';
    if (statuses.includes('action_required')) return 'action_required';
    if (statuses.includes('pending')) return 'pending';
    if (statuses.length && statuses.every(s => s === 'verified')) return 'verified';
    return 'not_started';
  };
  core.fromOutcome = (o) => (o === 'verified' ? 'verified' : o === 'review' ? 'pending' : 'action_required');

  /* Traveller verification: can this traveller book a trip ending on tripEnd?
   *   ok        — may book at all
   *   instant   — may use instant book (anything still under review makes it a request)
   *   useProfileLicence — a verified licence on file covers the trip, so no check at booking
   *   blockers / notes — what to tell the traveller */
  core.TRAVELLER_VISAS = ['e-Tourist Visa', 'Tourist Visa', 'OCI card', 'Nepal / Bhutan citizen'];
  const fmt = (iso) => App.fmt.date(iso);
  core.travellerEligibility = (t, tripEnd) => {
    const id = t?.identity || { status: 'not_started' }, lic = t?.licence || { status: 'not_started' };
    const blockers = [], notes = [];
    let instant = true;
    if (id.status === 'verified' || id.status === 'pending') {
      if (id.expiry && tripEnd && id.expiry < tripEnd) blockers.push(`Your ${id.method === 'passport' ? 'passport or visa' : 'ID'} expires on ${fmt(id.expiry)}, before this trip ends.`);
      if (id.status === 'pending') { instant = false; notes.push('Your ID is being reviewed, so this will be sent as a request.'); }
    } else blockers.push(id.status === 'not_started' ? 'Verify your identity before booking.' : 'Your identity check needs attention: ' + (id.note || 'see your verification page.'));
    const licValid = lic.validUpto && (!tripEnd || lic.validUpto >= tripEnd);
    const useProfileLicence = lic.status === 'verified' && !!licValid;
    if (lic.kind === 'idp') {
      if (lic.status === 'pending' && licValid) { instant = false; notes.push('Your International Driving Permit is being reviewed.'); }
      else if (!useProfileLicence) blockers.push(lic.validUpto && !licValid ? 'Your International Driving Permit expires before the trip ends.' : 'Your International Driving Permit needs attention: ' + (lic.note || 'see your verification page.'));
    }
    return { ok: !blockers.length, instant: !blockers.length && instant, useProfileLicence, blockers, notes };
  };
  core.travellerLevel = (t) => {
    const a = t?.identity?.status, b = t?.licence?.status;
    return a === 'verified' && b === 'verified' ? 'verified' : a === 'verified' || a === 'pending' ? 'partial' : 'none';
  };

  core.createMarket = (io) => {
    const bad = core.fail, C = io.C, rollup = core.rollup, fromOutcome = core.fromOutcome;
    const S = () => io.state();
    const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
    const num = (v, min, max) => { const n = Number(v); if (!Number.isFinite(n)) throw bad(400, 'Invalid number.'); return Math.min(max, Math.max(min, n)); };
    const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
    const daysUntil = core.validate.daysUntil;

    const notify = (userId, text, link = '') => {
      const s = S();
      s.notifications.unshift({ id: io.uid('sn'), userId, text, link, at: io.now(), read: false });
      s.notifications = s.notifications.slice(0, 2000);
    };
    const notifyAdmins = (text, link) => io.accounts().filter(a => a.role === 'admin').forEach(a => notify(a.id, text, link));

    const getVan = (id) => S().vans.find(v => v.id === id);
    const ownVan = (user, id) => {
      const van = getVan(id);
      if (!van) throw bad(404, 'Van not found.');
      if (user.role !== 'admin' && van.ownerId !== user.id) throw bad(403, 'This isn’t your van.');
      return van;
    };
    const docsFor = (f) => S().documents.filter(d => Object.entries(f).every(([k, v]) => (v === undefined ? !d[k] : d[k] === v)));

    // Complete only when every required document exists
    const requiredStatus = (docs, defs) => {
      const req = defs.filter(d => d.required);
      const have = docs.filter(d => req.some(r => r.type === d.type));
      if (!have.length) return null;
      const s = rollup(have.map(d => d.status));
      return have.length < req.length && ['verified', 'pending'].includes(s) ? 'not_started' : s;
    };

    const recomputeOwner = (ownerId) => {
      const o = S().owners[ownerId] || (S().owners[ownerId] = {});
      const kycDocs = docsFor({ ownerId, vanId: undefined }).filter(d => ['aadhaar', 'pan', 'selfie'].includes(d.type));
      const kyc = requiredStatus(kycDocs, [{ type: 'aadhaar', required: true }, { type: 'pan', required: true }, { type: 'selfie', required: true }]);
      if (kyc) o.kyc = { ...(o.kyc || {}), status: kyc };
    };

    const recomputeVan = (van) => {
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
        io.audit('system', 'listing.reinstate', `${van.id} ${van.name} — documents valid`);
      }
    };

    const stepStatuses = (van) => {
      const o = S().owners[van?.ownerId] || {};
      return Object.fromEntries(STEP_IDS.map(k => [k, OWNER_STEPS.includes(k) ? (o[k]?.status || 'not_started') : (van?.verification?.[k] || 'not_started')]));
    };

    const upsertDoc = (ownerId, vanId, type, label, fields) => {
      const s = S();
      let d = s.documents.find(x => x.ownerId === ownerId && (x.vanId || undefined) === vanId && x.type === type);
      if (!d) { d = { id: io.uid('doc'), ownerId, ...(vanId ? { vanId } : {}), type, label, submittedAt: io.now() }; s.documents.push(d); }
      Object.assign(d, { reminded: false }, fields);
      return d;
    };
    const noteOf = (rec) => rec.reasons.filter(x => x.level !== 'ok').map(x => x.text).join(' ');

    const applyVehicle = (van, rec, check) => {
      const d = rec.data;
      van.regNo = rec.ref;
      if (d.relation) van.relation = d.relation;
      van.registry = { ...d, status: rec.status, checkedAt: rec.checkedAt, source: rec.source, reasons: rec.reasons };
      if (!d.docs) { recomputeVan(van); return; }
      const docs = d.docs;
      const st = (x) => (x === 'valid' ? 'verified' : 'action_required');
      if (d.ownerMatch) {
        const good = d.ownerMatch === 'match' && !d.blacklisted && d.rcStatus === 'ACTIVE';
        upsertDoc(van.ownerId, van.id, 'ownership_rc', `Ownership (VAHAN: ${d.owner})`, {
          number: rec.ref, check, status: good ? 'verified' : d.ownerMatch === 'review' && !d.blacklisted ? 'pending' : 'action_required',
          note: good ? '' : d.blacklisted ? 'Vehicle is blacklisted in VAHAN.' : d.ownerMatch === 'review' ? 'Registered owner differs — NOC under review.' : 'Registered owner doesn’t match your verified identity.'
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
    };

    /* ---------- Traveller verification ---------- */
    const accountOf = (id) => io.accounts().find(a => a.id === id);
    const traveller = (id) => {
      const s = S();
      s.travellers = s.travellers || {};
      return s.travellers[id] || (s.travellers[id] = { identity: { status: 'not_started' }, licence: { status: 'not_started' } });
    };
    const travellerCheck = (t, rec, check) => {
      if (rec.type === 'aadhaar') {
        t.residency = 'india';
        t.identity = { status: fromOutcome(rec.status), method: 'aadhaar', note: noteOf(rec), check, data: { name: rec.data.name, dob: rec.data.dob || null, aadhaarLast4: rec.data.aadhaarLast4 } };
      } else if (rec.type === 'dl') {
        t.licence = { status: fromOutcome(rec.status), kind: 'indian', note: noteOf(rec), check, validUpto: rec.data.validUpto || null, data: { dlMasked: rec.data.dlMasked, classes: rec.data.classes } };
      }
    };
    const PASSPORT_RE = /^[A-Z0-9]{6,12}$/;
    // Visitors from abroad: passport + visa and an International Driving Permit, checked by a person
    const submitTravellerDocs = (user, body) => {
      const t = traveller(user.id);
      const future = (d) => isDate(d) && daysUntil(d) > 0;
      if (body.part === 'identity') {
        const nationality = str(body.nationality, 60);
        const passport = str(body.passportNumber, 20).toUpperCase().replace(/[\s-]/g, '');
        const visaType = core.TRAVELLER_VISAS.includes(body.visaType) ? body.visaType : null;
        const needsVisa = visaType && !['OCI card', 'Nepal / Bhutan citizen'].includes(visaType);
        if (!nationality || /^india(n)?$/i.test(nationality)) throw bad(400, 'Indian residents verify with DigiLocker instead.');
        if (!PASSPORT_RE.test(passport)) throw bad(400, 'Enter your passport number as printed.');
        if (!isDate(body.dob) || daysUntil(body.dob) > -365 * 18) throw bad(400, 'Enter your date of birth (you must be 18 or over).');
        if (!future(body.passportExpiry)) throw bad(400, 'Your passport must be valid.');
        if (!visaType) throw bad(400, 'Choose your visa type.');
        if (needsVisa && !future(body.visaExpiry)) throw bad(400, 'Your visa must be valid.');
        if (!str(body.passportFile) || (needsVisa && !str(body.visaFile))) throw bad(400, needsVisa ? 'Attach your passport photo page and visa.' : 'Attach your passport photo page.');
        const expiry = needsVisa && body.visaExpiry < body.passportExpiry ? body.visaExpiry : body.passportExpiry;
        t.residency = 'foreign';
        t.identity = {
          status: 'pending', method: 'passport', note: '', submittedAt: io.now(), expiry,
          data: { nationality, dob: body.dob, passportMasked: 'XXXX' + passport.slice(-4), passportExpiry: body.passportExpiry, visaType, visaExpiry: needsVisa ? body.visaExpiry : null },
          files: { passport: str(body.passportFile, 120), ...(needsVisa ? { visa: str(body.visaFile, 120) } : {}) }
        };
        notifyAdmins(`${user.name} submitted a passport${needsVisa ? ' and visa' : ''} for traveller verification.`, '#/admin/verifications?filter=travellers');
      } else if (body.part === 'licence') {
        const country = str(body.homeCountry, 60);
        const number = str(body.licenceNumber, 30).toUpperCase().replace(/\s/g, '');
        if (!country) throw bad(400, 'Which country issued your driving licence?');
        if (number.length < 5) throw bad(400, 'Enter your home driving licence number.');
        if (!future(body.idpExpiry)) throw bad(400, 'Your International Driving Permit must be valid.');
        if (!str(body.licenceFile) || !str(body.idpFile)) throw bad(400, 'Attach your home licence and your International Driving Permit.');
        t.licence = {
          status: 'pending', kind: 'idp', note: '', submittedAt: io.now(), validUpto: body.idpExpiry,
          data: { homeCountry: country, licenceMasked: 'XXXX' + number.slice(-4) },
          files: { licence: str(body.licenceFile, 120), idp: str(body.idpFile, 120) }
        };
        notifyAdmins(`${user.name} submitted an International Driving Permit for review.`, '#/admin/verifications?filter=travellers');
      } else throw bad(400, 'Unknown document.');
      delete t.reminded;
      io.audit(user.id, 'traveller.submit', `${user.id} ${body.part}`);
      io.persist();
      return t;
    };
    const decideTraveller = (admin, userId, part, status, note) => {
      if (!['identity', 'licence'].includes(part)) throw bad(400, 'Unknown document.');
      if (!['verified', 'action_required', 'rejected'].includes(status)) throw bad(400, 'Invalid decision.');
      if (status !== 'verified' && !str(note)) throw bad(400, 'Add a note for the traveller.');
      const acct = accountOf(userId);
      if (!acct) throw bad(404, 'User not found.');
      const t = traveller(userId);
      if (!t[part] || t[part].status === 'not_started') throw bad(409, 'Nothing has been submitted yet.');
      Object.assign(t[part], { status, note: str(note, 500), reviewedAt: io.now(), reviewedBy: admin.id });
      const label = part === 'identity' ? 'Your ID' : 'Your driving licence';
      notify(userId, status === 'verified' ? `${label} is verified. You’re all set to book.` : `${label} needs attention: ${note}`, '#/account/verification');
      io.audit(admin.id, 'traveller.' + status, `${acct.email} ${part}${note ? ' — ' + str(note, 200) : ''}`);
      io.persist();
    };

    // Results of government checks update the records
    const onVerification = (rec, _actor, opts = {}) => {
      const s = S();
      const check = { source: rec.source, checkedAt: rec.checkedAt, outcome: rec.status, recordId: rec.id };
      // Travellers keep their own record. A licence checked while booking may belong
      // to another driver, so only a check made from the profile updates it.
      // An owner's driver: the licence check is recorded on the van it's for
      if (rec.type === 'dl' && opts.purpose === 'driver') {
        const van = getVan(opts.vanId);
        if (van && van.ownerId === rec.subjectId) {
          van.driver = { ...(van.driver || {}), check: { ...check, status: fromOutcome(rec.status), validUpto: rec.data.validUpto || null, note: noteOf(rec) }, licenceLast4: String(rec.data.dlMasked || '').slice(-4), name: str(opts.name, 60) };
          io.persist();
        }
        return;
      }
      if (accountOf(rec.subjectId)?.role === 'customer') {
        if (rec.type === 'aadhaar' || (rec.type === 'dl' && opts.purpose === 'profile')) { travellerCheck(traveller(rec.subjectId), rec, check); io.persist(); }
        return;
      }
      const owner = s.owners[rec.subjectId] || (s.owners[rec.subjectId] = {});
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
      io.persist();
    };

    /* ---------- Owner actions ---------- */
    const updateOwnerProfile = (user, body) => {
      const s = S();
      const o = s.owners[user.id] || (s.owners[user.id] = {});
      if (body.accountVerified === true) o.account = { status: 'verified' };
      if (body.business) {
        const b = body.business;
        const data = { kind: b.kind === 'company' ? 'company' : 'individual', business: str(b.business, 80), gstin: str(b.gstin, 15).toUpperCase(), phone: str(b.phone, 20), emergency: str(b.emergency, 80), address: str(b.address, 300), city: str(b.city, 60), state: str(b.state, 60), pin: str(b.pin, 6) };
        if (!data.business || !data.address || !/^\d{6}$/.test(data.pin)) throw bad(400, 'Please complete your business details.');
        let status = 'verified'; // self-declared when there's no GSTIN (below the GST threshold)
        if (data.gstin) {
          const g = o.gst && o.gst.gstin === data.gstin ? o.gst : null;
          if (!g) throw bad(400, 'Verify your GSTIN before saving.');
          if (g.status === 'failed') throw bad(400, 'This GSTIN failed verification.');
          status = fromOutcome(g.status);
        }
        o.business = { status, data };
      }
      io.persist();
    };

    const addSelfie = (user, fileName) => {
      if (!str(fileName)) throw bad(400, 'Attach a selfie.');
      upsertDoc(user.id, undefined, 'selfie', 'Live selfie', { fileName: str(fileName, 120), status: 'pending', note: '', submittedAt: io.now() });
      recomputeOwner(user.id);
      notifyAdmins(`${user.name} submitted a selfie for KYC review.`, '#/admin/verifications');
      io.persist();
    };

    const createVan = (user) => {
      const v = {
        id: io.uid('v'), ownerId: user.id, name: '', type: 'Campervan', destinationId: 'goa', city: '', sleeps: 4, seats: 4,
        make: '', model: '', year: new Date().getFullYear(), fuel: 'Diesel', transmission: 'Manual', amenities: [], familyFriendly: false, petFriendly: false,
        instantBook: false, cancellation: 'moderate', pricePerNight: 5000, weekendPrice: 5500, cleaningFee: 1200, deposit: 15000, minNights: 2,
        discounts: { weekly: 10, monthly: 20 }, kmPerDay: 250, extraKmFee: 12, beds: '', length: '', licence: 'Standard LMV car licence', mileage: '',
        pickup: { city: '', address: '', lat: 0, lng: 0, time: '11:00', returnTime: '10:00' }, rules: ['No smoking inside the van', 'Return with the same fuel level'],
        description: '', photos: [], blocked: [], status: 'draft',
        verification: { ownership: 'not_started', registration: 'not_started', insurance: 'not_started', inspection: 'not_started', photos: 'not_started', listing: 'not_started', review: 'not_started' },
        views: 0, createdAt: io.now()
      };
      S().vans.push(v);
      io.audit(user.id, 'listing.create', v.id);
      io.persist();
      return v;
    };

    const updateVan = (user, van, body) => {
      if (van.status === 'in_review') throw bad(409, 'This listing is under review. Wait for the decision before editing.');
      const set = {};
      if ('name' in body) set.name = str(body.name, 40);
      if ('description' in body) set.description = str(body.description, 2000);
      if ('type' in body) { if (!VAN_TYPES.includes(body.type)) throw bad(400, 'Unknown van type.'); set.type = body.type; }
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
      /* Trip options the owner offers (see assets/js/core/pricing.js) */
      const slug = (x, i, p) => (str(x, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || p + i).slice(0, 40);
      const MD = (x) => (/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(x || '') ? x : null);
      if ('addOns' in body) {
        const ids = new Set((App.ADD_ON_CATALOG || []).map(a => a.id));
        set.addOns = [].concat(body.addOns || []).filter(a => a && ids.has(a.id)).slice(0, 20).map(a => ({ id: a.id, price: num(a.price, 0, 20000) }));
      }
      if ('kmPackages' in body) {
        const k = body.kmPackages || {};
        set.kmPackages = { plus: k.plus == null ? null : num(k.plus, 0, 5000), unlimited: k.unlimited == null ? null : num(k.unlimited, 0, 10000) };
      }
      if ('driver' in body) {
        const d = body.driver || {};
        // A new driver needs a fresh licence check
        const keep = van.driver?.check && (!d.licenceLast4 || d.licenceLast4 === van.driver.licenceLast4) ? { check: van.driver.check, licenceLast4: van.driver.licenceLast4, name: van.driver.name } : {};
        set.driver = { ...keep, available: !!d.available, feePerDay: num(d.feePerDay ?? 1800, 300, 10000), bataPerDay: num(d.bataPerDay ?? 400, 0, 3000), stayPerNight: num(d.stayPerNight ?? 600, 0, 5000),
          languages: [].concat(d.languages || []).map(x => str(x, 20)).filter(Boolean).slice(0, 5) };
      }
      if ('delivery' in body) {
        const d = body.delivery;
        set.delivery = d ? {
          perKm: num(d.perKm ?? 20, 0, 200),
          points: [].concat(d.points || []).slice(0, 6).map((p, i) => ({ id: slug(p.name, i, 'p'), name: str(p.name, 60), type: ['airport', 'station', 'hotel'].includes(p.type) ? p.type : 'hotel', km: num(p.km ?? 0, 0, 500) })).filter(p => p.name),
          oneWay: [].concat(d.oneWay || []).slice(0, 6).map((o, i) => ({ id: slug(o.name, i, 'o'), name: str(o.name, 40), fee: num(o.fee ?? 0, 0, 100000) })).filter(o => o.name)
        } : null;
      }
      if ('seasons' in body) set.seasons = [].concat(body.seasons || []).slice(0, 8).map(x => ({ name: str(x.name, 40) || 'Season', from: MD(x.from), to: MD(x.to), pct: num(x.pct, -50, 100) })).filter(x => x.from && x.to && x.pct);
      if ('earlyBird' in body) set.earlyBird = body.earlyBird && +body.earlyBird.pct ? { days: num(body.earlyBird.days, 14, 365), pct: num(body.earlyBird.pct, 1, 40) } : null;
      if ('lastMinute' in body) set.lastMinute = body.lastMinute && +body.lastMinute.pct ? { days: num(body.lastMinute.days, 1, 30), pct: num(body.lastMinute.pct, 1, 50) } : null;
      if ('pickup' in body) {
        const p = body.pickup || {};
        set.pickup = { ...van.pickup, city: str(p.city, 60), address: str(p.address, 200), time: str(p.time, 5), returnTime: str(p.returnTime, 5), lat: num(p.lat ?? van.pickup.lat, -90, 90), lng: num(p.lng ?? van.pickup.lng, -180, 180) };
      }
      if ('photos' in body) {
        const photos = [].concat(body.photos || []);
        if (photos.length > 12) throw bad(400, 'Up to 12 photos.');
        if (!photos.every(p => typeof p === 'string' && p.length < 600000 && PHOTO_RE.test(p))) throw bad(400, 'Photos must be JPEG images.');
        set.photos = photos;
        const labels = [].concat(body.photoLabels || []).slice(0, photos.length);
        set.photoLabels = photos.map((_, i) => (PHOTO_SHOTS.includes(labels[i]) ? labels[i] : 'other'));
        // New photos need a fresh check by the team
        if (JSON.stringify(photos) !== JSON.stringify(van.photos)) delete van.photosVerifiedAt;
      }
      Object.assign(van, set);
      van.petFriendly = (van.amenities || []).includes('pets');
      // Content steps are complete when the required fields are filled in
      if (core.photosComplete(van, C) && van.beds && van.sleeps && van.seats) van.verification.photos = 'verified';
      else if ('photos' in body) van.verification.photos = 'action_required';
      if (van.name && van.description.length >= 60 && van.destinationId && van.pickup.city && van.pickup.address && van.pricePerNight) van.verification.listing = 'verified';
      io.persist();
      return van;
    };

    const addDocument = (user, van, body) => {
      const type = body.type;
      if (!DOC_TYPES[type]) throw bad(400, 'Unknown document type.');
      const fileName = str(body.fileName, 200);
      if (!fileName) throw bad(400, 'Attach the document file.');
      const expiry = body.expiry ? String(body.expiry) : null;
      if (expiry && (!isDate(expiry) || daysUntil(expiry) < 1)) throw bad(400, 'Expiry date must be in the future.');
      const existing = docsFor({ vanId: van.id }).find(d => d.type === type);
      // Registry-confirmed fields (number, expiry, insurer) aren't overwritten by uploads
      const fields = { fileName, status: 'pending', note: '', submittedAt: io.now() };
      if (!existing?.check) Object.assign(fields, { number: str(body.number, 60), expiry, insurer: str(body.insurer, 80) });
      const d = upsertDoc(van.ownerId, van.id, type, existing?.label || DOC_TYPES[type], fields);
      recomputeVan(van);
      notifyAdmins(`${d.label} submitted by ${user.name} for ${van.name || 'a new van'}.`, '#/admin/verifications');
      io.audit(user.id, 'document.submit', `${d.id} ${type} for ${van.id}`);
      io.persist();
      return d;
    };

    const setBlocked = (van, blocked) => {
      const list = [].concat(blocked || []).slice(0, 200).map(r => ({ start: String(r.start), end: String(r.end), note: str(r.note, 60) }));
      if (!list.every(r => isDate(r.start) && isDate(r.end) && r.end >= r.start)) throw bad(400, 'Invalid date range.');
      van.blocked = list.sort((a, b) => a.start.localeCompare(b.start));
      io.persist();
    };

    const submitForReview = (user, van) => {
      const steps = stepStatuses(van);
      const blocking = STEP_IDS.slice(0, 10).filter(k => !['verified', 'pending'].includes(steps[k]));
      if (blocking.length) throw bad(400, 'Finish these steps first: ' + blocking.join(', '));
      if (!['draft', 'in_review'].includes(van.status) && van.verification.review !== 'rejected') throw bad(409, 'This listing has already been reviewed.');
      van.verification.review = 'pending'; van.status = 'in_review'; van.submittedAt = io.now();
      notifyAdmins(`${user.name} submitted “${van.name}” for listing approval.`, '#/admin/listings');
      io.audit(user.id, 'listing.submit', `${van.id} ${van.name}`);
      io.persist();
    };

    const setOwnerStatus = (user, van, status) => {
      const allowed = { published: 'paused', paused: 'published' };
      if (status === 'published' && van.status === 'draft') {
        const steps = stepStatuses(van);
        const missing = STEP_IDS.filter(k => steps[k] !== 'verified');
        if (missing.length) throw bad(400, 'Every step must be verified before publishing: ' + missing.join(', '));
        van.status = 'published'; van.publishedAt = io.now();
        io.audit(user.id, 'listing.publish', `${van.id} ${van.name}`);
      } else if (allowed[van.status] === status) {
        van.status = status;
        io.audit(user.id, 'listing.' + (status === 'paused' ? 'pause' : 'resume'), `${van.id} ${van.name}`);
      } else throw bad(409, `Can’t change a ${String(van.status).replace('_', ' ')} listing to ${status}.`);
      io.persist();
    };

    /* ---------- Admin actions ---------- */
    const decideDocument = (admin, docId, status, note) => {
      if (!['verified', 'action_required', 'rejected'].includes(status)) throw bad(400, 'Invalid decision.');
      if (status !== 'verified' && !str(note)) throw bad(400, 'Add a note for the owner.');
      const d = S().documents.find(x => x.id === docId);
      if (!d) throw bad(404, 'Document not found.');
      Object.assign(d, { status, note: str(note, 500), reviewedAt: io.now(), reviewedBy: admin.id });
      if (d.type === 'insurance') d.coverApproved = status === 'verified';
      if (d.vanId) recomputeVan(getVan(d.vanId)); else recomputeOwner(d.ownerId);
      notify(d.ownerId, `${d.label}: ${status.replace('_', ' ')}${note ? ' — ' + note : ''}`, '#/owner/documents');
      io.audit(admin.id, 'document.' + status, `${d.label} (${d.id})${note ? ' — ' + note : ''}`);
      io.persist();
    };

    const reviewListing = (admin, van, approve, note) => {
      if (van.status !== 'in_review') throw bad(409, 'This listing isn’t waiting for review.');
      if (approve) {
        const steps = stepStatuses(van);
        const notVerified = STEP_IDS.slice(0, 10).filter(k => steps[k] !== 'verified');
        if (notVerified.length) throw bad(400, 'Verify these steps before approving: ' + notVerified.join(', '));
        van.verification.review = 'verified'; van.status = 'draft'; van.approvedAt = io.now();
        // Approving a listing includes checking its photos show this vehicle (owner uploads only)
        if ((van.photos || []).some(p => p.startsWith('data:'))) van.photosVerifiedAt = io.now();
        notify(van.ownerId, `${van.name} is approved! Publish it from your dashboard to go live.`, `#/owner/onboarding?van=${van.id}&step=12`);
      } else {
        if (!str(note)) throw bad(400, 'Tell the owner what to change.');
        van.verification.review = 'rejected'; van.status = 'draft';
        notify(van.ownerId, `${van.name} needs changes before approval: ${note}`, `#/owner/onboarding?van=${van.id}`);
      }
      io.audit(admin.id, approve ? 'listing.approve' : 'listing.reject', `${van.id} ${van.name}${note ? ' — ' + note : ''}`);
      io.persist();
    };

    const adminSetVanStatus = (admin, van, status, note) => {
      if (status === 'suspended') {
        if (!str(note)) throw bad(400, 'Add a reason.');
        van.status = 'suspended'; van.suspendedFor = 'admin';
        notify(van.ownerId, `${van.name} was suspended by VanYatra: ${note}`, '#/owner/vans');
      } else if (status === 'published' && van.status === 'suspended') {
        van.status = 'published'; delete van.suspendedFor;
        notify(van.ownerId, `${van.name} has been reinstated.`, '#/owner/vans');
      } else throw bad(400, 'Invalid status change.');
      io.audit(admin.id, 'listing.' + (status === 'suspended' ? 'suspend' : 'reinstate'), `${van.id} ${van.name}${note ? ' — ' + note : ''}`);
      io.persist();
    };

    const remind = (admin, docId) => {
      const d = S().documents.find(x => x.id === docId);
      if (!d) throw bad(404, 'Document not found.');
      notify(d.ownerId, `Reminder: please renew ${d.label}${d.vanId ? ' for ' + (getVan(d.vanId)?.name || '') : ''}.`, '#/owner/documents');
      io.audit(admin.id, 'document.reminder', `${d.label} ${d.id}`);
      io.persist();
    };

    const suspendOwnerVans = (ownerId) => {
      for (const v of S().vans) if (v.ownerId === ownerId && v.status === 'published') { v.status = 'suspended'; v.suspendedFor = 'account'; }
      io.persist();
    };

    /* ---------- Scheduled job: document expiry ---------- */
    const runExpiryJob = () => {
      let changed = false;
      for (const d of S().documents) {
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
              io.audit('system', 'listing.suspend', `${van.id} ${van.name} — ${d.label} expired`);
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
      // Travellers: licence, passport and visa validity
      for (const [id, t] of Object.entries(S().travellers || {})) {
        for (const [part, date, label] of [['licence', t.licence?.validUpto, t.licence?.kind === 'idp' ? 'International Driving Permit' : 'Driving licence'], ['identity', t.identity?.expiry, 'Passport / visa']]) {
          if (!date || t[part].status !== 'verified') continue;
          const days = daysUntil(date);
          if (days < 0) {
            Object.assign(t[part], { status: 'action_required', note: `Expired on ${date}.` });
            notify(id, `${label} on your VanYatra profile has expired. Update it before your next trip.`, '#/account/verification');
            changed = true;
          } else if (days <= C.expiryWarningDays && !t.reminded?.[part]) {
            t.reminded = { ...(t.reminded || {}), [part]: true };
            notify(id, `${label} on your VanYatra profile expires in ${days} days.`, '#/account/verification');
            changed = true;
          }
        }
      }
      if (changed) io.persist();
    };

    /* ---------- What each user may see ---------- */
    const ownerVerified = (ownerId) => { const o = S().owners[ownerId] || {}; return OWNER_STEPS.every(k => o[k]?.status === 'verified'); };
    // Non-sensitive verification summary shown to travellers on the van page
    const trustSummary = (v) => {
      const docs = docsFor({ vanId: v.id });
      const valid = (type) => { const d = docs.find(x => x.type === type && x.status === 'verified'); return d ? { validUntil: d.expiry || null, source: d.check?.source || null } : null; };
      return {
        ownerVerified: ownerVerified(v.ownerId),
        ownership: v.verification?.ownership === 'verified' ? (docs.find(d => d.type === 'ownership_rc')?.check?.source || 'Checked by VanYatra') : null,
        rc: valid('rc'), insurance: valid('insurance'), puc: valid('puc'), inspection: valid('inspection'), permit: valid('tourist_permit'),
        lastChecked: v.registry?.checkedAt || docs.map(d => d.reviewedAt || d.check?.checkedAt).filter(Boolean).sort().at(-1) || null
      };
    };
    const verifiedFlags = () => Object.fromEntries(Object.entries(S().owners).map(([id, o]) => [id, Object.fromEntries(OWNER_STEPS.map(k => [k, { status: o[k]?.status || 'not_started' }]))]));

    const viewFor = (user) => {
      const s = S();
      const withSteps = (v) => ({ ...v, steps: stepStatuses(v), trust: trustSummary(v) });
      const publicVan = (v) => { const { regNo, rcName, chassis, registry, relation, verificationNotes, ...rest } = v; return { ...rest, trust: trustSummary(v) }; };
      // Hosts' display names so any browser can show who owns a van; admins get all accounts
      const people = (vans) => {
        if (user?.role === 'admin') return io.accounts().map(a => ({ id: a.id, name: a.name, email: a.email, role: a.role, status: a.status, createdAt: a.createdAt }));
        const ids = new Set(vans.map(v => v.ownerId));
        return io.accounts().filter(a => ids.has(a.id)).map(a => ({ id: a.id, name: a.name, role: a.role, createdAt: a.createdAt }));
      };
      if (!user) {
        const vans = s.vans.filter(v => v.status === 'published').map(publicVan);
        return { vans, documents: [], owners: verifiedFlags(), notifications: [], people: people(vans), traveller: null };
      }
      const mine = (v) => v.ownerId === user.id;
      const isAdmin = user.role === 'admin';
      const vans = s.vans.filter(v => isAdmin || mine(v) || v.status === 'published').map(v => (isAdmin || mine(v) ? withSteps(v) : publicVan(v)));
      return {
        vans,
        documents: s.documents.filter(d => isAdmin || d.ownerId === user.id),
        owners: isAdmin ? s.owners : { ...verifiedFlags(), ...(s.owners[user.id] ? { [user.id]: s.owners[user.id] } : {}) },
        notifications: s.notifications.filter(n => n.userId === user.id).slice(0, 50),
        people: people(vans),
        traveller: (s.travellers || {})[user.id] || null,
        ...(isAdmin ? { travellers: s.travellers || {} } : {})
      };
    };

    const markNotificationsRead = (user) => {
      for (const n of S().notifications) if (n.userId === user.id) n.read = true;
      io.persist();
    };

    return {
      getVan, ownVan, rollup, recomputeOwner, recomputeVan, stepStatuses, onVerification, updateOwnerProfile, addSelfie, createVan, updateVan,
      addDocument, setBlocked, submitForReview, setOwnerStatus, decideDocument, reviewListing, adminSetVanStatus, remind, suspendOwnerVans,
      runExpiryJob, viewFor, markNotificationsRead, notify, traveller, submitTravellerDocs, decideTraveller
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
