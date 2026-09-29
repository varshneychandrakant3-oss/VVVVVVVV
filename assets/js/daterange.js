/*
 * Date-range picker (pickup → return), shown as DD MMM YYYY.
 *
 *   const field = App.dateRangeField(host, { start, end, vanId, minNights, onChange })
 *
 * Renders a button showing both dates and the number of nights, plus hidden
 * <input name="start"> and <input name="end"> so surrounding forms keep working.
 * The calendar opens as a popover (or a bottom sheet on phones):
 *  - past dates can't be picked, nor dates more than 18 months ahead
 *  - with a van, booked and blocked nights are greyed out, and a return date
 *    can't jump over them
 *  - return dates shorter than the minimum stay are disabled, with the rule shown
 *  - keyboard: arrows move by day or week, PageUp/PageDown by month, Home/End to
 *    the week's start/end, Enter or Space picks, Esc closes
 * opts: start, end, vanId, minNights (number or function), labels, names, clearable, onChange.
 * Changes fire 'input' and 'change' events on the hidden inputs, then onChange(start, end).
 */
(() => {
const { fmt } = App;
const MAX_MONTHS_AHEAD = 18;
const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const isPhone = () => window.matchMedia('(max-width: 639px)').matches;
let openPicker = null;

const monthKey = (iso) => iso.slice(0, 7);
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const longLabel = (iso) => { const p = App.parseDate(iso); return `${DAY_NAMES[p.getDay()]}, ${p.getDate()} ${fmt.MONTHS_LONG[p.getMonth()]} ${p.getFullYear()}`; };

App.dateRangeField = (host, opts = {}) => {
  const o = { names: ['start', 'end'], labels: ['Pickup', 'Return'], minNights: 1, placeholder: 'Add date', clearable: true, ...opts };
  const state = { start: o.start || '', end: o.end && o.start && o.end > o.start ? o.end : '' };
  const uid = 'drf' + Math.random().toString(36).slice(2, 8);

  host.classList.add('drf');
  host.innerHTML = String(App.h`
    <input type="hidden" name="${o.names[0]}" value="${state.start}">
    <input type="hidden" name="${o.names[1]}" value="${state.end}">
    <button type="button" class="drf-btn" aria-haspopup="dialog" aria-expanded="false" aria-controls="${uid}"></button>`);
  const [inStart, inEnd] = host.querySelectorAll('input');
  const btn = host.querySelector('.drf-btn');

  const nights = () => (state.start && state.end ? App.nightsBetween(state.start, state.end) : 0);
  const drawButton = () => {
    btn.innerHTML = String(App.h`
      <span class="drf-part"><span class="drf-label">${o.labels[0]}</span><span class="drf-val ${state.start ? '' : 'is-empty'}">${state.start ? fmt.date(state.start) : o.placeholder}</span></span>
      <span class="drf-arrow" aria-hidden="true">→</span>
      <span class="drf-part"><span class="drf-label">${o.labels[1]}</span><span class="drf-val ${state.end ? '' : 'is-empty'}">${state.end ? fmt.date(state.end) : o.placeholder}</span></span>
      ${nights() ? App.h`<span class="drf-nights">${fmt.nights(nights())}</span>` : ''}`);
    btn.setAttribute('aria-label', state.start && state.end ? `${o.labels[0]} ${longLabel(state.start)}, ${o.labels[1].toLowerCase()} ${longLabel(state.end)}, ${fmt.nights(nights())}. Change dates` : `Choose ${o.labels[0].toLowerCase()} and ${o.labels[1].toLowerCase()} dates`);
  };
  const commit = () => {
    inStart.value = state.start; inEnd.value = state.end;
    drawButton();
    for (const input of [inStart, inEnd]) { input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }
    o.onChange && o.onChange(state.start, state.end);
    if (state.start && state.end) App.track('date_select', { nights: App.nightsBetween(state.start, state.end), lead: App.nightsBetween(App.today(), state.start), van: o.vanId || null });
  };

  /* ---------- Popover ---------- */
  let pop = null, scrim = null, view = monthKey(state.start || App.today()), focusDay = null, draft = null;

  const unavailable = () => (o.vanId ? App.unavailableDates(o.vanId) : new Set());
  const minNights = () => Math.max(1, (typeof o.minNights === 'function' ? o.minNights() : o.minNights) || 1);

  // Can `d` be picked, given the draft selection?
  const dayInfo = (d, un, today, maxDay) => {
    const info = { disabled: false, cls: [], note: '' };
    if (d < today || d > maxDay) { info.disabled = true; info.cls.push('past'); return info; }
    const booked = un.has(d);
    if (booked) info.cls.push('unavail');
    if (draft.start && !draft.end && d > draft.start) {
      // Choosing a return date: can't cross a booked night, must meet the minimum stay
      let firstBooked = null;
      for (let x = draft.start; x < d; x = App.addDays(x, 1)) if (un.has(x)) { firstBooked = x; break; }
      if (firstBooked) { info.disabled = true; info.note = 'includes booked nights'; }
      else if (App.nightsBetween(draft.start, d) < minNights()) { info.disabled = true; info.cls.push('too-short'); info.note = `minimum ${fmt.nights(minNights())}`; }
    } else if (booked) { info.disabled = true; info.note = 'booked'; }
    return info;
  };

  const drawPop = () => {
    const un = unavailable(), today = App.today(), maxDay = App.addDays(today, MAX_MONTHS_AHEAD * 30);
    const months = 2;
    const pickingEnd = draft.start && !draft.end;
    let html = '';
    for (let i = 0; i < months; i++) {
      const ym = addMonths(view, i), [y, m] = ym.split('-').map(Number);
      const first = new Date(y, m - 1, 1), pad = (first.getDay() + 6) % 7, days = new Date(y, m, 0).getDate();
      let cells = '<span class="drp-pad"></span>'.repeat(pad);
      for (let day = 1; day <= days; day++) {
        const d = `${ym}-${String(day).padStart(2, '0')}`;
        const info = dayInfo(d, un, today, maxDay);
        const sel = d === draft.start || d === draft.end;
        const cls = ['drp-day', ...info.cls, d === today && 'today', d === draft.start && 'sel-start', d === draft.end && 'sel-end',
          draft.start && draft.end && d > draft.start && d < draft.end && 'in-range'].filter(Boolean).join(' ');
        const label = `${longLabel(d)}${info.note ? ', ' + info.note : ''}${d === draft.start ? `, ${o.labels[0].toLowerCase()}` : d === draft.end ? `, ${o.labels[1].toLowerCase()}` : ''}`;
        cells += `<button type="button" class="${cls}" data-d="${d}" tabindex="-1" ${info.disabled ? 'aria-disabled="true"' : ''} aria-pressed="${sel}" aria-label="${App.esc(label)}">${day}</button>`;
      }
      html += `<div class="drp-month"><div class="drp-title" id="${uid}-m${i}">${fmt.monthYear(y, m)}</div><div class="drp-grid" role="group" aria-labelledby="${uid}-m${i}">${DOW.map(x => `<span class="drp-dow" aria-hidden="true">${x}</span>`).join('')}${cells}</div></div>`;
    }
    const n = draft.start && draft.end ? App.nightsBetween(draft.start, draft.end) : 0;
    const canPrev = view > monthKey(today);
    const canNext = addMonths(view, months - 1) < monthKey(maxDay);
    pop.innerHTML = `
      <div class="drp-head">
        <div><strong>${pickingEnd ? `Choose your ${App.esc(o.labels[1].toLowerCase())} date` : `Choose your ${App.esc(o.labels[0].toLowerCase())} date`}</strong>
          <div class="small muted">${minNights() > 1 ? `Minimum stay: ${fmt.nights(minNights())}` : 'Pick a start and end date'}${o.vanId ? ' · Greyed dates are booked' : ''}</div></div>
        <button type="button" class="icon-btn drp-close" aria-label="Close">✕</button>
      </div>
      <div class="drp-nav"><button type="button" class="icon-btn" data-nav="-1" aria-label="Previous month" ${canPrev ? '' : 'disabled'}>‹</button><button type="button" class="icon-btn" data-nav="1" aria-label="Next month" ${canNext ? '' : 'disabled'}>›</button></div>
      <div class="drp-months">${html}</div>
      <div class="drp-foot">
        <div class="drp-sum" aria-live="polite">${draft.start ? `${App.esc(fmt.date(draft.start))} → ${draft.end ? App.esc(fmt.date(draft.end)) : '…'}${n ? ` · <strong>${fmt.nights(n)}</strong>` : ''}` : 'No dates selected'}</div>
        <div class="row gap">${o.clearable ? '<button type="button" class="btn btn-ghost btn-sm" data-act="clear">Clear</button>' : ''}<button type="button" class="btn btn-primary btn-sm" data-act="done">${draft.start && draft.end ? 'Done' : 'Close'}</button></div>
      </div>`;
    // One day is tabbable (roving focus); keep it on the focused, selected or first pickable day
    const days = [...pop.querySelectorAll('.drp-day')];
    const target = days.find(b => b.dataset.d === focusDay) || days.find(b => b.dataset.d === (pickingEnd ? null : draft.start)) || days.find(b => !b.hasAttribute('aria-disabled')) || days[0];
    if (target) { target.tabIndex = 0; focusDay = target.dataset.d; }
    position();
  };

  const position = () => {
    if (!pop) return;
    if (isPhone()) { pop.classList.add('sheet'); pop.style.cssText = ''; return; }
    pop.classList.remove('sheet');
    const vw = document.documentElement.clientWidth, r = btn.getBoundingClientRect(), w = Math.min(640, vw - 32);
    const left = Math.max(16, Math.min(r.left, vw - w - 16));
    const below = window.innerHeight - r.bottom, h = pop.offsetHeight || 420;
    const top = below > h + 12 || r.top < h ? r.bottom + 8 : r.top - h - 8;
    pop.style.cssText = `left:${left}px;top:${Math.max(8, top)}px;width:${w}px`;
  };

  const focusOn = (d) => {
    const today = App.today(), maxDay = App.addDays(today, MAX_MONTHS_AHEAD * 30);
    if (d < today) d = today;
    if (d > maxDay) d = maxDay;
    focusDay = d;
    const months = 2;
    if (monthKey(d) < view) view = monthKey(d);
    else if (monthKey(d) > addMonths(view, months - 1)) view = addMonths(monthKey(d), -(months - 1));
    drawPop();
    pop.querySelector(`[data-d="${d}"]`)?.focus();
  };

  const pick = (d) => {
    if (!draft.start || draft.end || d <= draft.start) { draft = { start: d, end: '' }; focusDay = d; drawPop(); pop.querySelector(`[data-d="${d}"]`)?.focus(); return; }
    draft.end = d;
    state.start = draft.start; state.end = draft.end;
    commit();
    close();
  };

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') {
      // Keep focus inside the dialog
      const f = [...pop.querySelectorAll('button:not([disabled]):not([tabindex="-1"])')];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
      return;
    }
    const day = e.target.closest?.('.drp-day');
    if (!day) return;
    const d = day.dataset.d, p = App.parseDate(d), dow = (p.getDay() + 6) % 7;
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -dow, End: 6 - dow };
    if (e.key in moves) { e.preventDefault(); focusOn(App.addDays(d, moves[e.key])); }
    else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const t = new Date(p.getFullYear(), p.getMonth() + (e.key === 'PageUp' ? -1 : 1), Math.min(p.getDate(), 28));
      focusOn(App.iso(t));
    }
  };

  const onClick = (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { view = addMonths(view, +nav.dataset.nav); focusDay = null; drawPop(); return; }
    if (e.target.closest('.drp-close')) return close();
    const act = e.target.closest('[data-act]');
    if (act?.dataset.act === 'clear') { draft = { start: '', end: '' }; state.start = state.end = ''; commit(); drawPop(); return; }
    if (act?.dataset.act === 'done') return close();
    const day = e.target.closest('.drp-day');
    if (!day) return;
    if (day.hasAttribute('aria-disabled')) {
      const note = day.getAttribute('aria-label').split(', ').slice(2).join(', ');
      if (note && !/^(pickup|return)/i.test(note)) App.toast(note[0].toUpperCase() + note.slice(1), 'bad');
      return;
    }
    pick(day.dataset.d);
  };
  const onOutside = (e) => { if (pop && !pop.contains(e.target) && !btn.contains(e.target)) close(); };

  const open = () => {
    if (openPicker) openPicker.close();
    draft = { start: state.start, end: state.end };
    view = monthKey(state.start || App.today());
    focusDay = null;
    pop = document.createElement('div');
    pop.className = 'drp';
    pop.id = uid;
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-modal', isPhone() ? 'true' : 'false');
    pop.setAttribute('aria-label', `Choose ${o.labels[0].toLowerCase()} and ${o.labels[1].toLowerCase()} dates`);
    if (isPhone()) { scrim = document.createElement('div'); scrim.className = 'drp-scrim'; scrim.onclick = close; document.body.append(scrim); document.body.classList.add('no-scroll'); }
    document.body.append(pop);
    pop.addEventListener('keydown', onKey);
    pop.addEventListener('click', onClick);
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    btn.setAttribute('aria-expanded', 'true');
    drawPop();
    (pop.querySelector('.drp-day[tabindex="0"]') || pop.querySelector('.drp-close')).focus();
    openPicker = api;
  };
  const close = () => {
    if (!pop) return;
    // Return focus to the field only when it was in the picker (keyboard use or a pick)
    const hadFocus = pop.contains(document.activeElement);
    // A start date on its own isn't a range: what was committed before is kept
    pop.remove(); pop = null;
    if (scrim) { scrim.remove(); scrim = null; document.body.classList.remove('no-scroll'); }
    document.removeEventListener('pointerdown', onOutside, true);
    window.removeEventListener('resize', position);
    window.removeEventListener('scroll', position, true);
    btn.setAttribute('aria-expanded', 'false');
    if (openPicker === api) openPicker = null;
    if (hadFocus || document.activeElement === document.body) btn.focus();
  };

  btn.addEventListener('click', () => (pop ? close() : open()));
  // Close when the page changes underneath
  window.addEventListener('hashchange', close, { once: true });

  const api = {
    open, close,
    get: () => ({ start: state.start, end: state.end }),
    set: (s, e, { silent = false } = {}) => { state.start = s || ''; state.end = s && e && e > s ? e : ''; if (silent) { inStart.value = state.start; inEnd.value = state.end; drawButton(); } else commit(); if (pop) { draft = { ...state }; drawPop(); } }
  };
  drawButton();
  return api;
};
})();
