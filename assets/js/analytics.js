/*
 * Analytics: a small first-party event log, only after the visitor agrees.
 *
 *   App.track('van_view', { van: 'v1' })
 *
 * Events: page_view, search, filter_use, van_view, date_select, begin_checkout,
 * checkout_step, payment_attempt, payment_result, booking. They're kept in this
 * browser's demo data (App.db.events) and summarised as a funnel in Admin →
 * Analytics. There are no third-party trackers; to add one later, send events from
 * App.analytics.send (and keep the consent check).
 */
window.App = window.App || {};
(() => {
  const KEY = 'vanyatra.consent.v1';
  const read = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const sid = (() => { try { let s = sessionStorage.getItem('vanyatra.sid'); if (!s) { s = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('vanyatra.sid', s); } return s; } catch (e) { return 'nosession'; } })();
  let saveTimer = null;

  App.analytics = {
    consent: () => read(),                         // 'granted' | 'denied' | null (not asked yet)
    setConsent(v) {
      try { localStorage.setItem(KEY, v); } catch (e) { /* storage blocked */ }
      if (v === 'denied' && App.db) { App.db.events = []; App.save(); } // forget what was collected
      App.renderConsent();
    },
    send: null // (event) => void — a real endpoint later
  };

  App.track = (name, props = {}) => {
    if (read() !== 'granted' || !App.db) return;
    const me = App.me && App.me();
    const e = { name, props, at: new Date().toISOString(), sid, role: me ? me.role : 'guest' };
    App.db.events = App.db.events || [];
    App.db.events.push(e);
    if (App.db.events.length > 3000) App.db.events.splice(0, App.db.events.length - 3000);
    if (App.analytics.send) App.analytics.send(e);
    clearTimeout(saveTimer); saveTimer = setTimeout(() => App.save(), 400);
  };

  // Funnel by session: how many reached each step
  App.analytics.funnel = (events = App.db.events || []) => {
    const stages = [
      ['search', 'Searched', (e) => e.name === 'search'],
      ['van_view', 'Viewed a van', (e) => e.name === 'van_view'],
      ['date_select', 'Chose dates', (e) => e.name === 'date_select'],
      ['begin_checkout', 'Started checkout', (e) => e.name === 'begin_checkout'],
      ['pay_step', 'Reached payment', (e) => e.name === 'checkout_step' && e.props.step === 4],
      ['booking', 'Booked', (e) => e.name === 'booking']
    ];
    return stages.map(([id, label, test]) => ({ id, label, sessions: new Set(events.filter(test).map(e => e.sid)).size }));
  };

  // A short, dismissable notice; nothing is recorded until the visitor allows it
  App.renderConsent = () => {
    let bar = document.getElementById('consent-bar');
    if (read()) { if (bar) bar.remove(); return; }
    if (bar) return;
    bar = document.createElement('div');
    bar.id = 'consent-bar'; bar.className = 'consent-bar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Analytics choice');
    bar.innerHTML = String(App.h`<p class="small">May we count anonymous page visits and booking steps to improve VanYatra? No ads, no third-party trackers. <a href="#/help/privacy">Privacy</a></p>
      <div class="row gap"><button type="button" class="btn btn-sm btn-ghost" data-consent="denied">No thanks</button><button type="button" class="btn btn-sm btn-primary" data-consent="granted">Allow</button></div>`);
    bar.querySelectorAll('[data-consent]').forEach(b => b.onclick = () => App.analytics.setConsent(b.dataset.consent));
    document.body.append(bar);
  };
})();
