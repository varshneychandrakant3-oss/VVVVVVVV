/*
 * Shared core — one place for Indian formatting, used by every screen and by
 * the server. Dates are 'YYYY-MM-DD' strings (or ISO timestamps) and are shown
 * as DD MMM YYYY with fixed English month names, so they look the same in
 * every browser, whatever its locale or ICU version.
 *
 *   App.fmt.money(125000)            → ₹1,25,000
 *   App.fmt.date('2026-11-12')       → 12 Nov 2026
 *   App.fmt.dateRange(a, b)          → 12 – 16 Nov 2026 · 28 Nov – 2 Dec 2026
 *   App.fmt.km(1234)                 → 1,234 km
 */
(function (root) {
  const App = root.App = root.App || {};
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const moneyFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  const numFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

  // 'YYYY-MM-DD…' → { y, m (1-12), d, wd (0 = Sunday) } using the calendar date as written
  const parts = (s) => {
    const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return null;
    return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
  };
  const plural = (n, word, many = word + 's') => `${numFmt.format(n)} ${n === 1 ? word : many}`;

  const fmt = App.fmt = {
    MONTHS, MONTHS_LONG, DAYS,
    money: (n) => moneyFmt.format(Math.round(Number(n) || 0)),
    number: (n) => numFmt.format(Number(n) || 0),
    plural,
    nights: (n) => plural(n, 'night'),
    // Chart labels: ₹850 · ₹12k · ₹4.5L · ₹1.2Cr
    moneyCompact: (v) => { v = Math.round(Number(v) || 0); return v >= 1e7 ? '₹' + numFmt.format(v / 1e7) + 'Cr' : v >= 1e5 ? '₹' + numFmt.format(v / 1e5) + 'L' : v >= 1000 ? '₹' + Math.round(v / 1000) + 'k' : '₹' + v; },
    km: (n) => `${numFmt.format(Math.round(Number(n) || 0))} km`,
    // 12 Nov 2026 · { year: false } → 12 Nov · { weekday: true } → Thu, 12 Nov 2026
    date: (s, { year = true, weekday = false } = {}) => {
      const p = s && parts(s);
      if (!p) return '';
      return `${weekday ? DAYS[p.wd] + ', ' : ''}${p.d} ${MONTHS[p.m - 1]}${year ? ' ' + p.y : ''}`;
    },
    dateRange: (a, b) => {
      const p = parts(a), q = parts(b);
      if (!p || !q) return fmt.date(a) || fmt.date(b);
      if (p.y !== q.y) return `${fmt.date(a)} – ${fmt.date(b)}`;
      if (p.m !== q.m) return `${p.d} ${MONTHS[p.m - 1]} – ${q.d} ${MONTHS[q.m - 1]} ${q.y}`;
      return `${p.d} – ${q.d} ${MONTHS[q.m - 1]} ${q.y}`;
    },
    monthYear: (y, m) => `${MONTHS_LONG[m - 1]} ${y}`,
    // Local time for timestamps: 12 Nov, 9:30 pm
    dateTime: (s) => {
      const t = new Date(s);
      if (isNaN(t)) return '';
      const h = t.getHours(), mm = String(t.getMinutes()).padStart(2, '0');
      return `${t.getDate()} ${MONTHS[t.getMonth()]}, ${h % 12 || 12}:${mm} ${h < 12 ? 'am' : 'pm'}`;
    },
    // First letter of the first name: "Ananya Iyer" → A, "Neha & Vikram Joshi" → N
    initial: (name) => (String(name || '').match(/\p{L}/u)?.[0] || '?').toUpperCase()
  };
})(typeof window !== 'undefined' ? window : globalThis);
