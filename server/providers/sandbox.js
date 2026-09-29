// Test-mode provider for the server: the shared core's sandbox
// (assets/js/core/sandbox.js) plus a short, realistic network delay.
import { core } from '../core.js';
import { ProviderError } from './cashfree.js';

const latency = () => new Promise(r => setTimeout(r, 250));
const wrap = (fn) => async (input) => {
  await latency();
  try { return fn(input); }
  catch (e) { throw e.retryable ? new ProviderError(e.message, { retryable: true, code: e.code }) : e; }
};

export const sandbox = {
  name: core.sandbox.name,
  verifyPan: wrap(core.sandbox.verifyPan),
  verifyGstin: wrap(core.sandbox.verifyGstin),
  verifyVehicle: wrap(core.sandbox.verifyVehicle),
  verifyDrivingLicence: wrap(core.sandbox.verifyDrivingLicence),
  verifyBank: wrap(core.sandbox.verifyBank)
};
