// Name matching across documents (Aadhaar vs PAN vs RC vs bank).
// Handles case, punctuation, honorifics, initials ("R. Mehta" ~ "Rohan Mehta"),
// token order and small spelling differences.

const TITLES = new Set(['MR', 'MRS', 'MS', 'MISS', 'DR', 'SHRI', 'SRI', 'SMT', 'KUMARI', 'KM', 'M/S', 'MS.']);
const COMPANY = /\b(PVT|PRIVATE|LTD|LIMITED|LLP|CO|COMPANY|AND|&|THE|INDIA|ENTERPRISES?)\b/g;

export function tokens(name, { company = false } = {}) {
  let s = String(name || '').toUpperCase().replace(/[^A-Z\s]/g, ' ');
  if (company) s = s.replace(COMPANY, ' ');
  return s.split(/\s+/).filter(t => t && !TITLES.has(t));
}

function lev(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return dp[a.length][b.length];
}

const tokenMatch = (a, b) => {
  if (a === b) return 1;
  if (a.length === 1 || b.length === 1) return a[0] === b[0] ? 0.9 : 0;
  const sim = 1 - lev(a, b) / Math.max(a.length, b.length);
  return sim >= 0.8 ? sim : 0;
};

// Returns { score: 0-100, result: 'match' | 'partial' | 'mismatch' }
export function compareNames(a, b, opts = {}) {
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
  // Missing middle names only lightly penalised; missing surname matters more
  const coverage = total / small.length;
  const extra = (big.length - small.length) * 0.08;
  const score = Math.max(0, Math.round((coverage - extra) * 100));
  return { score, result: score >= 85 ? 'match' : score >= 65 ? 'partial' : 'mismatch' };
}
