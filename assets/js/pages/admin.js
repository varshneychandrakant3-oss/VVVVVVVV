/*
 * Admin console. Every state-changing action is written to the audit log.
 */
(() => {
const { h, money, photo, fmtDate } = App;
const compact = (v) => v >= 100000 ? '₹' + (v / 100000).toFixed(1) + 'L' : v >= 1000 ? '₹' + Math.round(v / 1000) + 'k' : '₹' + v;

App.pages.admin = (el, { tab = 'overview', id }) => {
  const db = App.db;
  const pendingDocs = db.documents.filter(d => d.status === 'pending').length;
  const inReview = db.vans.filter(v => v.status === 'in_review').length;
  const openDisputes = db.disputes.filter(d => d.status === 'open').length;
  const flagged = db.reviews.filter(r => r.status === 'flagged').length;
  const risky = db.bookings.filter(b => b.risk?.score >= 50 && b.status === 'requested').length;
  const main = App.dashLayout(el, {
    title: 'Admin console', subtitle: 'VanYatra ' + App.C.name, base: '#/admin', active: tab,
    nav: [
      { id: 'overview', icon: '🏠', label: 'Overview' },
      { id: 'users', icon: '👥', label: 'Users & owners' },
      { id: 'listings', icon: '🚐', label: 'Listing approval', count: inReview },
      { id: 'verifications', icon: '🪪', label: 'KYC & documents', count: pendingDocs },
      { id: 'bookings', icon: '📋', label: 'Bookings & payments', count: risky },
      { id: 'disputes', icon: '⚖️', label: 'Disputes & refunds', count: openDisputes },
      { id: 'reviews', icon: '★', label: 'Review moderation', count: flagged },
      { id: 'destinations', icon: '🗺', label: 'Destinations' },
      { id: 'analytics', icon: '📈', label: 'Analytics' },
      { id: 'notifications', icon: '🔔', label: 'Notifications' },
      { id: 'audit', icon: '📜', label: 'Audit log' }
    ]
  });
  const views = { overview, users, listings, verifications, bookings, disputes, reviews, destinations, analytics, notifications, audit };
  (views[tab] || overview)(main, id);
};

const userName = (id) => id === 'system' ? 'System' : App.get.user(id)?.name || id;

/* ---------- Overview ---------- */
const overview = (m) => {
  const db = App.db;
  const today = App.today(), from = App.addDays(today, -30);
  const recent = db.bookings.filter(b => b.createdAt.slice(0, 10) >= from && ['confirmed', 'completed'].includes(b.status));
  const gmv = recent.reduce((s, b) => s + b.pricing.total, 0);
  const takeRev = recent.reduce((s, b) => s + b.pricing.service + b.pricing.commission, 0);
  const expiring = db.documents.filter(d => { const e = App.docExpiryState(d); return e && e.tone !== 'muted'; });
  const queue = [
    ['Documents to verify', db.documents.filter(d => d.status === 'pending').length, '#/admin/verifications'],
    ['Listings awaiting approval', db.vans.filter(v => v.status === 'in_review').length, '#/admin/listings'],
    ['Open disputes', db.disputes.filter(d => d.status === 'open').length, '#/admin/disputes'],
    ['Flagged reviews', db.reviews.filter(r => r.status === 'flagged').length, '#/admin/reviews'],
    ['High-risk booking requests', db.bookings.filter(b => b.risk?.score >= 50 && b.status === 'requested').length, '#/admin/bookings'],
    ['Documents expiring / expired', expiring.length, '#/admin/verifications?filter=expiring']
  ];
  m.innerHTML = String(h`<h1>Platform overview</h1>
    <div class="kpis">
      <div class="kpi"><span>GMV (30 days)</span><strong>${money(gmv)}</strong></div>
      <div class="kpi"><span>Platform revenue (30 days)</span><strong>${money(takeRev)}</strong><small>service fees + commission</small></div>
      <div class="kpi"><span>Bookings (30 days)</span><strong>${recent.length}</strong></div>
      <div class="kpi"><span>Live listings</span><strong>${db.vans.filter(v => v.status === 'published').length}</strong><small>of ${db.vans.length}</small></div>
    </div>
    <div class="grid-2 align-start">
      <section class="card"><h2>Work queue</h2><ul class="plain list-rows">${queue.map(([l, n, href]) => h`<li><a href="${href}">${l}</a><span class="badge ${n ? 'badge-warn' : 'badge-muted'}">${n}</span></li>`)}</ul></section>
      <section class="card"><h2>Recent activity</h2><ul class="plain list-rows small">${db.audit.slice(0, 8).map(a => h`<li><span><strong>${userName(a.actorId)}</strong> ${a.action} · ${a.target}</span><span class="muted">${App.timeAgo(a.at)}</span></li>`)}</ul><a class="link-arrow" href="#/admin/audit">Full audit log →</a></section>
    </div>
    <section class="card"><h2>GMV by month</h2>${App.barChart(App.monthly(db.bookings.filter(b => ['confirmed', 'completed'].includes(b.status)), 'start', b => b.pricing.total), { format: compact, label: 'Gross merchandise value by month' })}</section>`);
};

/* ---------- Users ---------- */
const users = (m) => {
  let q = '', role = '';
  const draw = () => {
    const list = App.db.users.filter(u => (!role || u.role === role) && (!q || (u.name + u.email).toLowerCase().includes(q)));
    m.querySelector('#u-body').innerHTML = String(h`${list.map(u => h`<tr>
      <td><div class="row gap">${App.avatar(u, 30)}<div><strong>${u.name}</strong><div class="small muted">${u.email}</div></div></div></td>
      <td>${u.role}</td>
      <td>${u.emailVerified ? '✓' : '✕'} email · ${u.phoneVerified ? '✓' : '✕'} phone${u.role === 'owner' ? h`<br>KYC ${App.statusBadge(App.db.owners[u.id]?.kyc?.status || 'not_started')}` : ''}</td>
      <td>${u.role === 'owner' ? App.db.vans.filter(v => v.ownerId === u.id).length + ' vans' : App.db.bookings.filter(b => b.customerId === u.id).length + ' bookings'}</td>
      <td>${App.pill(u.status)}</td>
      <td class="actions">${u.role !== 'admin' ? (u.status === 'active' ? h`<button class="btn btn-sm btn-ghost danger-text" data-suspend="${u.id}">Suspend</button>` : h`<button class="btn btn-sm btn-ghost" data-restore="${u.id}">Reactivate</button>`) : ''}</td></tr>`)}`);
    m.querySelectorAll('[data-suspend]').forEach(b => b.onclick = async () => {
      const u = App.get.user(b.dataset.suspend);
      const reason = await App.prompt('Suspend ' + u.name + '?', 'Reason (recorded in the audit log)');
      if (!reason) return;
      u.status = 'suspended';
      if (u.role === 'owner') App.db.vans.filter(v => v.ownerId === u.id && v.status === 'published').forEach(v => v.status = 'suspended');
      App.audit('user.suspend', `${u.email} — ${reason}`); App.save(); App.toast('User suspended'); draw();
    });
    m.querySelectorAll('[data-restore]').forEach(b => b.onclick = () => { const u = App.get.user(b.dataset.restore); u.status = 'active'; App.audit('user.reactivate', u.email); App.save(); App.toast('User reactivated', 'good'); draw(); });
  };
  m.innerHTML = String(h`<h1>Users & owners</h1>
    <div class="filter-row"><label class="field inline grow"><span class="sr-only">Search users</span><input type="search" id="u-q" placeholder="Search name or email…"></label>
      <label class="field inline"><span class="sr-only">Role</span><select id="u-role"><option value="">All roles</option><option value="customer">Customers</option><option value="owner">Owners</option><option value="admin">Admins</option></select></label></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>User</th><th>Role</th><th>Verification</th><th>Activity</th><th>Status</th><th></th></tr></thead><tbody id="u-body"></tbody></table></div>`);
  m.querySelector('#u-q').oninput = (e) => { q = e.target.value.toLowerCase(); draw(); };
  m.querySelector('#u-role').onchange = (e) => { role = e.target.value; draw(); };
  draw();
};

/* ---------- Listings ---------- */
const listings = (m) => {
  const queue = App.db.vans.filter(v => v.status === 'in_review');
  m.innerHTML = String(h`<h1>Listing approval</h1>
    <h2 class="section-sub">Awaiting review (${queue.length})</h2>
    ${queue.length ? queue.map(v => {
      const owner = App.get.user(v.ownerId);
      const steps = App.ONBOARDING_STEPS.slice(0, 10).map(s => [s, App.stepStatus(s, v.ownerId, v)]);
      const ready = steps.every(([, st]) => st === 'verified');
      return h`<article class="card review-item">
        <div class="ri-head"><img src="${photo(v.photos[0], 300)}" alt=""><div><h3>${v.name}</h3><p class="small muted">${v.type} · ${v.pickup.city} · ${money(v.pricePerNight)}/night · by ${owner.name}${v.submittedAt ? ' · submitted ' + App.timeAgo(v.submittedAt) : ''}</p><a class="link" href="#/vans/${v.id}" target="_blank">Preview listing ↗</a></div></div>
        <ul class="check-grid">${steps.map(([s, st]) => h`<li>${App.statusBadge(st)} ${s.title}</li>`)}</ul>
        <div class="row gap wrap">
          <button class="btn btn-primary" data-approve="${v.id}" ${ready ? '' : 'disabled'} title="${ready ? '' : 'All steps must be verified first'}">Approve listing</button>
          <button class="btn btn-ghost" data-changes="${v.id}">Request changes</button>
          <a class="btn btn-ghost" href="#/admin/verifications?owner=${v.ownerId}">Review documents</a>
        </div>
        ${!ready ? h`<p class="small muted">Verify the pending documents before approving.</p>` : ''}
      </article>`;
    }) : h`<p class="muted">No listings waiting. 🎉</p>`}
    <h2 class="section-sub">All listings</h2>
    <div class="table-wrap"><table class="table"><thead><tr><th>Van</th><th>Owner</th><th>Destination</th><th class="num">Price</th><th>Status</th><th></th></tr></thead><tbody>
      ${App.db.vans.map(v => h`<tr><td><a href="#/vans/${v.id}">${v.name || 'Untitled'}</a></td><td>${userName(v.ownerId)}</td><td>${App.get.dest(v.destinationId)?.name || ''}</td><td class="num">${money(v.pricePerNight)}</td><td>${App.pill(v.status)}</td>
        <td class="actions">${v.status === 'published' ? h`<button class="btn btn-sm btn-ghost danger-text" data-suspendv="${v.id}">Suspend</button>` : v.status === 'suspended' ? h`<button class="btn btn-sm btn-ghost" data-restorev="${v.id}">Reinstate</button>` : ''}</td></tr>`)}
    </tbody></table></div>`);
  m.querySelectorAll('[data-approve]').forEach(b => b.onclick = async () => {
    if (!(await App.confirm('Approve listing?', 'The owner will be notified and can publish immediately.', 'Approve'))) return;
    App.api.approveListing(b.dataset.approve, true); App.toast('Listing approved', 'good'); App.render();
  });
  m.querySelectorAll('[data-changes]').forEach(b => b.onclick = async () => {
    const note = await App.prompt('Request changes', 'What does the owner need to fix?', 'e.g. Add a clear photo of the kitchen');
    if (!note) return;
    App.api.approveListing(b.dataset.changes, false, note); App.toast('Owner notified'); App.render();
  });
  m.querySelectorAll('[data-suspendv]').forEach(b => b.onclick = async () => {
    const note = await App.prompt('Suspend listing', 'Reason (sent to the owner)');
    if (!note) return;
    const v = App.get.van(b.dataset.suspendv); v.status = 'suspended';
    App.notify(v.ownerId, `${v.name} was suspended by VanYatra: ${note}`, '#/owner/vans'); App.audit('listing.suspend', `${v.id} ${v.name} — ${note}`); App.save(); App.render();
  });
  m.querySelectorAll('[data-restorev]').forEach(b => b.onclick = () => { const v = App.get.van(b.dataset.restorev); v.status = 'published'; App.audit('listing.reinstate', v.id + ' ' + v.name); App.notify(v.ownerId, `${v.name} has been reinstated.`, '#/owner/vans'); App.save(); App.render(); });
};

/* ---------- Verifications ---------- */
const VAHAN_TYPES = ['rc', 'puc', 'insurance', 'tourist_permit'];
const recheckVan = async (van) => {
  const r = await App.verify.run('vehicle', { regNo: van.regNo, relation: van.relation || 'owner', vanId: van.id, subjectId: van.ownerId });
  if (r.data.docs) App.applyVehicleCheck(van, r);
  App.audit('document.registry_recheck', `${van.id} ${van.regNo} → ${r.status}`);
  App.save();
  return r;
};
// Seeded demo vans store the registration number only on their RC document
const regNoOf = (van) => van.regNo || (App.db.documents.find(d => d.vanId === van.id && d.type === 'rc')?.number || '').replace(/[\s-]/g, '');

const verifications = (m) => {
  const q = App.parseHash().query;
  let filter = q.filter || 'pending';
  const draw = async () => {
    if (filter === 'checks') return drawChecks();
    let list = App.db.documents;
    if (q.owner) list = list.filter(d => d.ownerId === q.owner);
    if (filter === 'pending') list = list.filter(d => d.status === 'pending');
    else if (filter === 'attention') list = list.filter(d => ['action_required', 'rejected'].includes(d.status));
    else if (filter === 'expiring') list = list.filter(d => { const e = App.docExpiryState(d); return e && e.tone !== 'muted'; });
    list = [...list].sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
    const expiringVans = [...new Set(list.filter(d => d.vanId && VAHAN_TYPES.includes(d.type)).map(d => d.vanId))];
    m.innerHTML = String(h`${header()}
      ${filter === 'expiring' && expiringVans.length && App.serverOnline ? h`<div class="callout row-between wrap"><span>Renewed documents often show up in VAHAN before owners upload them.</span><button class="btn btn-sm" id="bulk">↻ Re-check ${App.plural(expiringVans.length, 'vehicle')} with VAHAN</button></div>` : ''}
      ${list.length ? h`<div class="table-wrap"><table class="table"><thead><tr><th>Document</th><th>Owner / vehicle</th><th>Details</th><th>Expiry</th><th>Status</th><th>Decision</th></tr></thead><tbody>
        ${list.map(d => { const ex = App.docExpiryState(d); const van = d.vanId && App.get.van(d.vanId); return h`<tr>
          <td><strong>${d.label}</strong><br><span class="small muted">📎 ${d.fileName || 'no file'}${d.submittedAt ? ' · ' + App.timeAgo(d.submittedAt) : ''}</span>${d.check ? h`<br><span class="source-tag">✓ ${d.check.source} · ${App.timeAgo(d.check.checkedAt)}</span>` : ''}</td>
          <td>${userName(d.ownerId)}<br><span class="small muted">${van ? van.name : 'Owner KYC'}</span></td>
          <td>${d.number || '—'}${d.insurer ? h`<br><span class="small muted">${d.insurer}</span>` : ''}</td>
          <td>${ex ? h`<span class="badge badge-${ex.tone}">${ex.label}</span>` : '—'}</td>
          <td>${App.statusBadge(d.status)}${d.note ? h`<div class="small muted">${d.note}</div>` : ''}</td>
          <td class="actions">
            ${d.status !== 'verified' ? h`<button class="btn btn-sm btn-primary" data-dec="verified" data-doc="${d.id}">Verify</button>` : ''}
            <button class="btn btn-sm btn-ghost" data-dec="action_required" data-doc="${d.id}">Needs action</button>
            ${d.status !== 'rejected' ? h`<button class="btn btn-sm btn-ghost danger-text" data-dec="rejected" data-doc="${d.id}">Reject</button>` : ''}
            ${van && VAHAN_TYPES.includes(d.type) && App.serverOnline && regNoOf(van) ? h`<button class="btn btn-sm btn-ghost" data-recheck="${van.id}">↻ Re-check VAHAN</button>` : ''}
            ${ex && ex.tone !== 'muted' ? h`<button class="btn btn-sm btn-ghost" data-remind="${d.id}">Send reminder</button>` : ''}
          </td></tr>`; })}
      </tbody></table></div>` : App.emptyState('🪪', 'Nothing in this queue', 'All caught up.')}
      <p class="small muted">Documents marked with a source were checked automatically against government records. Still review by hand: selfie vs Aadhaar photo, rent-a-cab licence, fitness certificate, NOCs, and that insurance covers commercial self-drive rental.</p>`);
    bindTabs();
    m.querySelectorAll('[data-dec]').forEach(b => b.onclick = async () => {
      const status = b.dataset.dec;
      let note = '';
      if (status !== 'verified') { note = await App.prompt(status === 'rejected' ? 'Reject document' : 'Request action', 'Explain what the owner needs to do'); if (!note) return; }
      App.api.reviewDocument(b.dataset.doc, status, note);
      App.toast('Decision recorded', 'good'); draw();
    });
    m.querySelectorAll('[data-recheck]').forEach(b => b.onclick = async () => {
      const van = App.get.van(b.dataset.recheck);
      van.regNo = regNoOf(van);
      b.disabled = true; b.textContent = 'Checking…';
      try { const r = await recheckVan(van); App.toast(`${van.name}: VAHAN check ${r.status}`, r.status === 'failed' ? 'bad' : 'good'); }
      catch (e) { App.toast(e.message, 'bad'); }
      draw();
    });
    const bulk = m.querySelector('#bulk');
    if (bulk) bulk.onclick = async () => {
      bulk.disabled = true;
      let n = 0;
      for (const id of expiringVans) {
        const van = App.get.van(id); van.regNo = regNoOf(van);
        bulk.textContent = `Checking ${++n} of ${expiringVans.length}…`;
        try { await recheckVan(van); } catch (e) { App.toast(`${van.name}: ${e.message}`, 'bad'); }
      }
      App.toast('VAHAN re-check complete', 'good'); draw();
    };
    m.querySelectorAll('[data-remind]').forEach(b => b.onclick = () => { const d = App.db.documents.find(x => x.id === b.dataset.remind); App.notify(d.ownerId, `Reminder: please renew ${d.label}${d.vanId ? ' for ' + App.get.van(d.vanId).name : ''} (${App.docExpiryState(d).label}).`, '#/owner/documents'); App.audit('document.reminder', d.label + ' ' + d.id); App.save(); App.toast('Reminder sent', 'good'); });
  };

  const header = () => h`<h1>KYC & document verification</h1>
    ${q.owner ? h`<p>Showing documents for <strong>${userName(q.owner)}</strong> · <a href="#/admin/verifications">show all</a></p>` : ''}
    <div class="tabs" role="tablist">${[['pending', 'Pending review'], ['attention', 'Action required / rejected'], ['expiring', 'Expiring & expired'], ['all', 'All documents'], ['checks', 'Government checks log']].map(([k, l]) => h`<button role="tab" aria-selected="${k === filter}" class="${k === filter ? 'on' : ''}" data-f="${k}">${l}</button>`)}</div>`;
  const bindTabs = () => m.querySelectorAll('[data-f]').forEach(t => t.onclick = () => { filter = t.dataset.f; draw(); });

  // Server-side record of every government check (the source of truth)
  const drawChecks = async () => {
    m.innerHTML = String(h`${header()}<p class="muted">Loading…</p>`);
    bindTabs();
    if (!App.serverOnline) { m.querySelector('p.muted').textContent = 'The verification server is offline. Start it with npm start.'; return; }
    let records;
    try { ({ records } = await App.server('GET', '/api/admin/verifications' + (q.owner ? '?subjectId=' + encodeURIComponent(q.owner) : ''))); }
    catch (e) { m.querySelector('p.muted').textContent = e.message; return; }
    const labels = { aadhaar: 'Aadhaar', pan: 'PAN', gstin: 'GSTIN', vehicle: 'Vehicle (VAHAN)', dl: 'Driving licence', bank: 'Bank account' };
    m.innerHTML = String(h`${header()}
      <p class="small muted">Every automated check made against government sources, as recorded by the server (${App.verifyConfig.provider}). Identifiers are masked.</p>
      ${records.length ? h`<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Person</th><th>Check</th><th>Reference</th><th>Outcome</th><th>Details</th></tr></thead><tbody>
        ${records.map(r => h`<tr><td>${App.fmtDateTime(r.checkedAt)}</td><td>${r.subjectName || r.subjectId}${r.actorId !== r.subjectId ? h`<br><span class="small muted">by ${userName(r.actorId)}</span>` : ''}</td>
          <td>${labels[r.type] || r.type}<br><span class="small muted">${r.source}</span></td><td><code>${r.ref || '—'}</code></td>
          <td><span class="badge badge-${r.status === 'verified' ? 'good' : r.status === 'review' ? 'warn' : 'bad'}">${r.status}</span></td>
          <td class="small">${r.reasons.map(x => h`<div>${x.level === 'ok' ? '✓' : x.level === 'review' ? '!' : '✕'} ${x.text}</div>`)}</td></tr>`)}
      </tbody></table></div>` : App.emptyState('🔎', 'No checks yet', 'Checks appear here as owners and travellers verify documents.')}`);
    bindTabs();
  };
  draw();
};

/* ---------- Bookings ---------- */
const bookings = (m) => {
  let status = '', riskOnly = false, q = '';
  const draw = () => {
    const list = App.db.bookings.filter(b => (!status || b.status === status) && (!riskOnly || b.risk?.score >= 50) && (!q || (b.id + App.get.user(b.customerId).name + App.get.van(b.vanId).name).toLowerCase().includes(q)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    m.querySelector('#b-body').innerHTML = String(h`${list.slice(0, 80).map(b => h`<tr>
      <td>${b.id}<br><span class="small muted">${fmtDate(b.createdAt)}</span></td>
      <td>${userName(b.customerId)}</td><td>${App.get.van(b.vanId).name}<br><span class="small muted">${userName(b.ownerId)}</span></td>
      <td>${fmtDate(b.start)} → ${fmtDate(b.end)}</td>
      <td class="num">${money(b.pricing.total)}<br><span class="small muted">${b.paymentStatus}</span></td>
      <td>${App.pill(b.status)}${b.risk?.score >= 50 ? h`<br><span class="badge badge-serious" title="${b.risk.flags.join('; ')}">⚠ Risk ${b.risk.score}</span>` : ''}</td>
      <td class="actions"><button class="btn btn-sm btn-ghost" data-view="${b.id}">Details</button>${['confirmed', 'requested'].includes(b.status) ? h`<button class="btn btn-sm btn-ghost danger-text" data-acancel="${b.id}">Cancel & refund</button>` : ''}</td></tr>`)}`);
    m.querySelector('#b-count').textContent = `${list.length} bookings`;
    m.querySelectorAll('[data-view]').forEach(b => b.onclick = () => {
      const bk = App.get.booking(b.dataset.view);
      App.modal({ title: 'Booking ' + bk.id, body: h`<dl class="trip-lines"><div><dt>Traveller</dt><dd>${userName(bk.customerId)}</dd></div><div><dt>Driver</dt><dd>${bk.driver?.name}, age ${bk.driver?.age}, licence ${bk.driver?.licenceMasked}${bk.driver?.check ? h`<br><span class="source-tag">${bk.driver.check.status === 'verified' ? '✓' : '!'} ${bk.driver.check.source}${bk.driver.check.validUpto ? ' · valid until ' + fmtDate(bk.driver.check.validUpto) : ''}</span>` : h`<br><span class="small muted">Licence not checked with SARATHI</span>`}</dd></div><div><dt>Van</dt><dd>${App.get.van(bk.vanId).name}</dd></div><div><dt>Dates</dt><dd>${fmtDate(bk.start)} → ${fmtDate(bk.end)}</dd></div><div><dt>Deposit</dt><dd>${money(bk.pricing.deposit)} · ${bk.depositStatus}</dd></div><div><dt>Risk</dt><dd>${bk.risk?.score || 0}/100 ${bk.risk?.flags?.length ? h`<ul>${bk.risk.flags.map(f => h`<li>${f}</li>`)}</ul>` : ''}</dd></div></dl>${App.priceLines(bk.pricing)}<p class="small muted">Platform take: ${money(bk.pricing.service + bk.pricing.commission)} · owner payout ${money(bk.pricing.ownerPayout)}</p>` });
    });
    m.querySelectorAll('[data-acancel]').forEach(b => b.onclick = async () => {
      const reason = await App.prompt('Cancel with full refund', 'Reason (shared with both parties)');
      if (!reason) return;
      App.api.cancelBooking(b.dataset.acancel, 'VanYatra', reason); App.toast('Booking cancelled and refunded'); draw();
    });
  };
  m.innerHTML = String(h`<h1>Bookings & payments</h1>
    <div class="filter-row"><label class="field inline grow"><span class="sr-only">Search</span><input type="search" id="b-q" placeholder="Search booking ID, traveller, van…"></label>
      <label class="field inline"><span class="sr-only">Status</span><select id="b-status"><option value="">All statuses</option>${['requested', 'confirmed', 'completed', 'cancelled', 'declined'].map(s => h`<option>${s}</option>`)}</select></label>
      <label class="check"><input type="checkbox" id="b-risk"> High risk only</label><span class="muted small" id="b-count"></span></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Booking</th><th>Traveller</th><th>Van / owner</th><th>Dates</th><th class="num">Total</th><th>Status</th><th></th></tr></thead><tbody id="b-body"></tbody></table></div>`);
  m.querySelector('#b-q').oninput = (e) => { q = e.target.value.toLowerCase(); draw(); };
  m.querySelector('#b-status').onchange = (e) => { status = e.target.value; draw(); };
  m.querySelector('#b-risk').onchange = (e) => { riskOnly = e.target.checked; draw(); };
  draw();
};

/* ---------- Disputes ---------- */
const disputes = (m) => {
  const list = [...App.db.disputes].sort((a, b) => (a.status === 'open' ? -1 : 1) - (b.status === 'open' ? -1 : 1) || b.createdAt.localeCompare(a.createdAt));
  m.innerHTML = String(h`<h1>Disputes & refunds</h1>
    ${list.length ? list.map(d => { const b = App.get.booking(d.bookingId); return h`<article class="card">
      <div class="row-between wrap"><h3>${d.id.toUpperCase()} · booking ${d.bookingId}</h3>${App.pill(d.status)}</div>
      <p class="small muted">Raised by ${d.raisedBy} · ${App.timeAgo(d.createdAt)}${b ? h` · ${App.get.van(b.vanId).name} · ${userName(b.customerId)} ↔ ${userName(b.ownerId)} · paid ${money(b.pricing.total)} · deposit ${money(b.pricing.deposit)} (${b.depositStatus})` : ''}</p>
      <p>${d.reason}</p><p><strong>Amount in question: ${money(d.amount)}</strong></p>
      ${d.resolution ? h`<div class="reply"><strong>Resolution</strong><p>${d.resolution}</p></div>` : ''}
      ${d.status === 'open' ? h`<div class="row gap wrap"><button class="btn btn-primary btn-sm" data-resolve="${d.id}">Resolve with refund / charge</button><button class="btn btn-ghost btn-sm" data-reject="${d.id}">Close without action</button></div>` : ''}
    </article>`; }) : App.emptyState('⚖️', 'No disputes', '')}`);
  m.querySelectorAll('[data-resolve]').forEach(btn => btn.onclick = async () => {
    const d = App.db.disputes.find(x => x.id === btn.dataset.resolve);
    const b = App.get.booking(d.bookingId);
    const res = await App.modal({
      title: 'Resolve ' + d.id.toUpperCase(),
      body: h`<label class="field"><span>Outcome</span><select id="r-type"><option value="refund">Refund traveller</option><option value="deposit">Deduct from deposit (pay owner)</option></select></label>
        <label class="field"><span>Amount</span><input type="number" id="r-amt" min="0" max="${b ? b.pricing.total : 100000}" value="${d.amount}"></label>
        <label class="field"><span>Resolution note (shared with both parties)</span><textarea id="r-note" rows="3"></textarea></label>`,
      actions: [{ label: 'Cancel', value: null }, { label: 'Resolve', primary: true, validate: (mm) => !!mm.querySelector('#r-note').value.trim() || (App.toast('Add a note.', 'bad'), false), value: (mm) => ({ type: mm.querySelector('#r-type').value, amount: +mm.querySelector('#r-amt').value, note: mm.querySelector('#r-note').value.trim() }) }]
    });
    if (!res) return;
    d.status = 'resolved'; d.resolution = `${res.type === 'refund' ? 'Refunded traveller' : 'Deducted from deposit'} ${money(res.amount)}. ${res.note}`;
    if (b) {
      App.db.transactions.unshift({ id: App.uid('tx'), type: res.type === 'refund' ? 'refund' : 'payout', bookingId: b.id, customerId: b.customerId, ownerId: b.ownerId, amount: res.amount, at: new Date().toISOString(), status: res.type === 'refund' ? 'refunded' : 'paid' });
      [b.customerId, b.ownerId].forEach(u => App.notify(u, `Dispute on ${b.id} resolved: ${d.resolution}`));
    }
    App.audit('dispute.resolve', `${d.id} — ${d.resolution}`); App.save(); App.render();
  });
  m.querySelectorAll('[data-reject]').forEach(btn => btn.onclick = async () => {
    const note = await App.prompt('Close dispute', 'Reason (shared with both parties)');
    if (!note) return;
    const d = App.db.disputes.find(x => x.id === btn.dataset.reject);
    d.status = 'rejected'; d.resolution = note;
    const b = App.get.booking(d.bookingId);
    if (b) [b.customerId, b.ownerId].forEach(u => App.notify(u, `Dispute on ${b.id} closed: ${note}`));
    App.audit('dispute.close', `${d.id} — ${note}`); App.save(); App.render();
  });
};

/* ---------- Reviews ---------- */
const reviews = (m) => {
  const flagged = App.db.reviews.filter(r => r.status === 'flagged');
  const recent = App.db.reviews.filter(r => r.status !== 'flagged').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
  const card = (r) => h`<article class="review card">${App.avatar(App.get.user(r.authorId), 36)}<div class="grow">
    <div class="row-between wrap"><strong>${userName(r.authorId)} → ${App.get.van(r.vanId)?.name}</strong>${App.pill(r.status)}</div>
    <div class="small muted">${fmtDate(r.createdAt)} · ${'★'.repeat(r.rating)}${r.flagReason ? ' · ' + r.flagReason : ''}</div><p>${r.text}</p>
    <div class="row gap">${r.status !== 'published' ? h`<button class="btn btn-sm btn-primary" data-pub="${r.id}">Publish</button>` : ''}${r.status !== 'removed' ? h`<button class="btn btn-sm btn-ghost danger-text" data-rm="${r.id}">Remove</button>` : ''}</div></div></article>`;
  m.innerHTML = String(h`<h1>Review moderation</h1><p class="muted small">Reviews are auto-flagged for contact details, links or abuse, and when reported by owners.</p>
    <h2 class="section-sub">Flagged (${flagged.length})</h2>${flagged.length ? flagged.map(card) : h`<p class="muted">Nothing flagged.</p>`}
    <h2 class="section-sub">Recent</h2>${recent.map(card)}`);
  m.querySelectorAll('[data-pub]').forEach(b => b.onclick = () => { const r = App.db.reviews.find(x => x.id === b.dataset.pub); r.status = 'published'; r.flagReason = ''; App.audit('review.publish', r.id); App.save(); App.render(); });
  m.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
    if (!(await App.confirm('Remove review?', 'It will be hidden from the listing. The author is notified.', 'Remove', true))) return;
    const r = App.db.reviews.find(x => x.id === b.dataset.rm); r.status = 'removed';
    App.notify(r.authorId, 'Your review was removed for breaking our review guidelines.'); App.audit('review.remove', r.id); App.save(); App.render();
  });
};

/* ---------- Destinations ---------- */
const destinations = (m) => {
  m.innerHTML = String(h`<div class="row-between wrap"><h1>Destinations & content</h1><button class="btn btn-primary" id="add-dest">＋ Add destination</button></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Destination</th><th>Best time</th><th>Family</th><th class="num">Vans</th><th class="num">Campsites</th><th></th></tr></thead><tbody>
    ${App.db.destinations.map(d => h`<tr><td><div class="row gap"><img class="thumb" src="${photo(d.hero, 120)}" alt=""><div><strong>${d.name}</strong><div class="small muted">${d.tagline}</div></div></div></td><td>${d.bestTime}</td><td>${'★'.repeat(d.familyScore)}</td><td class="num">${App.db.vans.filter(v => v.destinationId === d.id && v.status === 'published').length}</td><td class="num">${d.campsites.length}</td>
      <td class="actions"><button class="btn btn-sm btn-ghost" data-edit="${d.id}">Edit</button><a class="btn btn-sm btn-ghost" href="#/destinations/${d.id}">View</a></td></tr>`)}
    </tbody></table></div>`);
  const edit = async (d) => {
    const isNew = !d;
    d = d || { id: '', name: '', region: '', lat: 22, lng: 79, tagline: '', hero: '', gallery: [], bestTime: '', bestMonths: [], familyScore: 3, familyNotes: '', highlights: [], attractions: [], activities: [], routes: [], campsites: [] };
    const res = await App.modal({
      title: isNew ? 'Add destination' : 'Edit ' + d.name, wide: true,
      body: h`<form id="dest-form" class="grid-2">
        <label class="field"><span>Name</span><input name="name" value="${d.name}" required></label>
        <label class="field"><span>Region / state</span><input name="region" value="${d.region}" required></label>
        <label class="field span-2"><span>Tagline</span><input name="tagline" value="${d.tagline}" required></label>
        <label class="field"><span>Hero image (Unsplash id or https URL)</span><input name="hero" value="${d.hero}"></label>
        <label class="field"><span>Best time to visit</span><input name="bestTime" value="${d.bestTime}"></label>
        <label class="field"><span>Best months (1–12, comma separated)</span><input name="bestMonths" value="${d.bestMonths.join(',')}"></label>
        <label class="field"><span>Family score (1–5)</span><input type="number" name="familyScore" min="1" max="5" value="${d.familyScore}"></label>
        <label class="field"><span>Latitude</span><input type="number" step="0.0001" name="lat" value="${d.lat}"></label>
        <label class="field"><span>Longitude</span><input type="number" step="0.0001" name="lng" value="${d.lng}"></label>
        <label class="field span-2"><span>Family notes</span><textarea name="familyNotes" rows="2">${d.familyNotes}</textarea></label>
        <label class="field"><span>Highlights (one per line)</span><textarea name="highlights" rows="4">${d.highlights.join('\n')}</textarea></label>
        <label class="field"><span>Attractions (one per line)</span><textarea name="attractions" rows="4">${d.attractions.join('\n')}</textarea></label>
        <label class="field span-2"><span>Activities (one per line)</span><textarea name="activities" rows="3">${d.activities.join('\n')}</textarea></label>
      </form>`,
      actions: [{ label: 'Cancel', value: null }, { label: 'Save', primary: true, validate: (mm) => mm.querySelector('#dest-form').reportValidity(), value: (mm) => App.formData(mm.querySelector('#dest-form')) }]
    });
    if (!res) return;
    const lines = (s) => s.split('\n').map(x => x.trim()).filter(Boolean);
    const hero = res.hero.trim();
    if (hero && !hero.startsWith('photo-') && !/^https:\/\//.test(hero)) return App.toast('Image must be an Unsplash id or https URL.', 'bad');
    Object.assign(d, { name: res.name.trim(), region: res.region.trim(), tagline: res.tagline.trim(), hero: hero || d.hero, bestTime: res.bestTime, bestMonths: res.bestMonths.split(',').map(Number).filter(n => n >= 1 && n <= 12), familyScore: Math.min(5, Math.max(1, +res.familyScore)), familyNotes: res.familyNotes, lat: +res.lat, lng: +res.lng, highlights: lines(res.highlights), attractions: lines(res.attractions), activities: lines(res.activities) });
    if (isNew) { d.id = d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || App.uid('d'); App.db.destinations.push(d); }
    App.audit(isNew ? 'destination.create' : 'destination.update', d.name); App.save(); App.toast('Destination saved', 'good'); App.render();
  };
  m.querySelector('#add-dest').onclick = () => edit(null);
  m.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => edit(App.get.dest(b.dataset.edit)));
};

/* ---------- Analytics ---------- */
const analytics = (m) => {
  const db = App.db;
  const paid = db.bookings.filter(b => ['confirmed', 'completed'].includes(b.status));
  const all = db.bookings;
  const cancelRate = all.length ? all.filter(b => b.status === 'cancelled').length / all.length : 0;
  const pub = db.vans.filter(v => v.status === 'published').map(v => v.id);
  const today = App.today();
  const byDest = db.destinations.map(d => {
    const bs = paid.filter(b => App.get.van(b.vanId).destinationId === d.id);
    return { d, n: bs.length, gmv: bs.reduce((s, b) => s + b.pricing.total, 0) };
  }).sort((a, b) => b.gmv - a.gmv);
  m.innerHTML = String(h`<h1>Platform analytics</h1>
    <div class="kpis">
      <div class="kpi"><span>Total GMV</span><strong>${money(paid.reduce((s, b) => s + b.pricing.total, 0))}</strong></div>
      <div class="kpi"><span>Avg. booking value</span><strong>${money(paid.reduce((s, b) => s + b.pricing.total, 0) / (paid.length || 1))}</strong></div>
      <div class="kpi"><span>Occupancy (90 days)</span><strong>${Math.round(App.occupancy(pub, App.addDays(today, -90), today) * 100)}%</strong></div>
      <div class="kpi"><span>Cancellation rate</span><strong>${(cancelRate * 100).toFixed(1)}%</strong></div>
      <div class="kpi"><span>Customers</span><strong>${db.users.filter(u => u.role === 'customer').length}</strong></div>
      <div class="kpi"><span>Owners</span><strong>${db.users.filter(u => u.role === 'owner').length}</strong><small>${db.users.filter(u => u.role === 'owner' && App.get.ownerVerified(u.id)).length} verified</small></div>
    </div>
    <section class="card"><h2>Bookings by month</h2>${App.barChart(App.monthly(paid, 'start', () => 1), { label: 'Bookings by month' })}</section>
    <section class="card"><h2>Platform revenue by month</h2>${App.barChart(App.monthly(paid, 'start', b => b.pricing.service + b.pricing.commission), { format: compact, label: 'Platform revenue by month' })}</section>
    <section class="card"><h2>Top destinations</h2><div class="table-wrap"><table class="table"><thead><tr><th>Destination</th><th class="num">Bookings</th><th class="num">GMV</th></tr></thead><tbody>
      ${byDest.map(r => h`<tr><td>${r.d.name}</td><td class="num">${r.n}</td><td class="num">${money(r.gmv)}</td></tr>`)}</tbody></table></div></section>`);
};

/* ---------- Notifications ---------- */
const notifications = (m) => {
  const me = App.me();
  const mine = App.db.notifications.filter(n => n.userId === me.id).slice(0, 15);
  m.innerHTML = String(h`<h1>Notifications & email</h1>
    <form class="card" id="bc"><h2>Send an announcement</h2>
      <div class="grid-2"><label class="field"><span>Audience</span><select name="aud"><option value="all">Everyone</option><option value="customer">Travellers</option><option value="owner">Owners</option></select></label>
      <label class="check"><input type="checkbox" name="email" checked> Also send by email</label></div>
      <label class="field"><span>Message</span><textarea name="msg" rows="3" required maxlength="300"></textarea></label>
      <button class="btn btn-primary">Send</button></form>
    <section class="card"><h2>Admin inbox & support tickets</h2><ul class="plain list-rows small">${mine.map(n => h`<li><span>${n.text}</span><span class="muted">${App.timeAgo(n.at)}</span></li>`)}</ul></section>
    <section class="card"><h2>Email outbox (last 25)</h2><p class="small muted">Transactional emails queued for the email provider.</p>
      ${App.db.outbox.length ? h`<div class="table-wrap"><table class="table"><thead><tr><th>To</th><th>Subject</th><th>Queued</th></tr></thead><tbody>${App.db.outbox.slice(0, 25).map(e => h`<tr><td>${e.to}</td><td>${e.subject}</td><td>${App.timeAgo(e.at)}</td></tr>`)}</tbody></table></div>` : h`<p class="muted">No emails queued yet. Make a booking to see one here.</p>`}</section>`);
  m.querySelector('#bc').onsubmit = async (e) => {
    e.preventDefault();
    const d = App.formData(e.target);
    const targets = App.db.users.filter(u => u.status === 'active' && (d.aud === 'all' ? u.role !== 'admin' : u.role === d.aud));
    if (!(await App.confirm('Send announcement?', `This goes to ${targets.length} users${d.email ? ' by in-app notification and email' : ''}.`, 'Send'))) return;
    targets.forEach(u => App.notify(u.id, d.msg.trim(), '', !!d.email));
    App.audit('notification.broadcast', `${d.aud} (${targets.length}) — ${d.msg.slice(0, 60)}`); App.save(); App.toast('Announcement sent', 'good'); App.render();
  };
};

/* ---------- Audit log ---------- */
const audit = (m) => {
  let q = '';
  const draw = () => {
    const list = App.db.audit.filter(a => !q || (a.action + a.target + userName(a.actorId)).toLowerCase().includes(q));
    m.querySelector('#a-body').innerHTML = String(h`${list.slice(0, 200).map(a => h`<tr><td>${App.fmtDateTime(a.at)}</td><td>${userName(a.actorId)}</td><td><code>${a.action}</code></td><td>${a.target}</td></tr>`)}`);
  };
  m.innerHTML = String(h`<h1>Audit log</h1><p class="small muted">Immutable record of sign-ins, verification decisions, listing changes, refunds and data requests.</p>
    <label class="field"><span class="sr-only">Filter</span><input type="search" id="a-q" placeholder="Filter by action, user or target…"></label>
    <div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead><tbody id="a-body"></tbody></table></div>`);
  m.querySelector('#a-q').oninput = (e) => { q = e.target.value.toLowerCase(); draw(); };
  draw();
};
})();
