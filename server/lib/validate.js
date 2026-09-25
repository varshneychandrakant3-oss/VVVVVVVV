// Format checks and masking for Indian identifiers. These run before any paid
// API call so obviously wrong input never leaves the server.

export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const DL_RE = /^[A-Z]{2}[0-9]{2}[0-9A-Z]{9,14}$/;
export const REG_RE = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$|^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/;
export const ACCOUNT_RE = /^[0-9]{9,18}$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const clean = (s) => String(s ?? '').toUpperCase().replace(/[\s-]/g, '');

const GST_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
// GSTIN check digit (15th character), per the GSTN algorithm
export function gstinCheckChar(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GST_CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return GST_CHARS[(36 - (sum % 36)) % 36];
}
export const isValidGstin = (g) => GSTIN_RE.test(g) && gstinCheckChar(g.slice(0, 14)) === g[14];
export const panFromGstin = (g) => g.slice(2, 12);

export const maskPan = (p) => p ? 'XXXXX' + p.slice(5) : '';
export const maskTail = (s, n = 4) => s ? '•'.repeat(Math.max(0, s.length - n)) + s.slice(-n) : '';

// Provider dates come as dd/mm/yyyy; normalise to yyyy-mm-dd
export function toIsoDate(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return String(s).slice(0, 10);
  const d8 = String(s).match(/^(\d{2})(\d{2})(\d{4})$/); // DDMMYYYY (DigiLocker)
  if (d8) return `${d8[3]}-${d8[2]}-${d8[1]}`;
  return null;
}

export const daysUntil = (iso) => iso ? Math.floor((Date.parse(iso + 'T00:00:00Z') - Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')) / 86400000) : null;
