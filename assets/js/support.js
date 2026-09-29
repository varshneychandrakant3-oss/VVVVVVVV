/*
 * Support: help-centre search, live chat entry point, and trip-time safety
 * (a roadside-help bar during active trips and an SOS button with location sharing).
 *
 * Live chat and SOS alerts use the in-app inbox in the demo; live, route them to
 * the support desk / on-call team (e.g. a helpdesk API) — see README.
 */
window.App = window.App || {};
(() => {
  const h = (...a) => App.h(...a);
  const text = (x) => String(x).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  /* ---------- Help search ---------- */
  const index = () => [
    ...(App.FAQ || []).flatMap(([sec, items]) => items.map(([q, a]) => ({ title: q, body: a, href: '#/help/faq', kind: 'FAQ · ' + sec }))),
    ...Object.entries(App.POLICY || {}).map(([id, [t, body]]) => ({ title: t, body: text(body), href: '#/help/' + id, kind: 'Policy' })),
    ...(App.GUIDE || []).map(([id, t, body]) => ({ title: t, body: text(body), href: '#/guide?s=' + id, kind: 'First-timer’s guide' })),
    ...App.db.destinations.map(d => ({ title: `${d.name}: permits, fuel and roads`, body: text(JSON.stringify(App.TRIP_GUIDES?.[d.id]?.practical || '')), href: '#/destinations/' + d.id, kind: 'Destination guide' }))
  ];
  App.searchHelp = (q) => {
    const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    if (!words.length) return [];
    return index().map(x => {
      const t = x.title.toLowerCase(), b = x.body.toLowerCase();
      const score = words.reduce((s, w) => s + (t.includes(w) ? 3 : 0) + (b.includes(w) ? 1 : 0), 0);
      const at = words.map(w => b.indexOf(w)).find(i => i >= 0) ?? -1;
      return { ...x, score, snippet: at >= 0 ? (at > 40 ? '…' : '') + x.body.slice(Math.max(0, at - 40), at + 120) + '…' : x.body.slice(0, 140) + '…' };
    }).filter(x => x.score >= words.length).sort((a, b) => b.score - a.score).slice(0, 8);
  };
  App.bindHelpSearch = (root) => {
    const input = root.querySelector('#help-q'), out = root.querySelector('#help-results');
    if (!input) return;
    input.oninput = () => {
      const q = input.value.trim(), res = App.searchHelp(q);
      out.innerHTML = String(!q ? '' : res.length
        ? h`<p class="small muted" role="status">${App.plural(res.length, 'result')}</p><ul class="plain help-results">${res.map(r => h`<li><a href="${r.href}"><strong>${r.title}</strong></a><span class="small muted">${r.kind}</span><p class="small">${r.snippet}</p></li>`)}</ul>`
        : h`<p class="small" role="status">Nothing found. <button type="button" class="link" data-chat>Ask us in chat</button> or <a href="#/help/support">send a message</a>.</p>`);
      out.querySelector('[data-chat]')?.addEventListener('click', () => App.openSupportChat(q));
    };
  };

  /* ---------- Live chat ---------- */
  App.openSupportChat = async (prefill = '') => {
    const me = App.me();
    const key = me ? me.id : 'guest';
    App.db.supportChats = App.db.supportChats || {};
    const chat = App.db.supportChats[key] = App.db.supportChats[key] || [];
    const hours = new Date().getHours();
    const draw = (m) => {
      m.querySelector('#sc-body').innerHTML = String(chat.length ? h`${chat.map(x => h`<div class="msg ${x.from === 'me' ? 'me' : ''}"><p>${x.text}</p><time class="small muted">${App.fmtDateTime(x.at)}</time></div>`)}`
        : h`<p class="muted small center">Ask about a booking, payment, the van or your route.</p>`);
      const b = m.querySelector('#sc-body'); b.scrollTop = b.scrollHeight;
    };
    await App.modal({
      title: 'Chat with VanYatra',
      body: h`<p class="small muted">${hours >= 8 && hours < 22 ? 'We usually reply within 5 minutes.' : 'Our team is back at 8 am; we’ll reply here and by email.'} Emergency? Call <a href="tel:${App.C.emergencyNumber}">${App.C.emergencyNumber}</a> or roadside help <a href="tel:${App.C.supportPhone}">${App.C.supportPhone}</a>.</p>
        <div class="chat-body support-chat" id="sc-body"></div>
        <form class="chat-form" id="sc-form"><label class="sr-only" for="sc-input">Message</label><textarea id="sc-input" rows="2" maxlength="1000" required>${prefill}</textarea><button class="btn btn-primary">Send</button></form>`,
      actions: [{ label: 'Close', value: null }],
      onMount: (m) => {
        draw(m);
        m.querySelector('#sc-form').onsubmit = (e) => {
          e.preventDefault();
          const input = m.querySelector('#sc-input'), t = input.value.trim();
          if (!t) return;
          chat.push({ from: 'me', text: t, at: new Date().toISOString() });
          // Suggest an article straight away, then hand over to a person
          const hit = App.searchHelp(t)[0];
          chat.push({ from: 'support', text: `Thanks${me ? ', ' + me.name.split(' ')[0] : ''} — a support specialist has your message and will reply here.${hit ? ` Meanwhile, this may help: “${hit.title}”.` : ''}`, at: new Date().toISOString() });
          App.db.users.filter(u => u.role === 'admin').forEach(a => App.notify(a.id, `Support chat from ${me ? me.name : 'a guest'}: ${t.slice(0, 80)}`, '#/admin/notifications', false));
          App.track('support_chat', {});
          App.save(); input.value = ''; draw(m);
        };
      }
    });
  };

  /* ---------- Trip-time safety ---------- */
  App.activeTrip = () => {
    const me = App.me(), today = App.today();
    return me && App.db.bookings.find(b => b.customerId === me.id && b.status === 'confirmed' && b.start <= today && today <= b.end);
  };
  App.renderTripBar = () => {
    let bar = document.getElementById('trip-bar');
    const b = App.activeTrip();
    if (!b) { if (bar) bar.remove(); document.body.classList.remove('on-trip'); return; }
    if (!bar) { bar = document.createElement('div'); bar.id = 'trip-bar'; bar.className = 'trip-bar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Help during your trip'); document.getElementById('site-header').after(bar); }
    document.body.classList.add('on-trip');
    const van = App.get.van(b.vanId);
    bar.innerHTML = String(h`<span class="small"><strong>On your trip</strong> · ${van?.name}</span>
      <a class="btn btn-sm btn-ghost" href="tel:${App.C.supportPhone}">${App.icon('phone')} Roadside ${App.C.supportPhone}</a>
      <button type="button" class="btn btn-sm sos-btn" id="sos-btn">${App.icon('siren')} SOS</button>`);
    bar.querySelector('#sos-btn').onclick = () => App.openSOS(b);
  };
  App.openSOS = (b) => {
    const me = App.me(), van = App.get.van(b.vanId), contact = b.checkin;
    let loc = null;
    const msg = () => `SOS from ${me.name} (VanYatra trip ${b.id}, ${van.name}). ${loc ? `My location: https://maps.google.com/?q=${loc.lat},${loc.lng} (±${Math.round(loc.acc)} m)` : 'Location not shared yet.'} Please call me.`;
    return App.modal({
      title: 'Emergency help',
      body: h`<div class="sos">
        <a class="btn btn-danger btn-lg btn-block" href="tel:${App.C.emergencyNumber}">${App.icon('phone')} Call ${App.C.emergencyNumber} — police, ambulance, fire</a>
        <a class="btn btn-lg btn-block" href="tel:${App.C.supportPhone}">${App.icon('phone')} VanYatra roadside help 24×7</a>
        <button type="button" class="btn btn-ghost btn-block" id="sos-loc">${App.icon('map-pin')} Share my location</button>
        <div id="sos-out" role="status"></div>
      </div>`,
      actions: [{ label: 'Close', value: null }],
      onMount: (m) => {
        m.querySelector('#sos-loc').onclick = () => {
          const out = m.querySelector('#sos-out');
          if (!navigator.geolocation) { out.innerHTML = String(h`<p class="error">This device can’t share location. Tell the operator your nearest town or landmark.</p>`); return; }
          out.innerHTML = String(h`<p class="small muted">Getting your location…</p>`);
          navigator.geolocation.getCurrentPosition((p) => {
            loc = { lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5), acc: p.coords.accuracy };
            // The owner and VanYatra's team are alerted in the app with the map link
            App.notify(b.ownerId, msg(), '#/owner/bookings');
            App.db.users.filter(u => u.role === 'admin').forEach(a => App.notify(a.id, msg(), '#/admin/bookings', false));
            App.audit('sos', `${b.id} ${loc.lat},${loc.lng}`); App.save();
            out.innerHTML = String(h`<p class="small good">${App.icon('check')} Location sent to VanYatra support and the owner.</p>
              <p><a href="https://maps.google.com/?q=${loc.lat},${loc.lng}" target="_blank" rel="noopener">${loc.lat}, ${loc.lng}</a></p>
              <div class="row gap wrap">
                ${contact?.ecPhone ? h`<a class="btn btn-sm" href="sms:${contact.ecPhone.replace(/\s/g, '')}?body=${encodeURIComponent(msg())}">Text ${contact.ecName}</a>` : ''}
                <a class="btn btn-sm btn-ghost" href="https://wa.me/?text=${encodeURIComponent(msg())}" target="_blank" rel="noopener">${App.icon('share')} Share on WhatsApp</a>
              </div>`);
          }, (err) => {
            out.innerHTML = String(h`<p class="error">${err.code === 1 ? 'Location permission was denied.' : 'Couldn’t get your location.'} Tell the operator your nearest town or landmark.</p>`);
          }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
        };
      }
    });
  };
})();
