/*
 * Shared core — format checks, masking and name matching for Indian identifiers.
 *
 * Plain script with no browser or Node APIs: loaded by the web app (for the
 * in-browser demo backend) and by the server (server/core.js), so both apply
 * exactly the same rules.
 */
(function (root) {
  const App = root.App = root.App || {};
  const core = App.core = App.core || {};

  // Error that is safe to show to the user; `status` is the HTTP status code
  core.fail = (status, message, code) => { const e = new Error(message); e.status = status; e.code = code; e.expose = true; return e; };

  const V = core.validate = {};
  V.PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
  V.GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
  V.IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
  V.DL_RE = /^[A-Z]{2}[0-9]{2}[0-9A-Z]{9,14}$/;
  V.REG_RE = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$|^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/;
  V.ACCOUNT_RE = /^[0-9]{9,18}$/;
  V.DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  V.clean = (s) => String(s ?? '').toUpperCase().replace(/[\s-]/g, '');

  const GST_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  // GSTIN check digit (15th character), per the GSTN algorithm
  V.gstinCheckChar = (first14) => {
    let sum = 0;
    for (let i = 0; i < 14; i++) {
      const v = GST_CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
      sum += Math.floor(v / 36) + (v % 36);
    }
    return GST_CHARS[(36 - (sum % 36)) % 36];
  };
  V.isValidGstin = (g) => V.GSTIN_RE.test(g) && V.gstinCheckChar(g.slice(0, 14)) === g[14];
  V.panFromGstin = (g) => g.slice(2, 12);
  V.maskPan = (p) => (p ? 'XXXXX' + p.slice(5) : '');
  V.maskTail = (s, n = 4) => (s ? '•'.repeat(Math.max(0, s.length - n)) + s.slice(-n) : '');

  // Provider dates come as dd/mm/yyyy or DDMMYYYY (DigiLocker); normalise to yyyy-mm-dd
  V.toIsoDate = (s) => {
    if (!s) return null;
    const m = String(s).match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return String(s).slice(0, 10);
    const d8 = String(s).match(/^(\d{2})(\d{2})(\d{4})$/);
    if (d8) return `${d8[3]}-${d8[2]}-${d8[1]}`;
    return null;
  };
  V.today = () => new Date().toISOString().slice(0, 10);
  V.daysUntil = (iso) => (iso ? Math.floor((Date.parse(iso + 'T00:00:00Z') - Date.parse(V.today() + 'T00:00:00Z')) / 86400000) : null);

  /* ---------- Name matching (Aadhaar vs PAN vs RC vs bank) ----------
   * Handles case, punctuation, honorifics, initials ("R. Mehta" ~ "Rohan Mehta"),
   * token order and small spelling differences.
   */
  const TITLES = new Set(['MR', 'MRS', 'MS', 'MISS', 'DR', 'SHRI', 'SRI', 'SMT', 'KUMARI', 'KM']);
  const COMPANY = /\b(PVT|PRIVATE|LTD|LIMITED|LLP|CO|COMPANY|AND|THE|INDIA|ENTERPRISES?)\b/g;
  const tokens = (name, opts = {}) => {
    let s = String(name || '').toUpperCase().replace(/[^A-Z\s]/g, ' ');
    if (opts.company) s = s.replace(COMPANY, ' ');
    return s.split(/\s+/).filter(t => t && !TITLES.has(t));
  };
  const lev = (a, b) => {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return dp[a.length][b.length];
  };
  const tokenMatch = (a, b) => {
    if (a === b) return 1;
    if (a.length === 1 || b.length === 1) return a[0] === b[0] ? 0.9 : 0;
    const sim = 1 - lev(a, b) / Math.max(a.length, b.length);
    return sim >= 0.8 ? sim : 0;
  };
  // Returns { score: 0-100, result: 'match' | 'partial' | 'mismatch' }
  core.compareNames = (a, b, opts = {}) => {
    const ta = tokens(a, opts), tb = tokens(b, opts);
    if (!ta.length || !tb.length) return { score: 0, result: 'mismatch' };
    const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
    const used = new Set();
    let total = 0;
    for (const t of small) {
      let best = 0, bestJ = -1;
      big.forEach((u, j) => { if (!used.has(j)) { const s = tokenMatch(t, u); if (s > best) { best = s; bestJ = j; } } });
      if (bestJ >= 0) used.add(bestJ);
      total += best;
    }
    // Missing middle names are only lightly penalised
    const score = Math.max(0, Math.round((total / small.length - (big.length - small.length) * 0.08) * 100));
    return { score, result: score >= 85 ? 'match' : score >= 65 ? 'partial' : 'mismatch' };
  };
  core.nameTokens = tokens;
})(typeof window !== 'undefined' ? window : globalThis);
