// Trip prices and payment plans (shared core: assets/js/core/pricing.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../core.js';

const van = {
  id: 'vt', destinationId: 'himachal', pricePerNight: 6000, weekendPrice: 7000, cleaningFee: 1200, deposit: 15000,
  discounts: { weekly: 10, monthly: 20 }, kmPerDay: 250, extraKmFee: 12, amenities: [], petFriendly: false,
  kmPackages: { plus: 450, unlimited: 900 },
  driver: { available: true, feePerDay: 1800, bataPerDay: 400, stayPerNight: 600, check: { status: 'verified' } },
  delivery: { perKm: 20, points: [{ id: 'kuu', name: 'Bhuntar airport', type: 'airport', km: 50 }], oneWay: [{ id: 'delhi', name: 'Delhi', fee: 12000 }] }
};
// Thu 12 Nov 2026 → Mon 16 Nov 2026: Thu, Fri, Sat, Sun nights (2 at the weekend rate)
const S = '2026-11-12', E = '2026-11-16';

test('base price: weekday and Friday/Saturday rates, fees and GST', () => {
  const q = App.quote(van, S, E);
  assert.equal(q.nights, 4);
  assert.equal(q.weekdayNights, 2); assert.equal(q.weekendNights, 2);
  assert.equal(q.base, 2 * 6000 + 2 * 7000);
  assert.equal(q.service, Math.round(q.rental * 0.08));
  assert.equal(q.tax, Math.round((q.rental + q.cleaning + q.service) * 0.18));
  assert.equal(q.total, q.rental + q.cleaning + q.service + q.tax);
  assert.equal(q.deposit, 15000);
  assert.equal(q.kmIncluded, 1000);
});

test('trip options add up, and each is charged as described', () => {
  const q = App.quote(van, S, E, { addOns: ['bedding', 'kids', 'snowchains', 'pet'], protection: 'premium', km: 'unlimited', driver: true, delivery: 'kuu', oneWay: 'delhi' });
  // Pet fee isn't offered (van isn't pet friendly); snow chains are (Himalayan route)
  assert.deepEqual(q.addOnLines.map(a => a.id), ['bedding', 'kids', 'snowchains']);
  assert.equal(q.addOns, 800 + 200 * 4 + 400);
  assert.equal(q.protection.amount, 999 * 4);
  assert.equal(q.km.amount, 900 * 4); assert.equal(q.kmIncluded, null);
  assert.equal(q.driver.days, 5);
  assert.equal(q.driver.amount, (1800 + 400) * 5 + 600 * 4);
  assert.equal(q.delivery.amount, 50 * 20 * 2);
  assert.equal(q.oneWay.amount, 12000);
  assert.equal(q.deposit, 3000); // premium: 20% of the deposit
  const extras = q.addOns + q.protection.amount + q.km.amount + q.driver.amount + q.delivery.amount + q.oneWay.amount;
  assert.equal(q.total, q.rental + extras + q.cleaning + q.service + q.tax);
  // Protection isn't the owner's income
  assert.equal(q.ownerPayout, q.rental + extras - q.protection.amount + q.cleaning - q.commission);
});

test('zero-deposit replaces the deposit with a smaller non-refundable fee', () => {
  const q = App.quote(van, S, E, { zeroDeposit: true });
  assert.equal(q.deposit, 0);
  assert.equal(q.depositWaived, 15000);
  assert.equal(q.zeroDepositFee, 2000); // 12%, rounded to ₹500
  assert.ok(q.total > App.quote(van, S, E).total);
});

test('payment plans: 25% now only when pickup is 11+ days away; UPI deposit paid now', () => {
  const q = App.quote(van, S, E);
  const part = App.paymentPlan(q, S, { plan: 'part', deposit: 'upi' }, '2026-10-01');
  assert.equal(part.type, 'part');
  assert.equal(part.dueNow, Math.round(q.total * 0.25));
  assert.equal(part.balance, q.total - part.dueNow);
  assert.equal(part.balanceDueOn, '2026-11-05');
  assert.equal(part.depositNow, 15000);
  assert.equal(part.chargeNow, part.dueNow + 15000);
  const late = App.paymentPlan(q, S, { plan: 'part' }, '2026-11-05');
  assert.equal(late.type, 'full');
  assert.equal(late.partAllowed, false);
  assert.equal(late.depositNow, 0); // card hold at pickup by default
});

test('a driver is only offered once their licence is verified', () => {
  const unchecked = { ...van, driver: { available: true, feePerDay: 1800 } };
  assert.equal(App.driverFor(unchecked), null);
  assert.equal(App.quote(unchecked, S, E, { driver: true }).driver, null);
});

test('seasons, early-bird and last-minute pricing (best discount wins, no stacking)', () => {
  const peak = { ...van, seasons: [{ name: 'Diwali week', from: '11-10', to: '11-14', pct: 20 }] };
  const q = App.quote(peak, S, E, { today: '2026-10-01' });
  // 12, 13 (Fri, weekend rate) and 14 Nov (Sat, weekend rate) are in season; 15 Nov isn't
  assert.equal(q.season.amount, Math.round(6000 * 0.2) + Math.round(7000 * 0.2) * 2);
  assert.equal(q.rental, q.base + q.season.amount);
  const deals = { ...van, earlyBird: { days: 60, pct: 10 }, lastMinute: { days: 7, pct: 15 } };
  assert.equal(App.quote(deals, S, E, { today: '2026-09-01' }).discountKind, 'earlyBird');
  assert.equal(App.quote(deals, S, E, { today: '2026-11-08' }).discountKind, 'lastMinute');
  assert.equal(App.quote(deals, S, E, { today: '2026-10-20' }).discountKind, null);
  // A 7-night trip booked early: 10% early-bird beats nothing, and the weekly 10% doesn't add to it
  const week = App.quote(deals, '2026-11-12', '2026-11-19', { today: '2026-09-01' });
  assert.equal(week.discountPct, 10);
  assert.equal(week.discount, Math.round(week.base * 0.1));
});
