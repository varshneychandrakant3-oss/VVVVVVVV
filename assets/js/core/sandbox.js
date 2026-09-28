/*
 * Shared core — test-mode verification provider.
 *
 * Returns realistic, deterministic results so every flow (including failures)
 * can be exercised without real credentials. Used by the server when
 * VERIFY_PROVIDER=sandbox and by the in-browser demo backend.
 *
 * Test values (the last characters decide the outcome):
 *   PAN            ...X  → not found           5th letter Z → name mismatch
 *   GSTIN          13th char 9 → Cancelled      (must have a valid check digit)
 *   Vehicle reg    ...0000 not found · ...1111 insurance expired · ...2222 owner mismatch
 *                  ...3333 blacklisted · ...4444 private (not commercial) · ...5555 PUC expired
 *   Driving licence ...0000 not found · ...1111 expired
 *   Bank account   ...0000 invalid · ...2222 name mismatch
 *   Anything ending 9999 → the government source is "down" (tests the manual-review fallback)
 */
(function (root) {
  const App = root.App = root.App || {};
  const core = App.core = App.core || {};
  const iso = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const down = (id) => {
    if (String(id).endsWith('9999')) {
      const e = new Error('The government source is temporarily unavailable. We’ll review this manually.');
      e.retryable = true; e.isProviderError = true; e.code = 'source_down';
      throw e;
    }
  };

  core.sandbox = {
    name: 'Test mode (no real checks)',

    verifyPan({ pan }) {
      down(pan);
      if (pan.endsWith('X')) return { found: false, panStatus: 'N', nameMatch: false, dobMatch: false, aadhaarLinked: null };
      return { found: true, panStatus: 'E', nameMatch: pan[4] !== 'Z', dobMatch: true, aadhaarLinked: true, ref: 'SBX-PAN' };
    },

    verifyGstin({ gstin, businessName }) {
      down(gstin);
      return {
        found: true, legalName: (businessName || 'TEST TRADERS').toUpperCase(), tradeName: businessName || 'Test Traders',
        status: gstin[12] === '9' ? 'Cancelled' : 'Active', registeredOn: '2019-07-01', constitution: 'Proprietorship',
        address: 'Test address, ' + gstin.slice(0, 2) + ' state', ref: 'SBX-GST'
      };
    },

    verifyVehicle({ regNo, expectedOwner }) {
      down(regNo);
      if (regNo.endsWith('0000')) return { found: false };
      const t = regNo.slice(-4);
      return {
        found: true, owner: t === '2222' ? 'SOMEONE ELSE' : String(expectedOwner || 'TEST OWNER').toUpperCase(),
        rcStatus: 'ACTIVE', regDate: '2023-03-14', rcValidUpto: iso(3650),
        maker: 'FORCE MOTORS LTD', model: 'TRAVELLER 3350 CARAVAN', makeModel: 'FORCE MOTORS LTD TRAVELLER 3350 CARAVAN',
        fuel: 'DIESEL', vehicleClass: 'Motor Caravan', seats: 4, sleeperCapacity: 4,
        isCommercial: t !== '4444', regAuthority: 'TEST RTO', taxUpto: iso(365),
        insurance: { company: 'TEST GENERAL INSURANCE CO LTD', policyNumber: 'SBX' + regNo.slice(-6), validUpto: t === '1111' ? iso(-12) : iso(300) },
        puc: { number: 'PUC' + regNo.slice(-4), validUpto: t === '5555' ? iso(-5) : iso(160) },
        permit: { type: 'TOURIST PERMIT', number: 'TP' + regNo.slice(-5), validUpto: iso(420) },
        nationalPermit: { number: null, validUpto: null },
        blacklisted: t === '3333', financer: null, ref: 'SBX-RC'
      };
    },

    verifyDrivingLicence({ dlNumber, name }) {
      down(dlNumber);
      if (dlNumber.endsWith('0000')) return { found: false };
      return { found: true, name: String(name || 'TEST DRIVER').toUpperCase(), validUpto: dlNumber.endsWith('1111') ? iso(-40) : iso(2900), transportValidUpto: null, issuedOn: '2015-06-01', classes: ['LMV', 'MCWG'], ref: 'SBX-DL' };
    },

    verifyBank({ account, name }) {
      down(account);
      if (account.endsWith('0000')) return { valid: false, statusCode: 'INVALID_ACCOUNT_FAIL', nameAtBank: null, nameMatchScore: 0, nameMatchResult: 'NO_MATCH' };
      const mismatch = account.endsWith('2222');
      return { valid: true, statusCode: 'ACCOUNT_IS_VALID', nameAtBank: mismatch ? 'OTHER PERSON' : String(name).toUpperCase(), nameMatchScore: mismatch ? 12 : 100, nameMatchResult: mismatch ? 'NO_MATCH' : 'DIRECT_MATCH', bankName: 'TEST BANK', branch: 'MAIN BRANCH', ref: 'SBX-BAV' };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
