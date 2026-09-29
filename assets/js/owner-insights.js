/*
 * Owner insights: a listing health score with fixes, pricing tips from
 * VanYatra's own bookings, and calendar sync (.ics export and import).
 */
window.App = window.App || {};
(() => {
  const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const peers = (van) => App.db.vans.filter(v => v.id !== van.id && v.status === 'published' && v.type === van.type && v.destinationId === van.destinationId);

  /* Listing health (0–100): what makes travellers pick and trust a van */
  App.listingHealth = (van) => {
    const r = App.get.rating(van.id), resp = App.get.ownerResponse(van.ownerId);
    const docs = App.db.documents.filter(d => d.vanId === van.id);
    const expiring = docs.filter(d => { const e = App.docExpiryState(d); return e && e.tone !== 'muted'; });
    const market = median(peers(van).map(v => v.pricePerNight));
    const off = market ? Math.abs(van.pricePerNight - market) / market : 0;
    const items = [
      [15, (van.photos || []).length >= App.C.minPhotos && (van.photoLabels || []).includes('exterior'), 'Photos', `Add at least ${App.C.minPhotos} photos, including the outside of the van.`],
      [10, !!van.photosVerifiedAt, 'Real photos verified', 'Upload your own photos (not sample or brochure images); they’re checked when the listing is approved.'],
      [10, (van.description || '').length >= 150, 'Description', 'Write at least a few lines about the van, who it suits and your favourite routes.'],
      [10, !!van.instantBook, 'Instant book', 'Turn on instant book — travellers prefer vans they can confirm straight away.'],
      [10, !!resp && resp.minutes != null && resp.minutes <= 180, 'Quick replies', resp ? 'Reply to messages within a few hours.' : 'Reply to your first messages quickly to build a response record.'],
      [15, r.count >= App.C.minReviewsForRating && r.avg >= 4.5, 'Reviews', r.count < App.C.minReviewsForRating ? 'Ask your first travellers for a review after their trip.' : 'Look at recent reviews for what to improve.'],
      [15, !expiring.length && ['ownership', 'registration', 'insurance', 'inspection'].every(k => van.verification?.[k] === 'verified'), 'Documents valid', expiring.length ? `Renew: ${expiring.map(d => d.label).join(', ')}.` : 'Finish verifying the van’s documents.'],
      [5, !!(van.addOns?.length || van.delivery || App.driverFor(van) || van.seasons?.length), 'Trip options', 'Offer extras, delivery or a driver — they help you stand out and earn more per trip.'],
      [10, !market || off <= 0.25, 'Price in range', market ? `Similar vans nearby charge about ${App.fmt.money(market)}/night; you’re ${van.pricePerNight > market ? 'well above' : 'well below'} that.` : '']
    ].map(([points, ok, label, tip]) => ({ points, ok, label, tip }));
    const score = items.reduce((s, i) => s + (i.ok ? i.points : 0), 0);
    return { score, items, tone: score >= 80 ? 'good' : score >= 60 ? 'warn' : 'bad' };
  };

  /* Pricing tips from VanYatra's bookings and listings */
  App.pricingTips = (van) => {
    const dest = App.get.dest(van.destinationId), tips = [];
    const same = peers(van);
    const market = median(same.map(v => v.pricePerNight));
    if (market) {
      const diff = Math.round((van.pricePerNight - market) / market * 100);
      tips.push(`Similar ${van.type.toLowerCase()}s in ${dest.name} list at about ${App.fmt.money(market)}/night; yours is ${App.fmt.money(van.pricePerNight)} (${diff === 0 ? 'right on it' : Math.abs(diff) + '% ' + (diff > 0 ? 'above' : 'below')}).`);
    }
    // What vans in this region actually earned per night in their busiest month
    const regionIds = new Set(App.db.vans.filter(v => v.destinationId === van.destinationId).map(v => v.id));
    const byMonth = {};
    for (const b of App.db.bookings.filter(b => regionIds.has(b.vanId) && ['confirmed', 'completed'].includes(b.status))) {
      const m = +b.start.slice(5, 7);
      (byMonth[m] = byMonth[m] || []).push(b.pricing.rental / b.nights);
    }
    const peak = Object.entries(byMonth).sort((a, b) => b[1].length - a[1].length)[0];
    if (peak && peak[1].length >= 2) tips.push(`Vans in ${dest.name} earned about ${App.fmt.money(median(peak[1]))}/night in ${App.fmt.MONTHS_LONG[peak[0] - 1]}, the busiest month in our bookings.`);
    if (!van.seasons?.length && dest.bestMonths?.length) tips.push(`${dest.name}’s high season is ${dest.bestTime}. A seasonal rate (for example +15–20%) in those months is common.`);
    // How far ahead people book here
    const leads = App.db.bookings.filter(b => regionIds.has(b.vanId)).map(b => App.nightsBetween(b.createdAt.slice(0, 10), b.start)).filter(n => n >= 0);
    const early = leads.filter(n => n >= 45).length;
    if (leads.length >= 4 && !van.earlyBird && early / leads.length >= 0.3) tips.push(`${Math.round(early / leads.length * 100)}% of trips here are booked 45+ days ahead — an early-bird discount can fill your calendar sooner.`);
    if (!van.lastMinute) tips.push('Gaps of a few free nights next week? A last-minute deal (10–15%) helps fill them.');
    return tips;
  };

  /* Calendar sync: iCalendar (.ics) export and import */
  const icsDate = (iso) => iso.replace(/-/g, '');
  App.icsFor = (van) => {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VanYatra//Owner calendar//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${van.name} (VanYatra)`];
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    for (const b of App.db.bookings.filter(b => b.vanId === van.id && ['confirmed', 'requested'].includes(b.status))) {
      lines.push('BEGIN:VEVENT', `UID:${b.id}@vanyatra.in`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${icsDate(b.start)}`, `DTEND;VALUE=DATE:${icsDate(b.end)}`, `SUMMARY:${b.status === 'confirmed' ? 'Booked' : 'Request'} · ${b.id}`, 'END:VEVENT');
    }
    for (const [i, r] of (van.blocked || []).entries()) {
      lines.push('BEGIN:VEVENT', `UID:block-${van.id}-${i}-${r.start}@vanyatra.in`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${icsDate(r.start)}`, `DTEND;VALUE=DATE:${icsDate(App.addDays(r.end, 1))}`, `SUMMARY:Blocked · ${(r.note || '').replace(/[,;\\]/g, ' ')}`, 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  };
  // Busy periods from another calendar (Airbnb, Google…): all-day or timed events → blocked night ranges
  App.parseIcs = (text) => {
    const unfolded = String(text).replace(/\r?\n[ \t]/g, '');
    const out = [];
    for (const ev of unfolded.split('BEGIN:VEVENT').slice(1)) {
      const get = (k) => (ev.match(new RegExp('^' + k + '(?:;[^:\\r\\n]*)?:([^\\r\\n]+)', 'm')) || [])[1];
      const d = (v) => v && /^\d{8}/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null;
      const start = d(get('DTSTART')), endEx = d(get('DTEND'));
      if (!start) continue;
      // DTEND is exclusive for all-day events: the last blocked night is the day before
      const end = endEx && endEx > start ? App.addDays(endEx, -1) : start;
      out.push({ start, end, note: (get('SUMMARY') || 'Imported').slice(0, 40) });
    }
    return out;
  };
})();
