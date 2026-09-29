/*
 * Shared core — trip options and the price of a trip. Used by every screen (cards,
 * van page, checkout, receipts) and by the server, so a price is the same wherever
 * it is shown.
 *
 *   App.quote(van, start, end, {
 *     addOns: ['bedding', ...],            // ids (or catalogue objects)
 *     protection: 'basic' | 'standard' | 'premium',
 *     km: 'standard' | 'plus' | 'unlimited',
 *     driver: false | true,                 // "with driver" (chauffeur)
 *     delivery: 'pointId' | null,          // delivered to an airport/station/hotel
 *     oneWay: 'hubId' | null,              // drop off in another city
 *     zeroDeposit: false | true
 *   })
 *
 * Owners switch options on per van and set their prices (van.addOns, van.kmPackages,
 * van.driver, van.delivery). Demo vans without settings get sensible defaults.
 */
(function (root) {
  const App = root.App = root.App || {};
  const DAY = 86400000;
  const parse = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const nightsBetween = (a, b) => Math.round((parse(b) - parse(a)) / DAY);
  const weekday = (s, i) => new Date(parse(s) + i * DAY).getUTCDay();
  const isoAt = (s, i) => new Date(parse(s) + i * DAY).toISOString().slice(0, 10);
  const round500 = (n) => Math.round(n / 500) * 500;

  // Destinations where snow chains and heaters matter
  App.HIMALAYAN = ['ladakh', 'spiti', 'himachal', 'rishikesh'];

  /* Protection plans (like Outdoorsy's tiers). The deposit is a share of the van's deposit. */
  App.PROTECTION = [
    { id: 'basic', label: 'Basic', perNight: 0, liability: 75000, depositShare: 1,
      covers: { roadside: true, towing: false, tyresGlass: false, theft: true }, blurb: 'Included. Third-party and theft insurance with 24×7 roadside help.' },
    { id: 'standard', label: 'Standard', perNight: 499, liability: 25000, depositShare: 0.5, popular: true,
      covers: { roadside: true, towing: true, tyresGlass: false, theft: true }, blurb: 'Lower liability and half the deposit. Towing included.' },
    { id: 'premium', label: 'Premium', perNight: 999, liability: 5000, depositShare: 0.2,
      covers: { roadside: true, towing: true, tyresGlass: true, theft: true }, blurb: 'Near worry-free: tyres and glass covered, smallest deposit.' }
  ];
  App.COVER_LABELS = { roadside: 'Roadside help 24×7', towing: 'Towing', tyresGlass: 'Tyres & glass', theft: 'Theft & third party' };
  // Pay a non-refundable fee instead of a refundable deposit
  App.ZERO_DEPOSIT_RATE = 0.12;

  /* Extras (like Indie Campers). `when` limits where an extra makes sense. */
  App.ADD_ON_CATALOG = [
    { id: 'bedding', label: 'Bedding & towels kit', icon: 'bed-double', price: 800, perNight: false },
    { id: 'gas', label: 'Extra gas cylinder', icon: 'flame', price: 600, perNight: false },
    { id: 'kit', label: 'Camping chairs & table', icon: 'armchair', price: 300, perNight: true },
    { id: 'bikerack', label: 'Bike rack', icon: 'bike', price: 250, perNight: true },
    { id: 'kids', label: 'Child car seat', icon: 'baby', price: 200, perNight: true },
    { id: 'snowchains', label: 'Snow chains', icon: 'snowflake', price: 400, perNight: false, when: (van) => App.HIMALAYAN.includes(van.destinationId), note: 'Himalayan routes only' },
    { id: 'toilet', label: 'Portable toilet', icon: 'toilet', price: 350, perNight: true, when: (van) => !(van.amenities || []).includes('toilet') },
    { id: 'wifi', label: 'Wi-Fi dongle (4G)', icon: 'wifi', price: 250, perNight: true },
    { id: 'extradriver', label: 'Extra driver', icon: 'users', price: 500, perNight: false, note: 'Their licence is checked at pickup' },
    { id: 'pet', label: 'Pet fee', icon: 'paw-print', price: 1000, perNight: false, when: (van) => !!van.petFriendly }
  ];

  // The extras this van offers, at the owner's prices
  App.addOnsFor = (van) => {
    const set = van.addOns || App.ADD_ON_CATALOG.filter(a => ['bedding', 'gas', 'kit', 'kids', 'wifi', 'extradriver', 'snowchains', 'pet', 'toilet'].includes(a.id)).map(a => ({ id: a.id }));
    return set.map(o => { const a = App.ADD_ON_CATALOG.find(x => x.id === o.id); return a && (!a.when || a.when(van)) ? { ...a, price: o.price ?? a.price } : null; }).filter(Boolean);
  };

  /* Distance packages. 'standard' is what the nightly rate includes. */
  App.kmPackagesFor = (van) => {
    const base = van.kmPerDay || 250, p = van.kmPackages || {};
    return [
      { id: 'standard', label: `${base} km a day`, kmPerDay: base, perNight: 0 },
      p.plus !== null && { id: 'plus', label: '400 km a day', kmPerDay: Math.max(400, base + 100), perNight: p.plus ?? 450 },
      p.unlimited !== null && { id: 'unlimited', label: 'Unlimited km', kmPerDay: null, perNight: p.unlimited ?? 900 }
    ].filter(Boolean);
  };

  // With-driver option (many families won't self-drive in the mountains)
  // Offered only once the driver's licence is verified (SARATHI check run by the owner)
  App.driverFor = (van) => (van.driver && van.driver.available && (van.driver.verified || van.driver.check?.status === 'verified') ? { feePerDay: 1800, bataPerDay: 400, stayPerNight: 600, ...van.driver } : null);

  /* How a trip is paid (like Roadsurfer's split payment, adapted for India):
   *   plan 'full'  — everything now
   *   plan 'part'  — 25% now, the rest charged automatically 7 days before pickup
   *                  (only when pickup is more than 10 days away)
   *   deposit 'hold' — card pre-authorisation at pickup
   *   deposit 'upi'  — refundable deposit paid now by UPI, refunded automatically
   *   (zero-deposit is a trip option in App.quote)
   */
  App.PART_PAY = { share: 0.25, balanceDaysBefore: 7, minDaysAhead: 11 };
  App.EMI_MIN = 10000;
  App.paymentPlan = (q, start, { plan = 'full', deposit = 'hold' } = {}, today = new Date().toISOString().slice(0, 10)) => {
    const daysAhead = nightsBetween(today, start);
    const partAllowed = daysAhead >= App.PART_PAY.minDaysAhead;
    const type = plan === 'part' && partAllowed ? 'part' : 'full';
    const dueNow = type === 'part' ? Math.round(q.total * App.PART_PAY.share) : q.total;
    const balanceDueOn = type === 'part' ? new Date(parse(start) - App.PART_PAY.balanceDaysBefore * DAY).toISOString().slice(0, 10) : null;
    const depositMethod = q.depositWaived || !q.deposit ? 'none' : deposit === 'upi' ? 'upi' : 'hold';
    const depositNow = depositMethod === 'upi' ? q.deposit : 0;
    return { type, partAllowed, dueNow, balance: q.total - dueNow, balanceDueOn, depositMethod, depositNow, chargeNow: dueNow + depositNow, emiAllowed: dueNow + depositNow >= App.EMI_MIN };
  };

  /* The price of a trip */
  App.quote = (van, start, end, extras = {}) => {
    const C = App.C;
    const nights = nightsBetween(start, end);
    // Friday and Saturday nights use the weekend rate
    const weekdayRate = van.pricePerNight, weekendRate = van.weekendPrice || van.pricePerNight;
    let weekendNights = 0;
    for (let i = 0; i < nights; i++) { const d = weekday(start, i); if (d === 5 || d === 6) weekendNights++; }
    const weekdayNights = nights - weekendNights;
    const base = weekdayNights * weekdayRate + weekendNights * weekendRate;
    // Seasons set by the owner, by calendar date (e.g. Christmas week +25%, monsoon −15%)
    const inSeason = (md, x) => (x.from <= x.to ? md >= x.from && md <= x.to : md >= x.from || md <= x.to);
    let seasonAdj = 0; const seasonNames = new Set();
    for (let i = 0; i < nights; i++) {
      const md = isoAt(start, i).slice(5), d = weekday(start, i);
      const sn = (van.seasons || []).find(x => inSeason(md, x));
      if (sn) { seasonAdj += Math.round(((d === 5 || d === 6) ? weekendRate : weekdayRate) * sn.pct / 100); seasonNames.add(sn.name); }
    }
    const season = seasonAdj ? { amount: seasonAdj, label: [...seasonNames].join(', ') } : null;
    const gross = base + seasonAdj;
    // Discounts don't stack: the best of long-stay, early-bird and last-minute applies
    const today = extras.today || (App.today ? App.today() : new Date().toISOString().slice(0, 10));
    const ahead = nightsBetween(today, start);
    const offers = [
      nights >= 28 && ['monthly', van.discounts?.monthly, 'monthly discount'],
      nights >= 7 && nights < 28 && ['weekly', van.discounts?.weekly, 'weekly discount'],
      van.earlyBird?.pct && ahead >= van.earlyBird.days && ['earlyBird', van.earlyBird.pct, `early-bird discount (booked ${van.earlyBird.days}+ days ahead)`],
      van.lastMinute?.pct && ahead >= 0 && ahead <= van.lastMinute.days && ['lastMinute', van.lastMinute.pct, 'last-minute deal']
    ].filter(o => o && o[1] > 0).sort((a, b) => b[1] - a[1]);
    const [discountKind = null, discountPct = 0, discountLabel = ''] = offers[0] || [];
    const discount = Math.round(gross * discountPct / 100);
    const rental = gross - discount;

    // Extras: ids use the van's prices; objects (older callers) are taken as given
    const offered = App.addOnsFor(van);
    const addOnLines = (extras.addOns || []).map(x => (typeof x === 'string' ? offered.find(a => a.id === x) : x)).filter(Boolean)
      .map(a => ({ id: a.id, label: a.label, amount: a.price * (a.perNight ? nights : 1), detail: a.perNight ? `${App.fmt.money(a.price)} × ${App.fmt.nights(nights)}` : 'per trip' }));
    const addOns = addOnLines.reduce((s, a) => s + a.amount, 0);

    const plan = App.PROTECTION.find(p => p.id === extras.protection) || App.PROTECTION[0];
    const protection = { id: plan.id, label: plan.label, amount: plan.perNight * nights, liability: plan.liability };

    const pkgs = App.kmPackagesFor(van);
    const pkg = pkgs.find(p => p.id === extras.km) || pkgs[0];
    const km = { id: pkg.id, label: pkg.label, amount: pkg.perNight * nights, kmIncluded: pkg.kmPerDay ? pkg.kmPerDay * nights : null };

    const drv = extras.driver && App.driverFor(van);
    const days = nights + 1;
    const driver = drv ? { days, fee: drv.feePerDay * days, bata: drv.bataPerDay * days, stay: drv.stayPerNight * nights, amount: (drv.feePerDay + drv.bataPerDay) * days + drv.stayPerNight * nights } : null;

    const point = extras.delivery && (van.delivery?.points || []).find(p => p.id === extras.delivery);
    // Delivered to the point and collected from it again: both ways
    const delivery = point ? { id: point.id, label: point.name, km: point.km, amount: Math.round(point.km * (van.delivery.perKm || 20) * 2) } : null;
    const hub = extras.oneWay && (van.delivery?.oneWay || []).find(h => h.id === extras.oneWay);
    const oneWay = hub ? { id: hub.id, label: hub.name, amount: hub.fee } : null;

    const cleaning = van.cleaningFee || 0;
    const extrasTotal = addOns + protection.amount + km.amount + (driver?.amount || 0) + (delivery?.amount || 0) + (oneWay?.amount || 0);
    const baseDeposit = van.deposit || 0;
    const tierDeposit = round500(baseDeposit * plan.depositShare);
    const zeroDepositFee = extras.zeroDeposit && tierDeposit ? Math.max(500, round500(tierDeposit * App.ZERO_DEPOSIT_RATE)) : 0;
    const service = Math.round((rental + extrasTotal) * C.serviceFeeRate);
    const tax = Math.round((rental + extrasTotal + cleaning + service + zeroDepositFee) * C.taxRate);
    const total = rental + extrasTotal + cleaning + service + zeroDepositFee + tax;
    // The owner is paid for the van, its extras, distance, driver and delivery; protection and the zero-deposit fee aren't theirs
    const ownerGross = rental + addOns + km.amount + (driver?.amount || 0) + (delivery?.amount || 0) + (oneWay?.amount || 0);
    const commission = Math.round(ownerGross * C.ownerCommissionRate);
    return {
      nights, base, season, discountPct, discountKind, discountLabel, discount, rental, addOns, addOnLines, cleaning, service, tax, total,
      weekdayNights, weekendNights, weekdayRate, weekendRate,
      protection, km, driver, delivery, oneWay, zeroDepositFee,
      kmIncluded: km.kmIncluded, kmPerDay: pkg.kmPerDay, extraKmFee: van.extraKmFee || 0,
      deposit: extras.zeroDeposit ? 0 : tierDeposit, depositWaived: extras.zeroDeposit ? tierDeposit : 0,
      commission, ownerPayout: ownerGross + cleaning - commission,
      avgNight: nights ? Math.round(base / nights) : van.pricePerNight,
      options: { addOns: addOnLines.map(a => a.id), protection: plan.id, km: pkg.id, driver: !!driver, delivery: delivery?.id || null, oneWay: oneWay?.id || null, zeroDeposit: !!zeroDepositFee }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
