import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareNames } from '../lib/names.js';
import { isValidGstin, gstinCheckChar, toIsoDate, maskPan, maskTail } from '../lib/validate.js';
import { parseEAadhaar } from '../digilocker.js';

test('name matching handles case, titles, initials and order', () => {
  assert.equal(compareNames('Rohan Mehta', 'ROHAN MEHTA').result, 'match');
  assert.equal(compareNames('Mr. Rohan Mehta', 'rohan mehta').result, 'match');
  assert.equal(compareNames('R Mehta', 'Rohan Mehta').result, 'match');
  assert.equal(compareNames('Mehta Rohan', 'Rohan Mehta').result, 'match');
  assert.equal(compareNames('Rohan Kumar Mehta', 'Rohan Mehta').result, 'match');
  assert.equal(compareNames('Rohan Mehtaa', 'Rohan Mehta').result, 'match');
  assert.notEqual(compareNames('Priya Sharma', 'Rohan Mehta').result, 'match');
  assert.equal(compareNames('Someone Else', 'Rohan Mehta').result, 'mismatch');
  assert.equal(compareNames('Mehta Mountain Vans Pvt Ltd', 'MEHTA MOUNTAIN VANS PRIVATE LIMITED', { company: true }).result, 'match');
});

test('GSTIN check digit', () => {
  assert.ok(isValidGstin('29AAICP2912R1ZR'));   // example from provider docs
  assert.ok(isValidGstin('27AAPFU0939F1ZV'));   // widely published sample GSTIN
  assert.ok(!isValidGstin('27AAPFU0939F1ZX'));
  assert.equal(gstinCheckChar('27ABCDE1234F1Z').length, 1);
});

test('date and masking helpers', () => {
  assert.equal(toIsoDate('14/12/2024'), '2024-12-14');
  assert.equal(toIsoDate('31121970'), '1970-12-31');
  assert.equal(toIsoDate('2024-01-05'), '2024-01-05');
  assert.equal(maskPan('ABCDE1234F'), 'XXXXX1234F');
  assert.equal(maskTail('123456789012'), '••••••••9012');
});

test('refuses DigiLocker test mode alongside production verification', async () => {
  const { config, validateConfig } = await import('../config.js');
  const saved = JSON.parse(JSON.stringify(config));
  Object.assign(config, { provider: 'cashfree', sessionSecret: 'x'.repeat(40), publicUrl: 'https://vanyatra.example' });
  Object.assign(config.cashfree, { env: 'production', clientId: 'id', clientSecret: 'secret' });
  config.digilocker.mode = 'sandbox';
  assert.throws(() => validateConfig({ warn() {} }), /DIGILOCKER_MODE=sandbox/);
  config.digilocker = { ...config.digilocker, mode: 'live', clientId: 'a', clientSecret: 'b' };
  assert.doesNotThrow(() => validateConfig({ warn() {} }));
  config.publicUrl = 'http://vanyatra.example';
  assert.throws(() => validateConfig({ warn() {} }), /https/);
  Object.assign(config, saved);
});

test('e-Aadhaar XML parsing keeps only minimal fields', () => {
  const xml = '<Certificate><CertificateData><KycRes><UidData uid="xxxxxxxx4821"><Poi dob="15-01-1990" gender="F" name="Isha Verma"/><Poa house="12" pc="411001"/><Pht>BASE64PHOTO</Pht></UidData></KycRes></CertificateData></Certificate>';
  const p = parseEAadhaar(xml);
  assert.deepEqual(p, { name: 'Isha Verma', dob: '1990-01-15', gender: 'F', aadhaarLast4: '4821' });
});
