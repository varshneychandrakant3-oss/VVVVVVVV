// Format checks and masking for Indian identifiers — re-exported from the shared
// core (assets/js/core/validate.js) so server and browser use the same rules.
import { core } from '../core.js';

const V = core.validate;
export const { PAN_RE, GSTIN_RE, IFSC_RE, DL_RE, REG_RE, ACCOUNT_RE, DATE_RE, clean, gstinCheckChar, isValidGstin, panFromGstin, maskPan, maskTail, toIsoDate, daysUntil } = V;
