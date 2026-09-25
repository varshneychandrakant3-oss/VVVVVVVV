// Accounts and sessions. Passwords are hashed with scrypt; sessions are random
// ids in an HttpOnly, SameSite=Lax cookie signed with SESSION_SECRET.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { read, write } from './store.js';
import { HttpError, parseCookies, cookie } from './http.js';

const SESSION_COOKIE = 'vy_sess';
const SESSION_TTL = 8 * 3600e3;

// Demo accounts mirror the ones in assets/js/seed.js (password demo1234)
const DEMO = [
  ['u_admin', 'Aisha Kapoor', 'admin@vanyatra.in', 'admin'],
  ['u_owner1', 'Rohan Mehta', 'owner@vanyatra.in', 'owner'],
  ['u_owner2', 'Meera Nair', 'meera@vanyatra.in', 'owner'],
  ['u_owner3', 'Tenzin Dorje', 'tenzin@vanyatra.in', 'owner'],
  ['u_owner4', 'Karan Singh', 'karan@vanyatra.in', 'owner'],
  ['u_owner5', 'Farhan Shaikh', 'farhan@vanyatra.in', 'owner'],
  ['u_owner6', 'Banri Syiem', 'banri@vanyatra.in', 'owner'],
  ['u_owner7', 'Divya Hegde', 'divya@vanyatra.in', 'owner'],
  ['u_owner8', 'Vikram Rathore', 'vikram@vanyatra.in', 'owner'],
  ['u_cust1', 'Priya Sharma', 'traveller@vanyatra.in', 'customer'],
  ['u_cust2', 'Arjun Rao', 'arjun@example.com', 'customer'],
  ['u_cust3', 'Neha & Vikram Joshi', 'joshis@example.com', 'customer'],
  ['u_cust4', 'Sam Fernandes', 'sam@example.com', 'customer'],
  ['u_cust5', 'Ananya Iyer', 'ananya@example.com', 'customer']
];

export function hashPassword(pw, salt = crypto.randomBytes(16)) {
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
export function checkPassword(pw, stored) {
  const [, s, h] = String(stored).split('$');
  if (!s || !h) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(s, 'base64'), 64, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(hash, Buffer.from(h, 'base64'));
}
const DUMMY_HASH = hashPassword('timing-equaliser');

export function accounts() {
  let list = read('accounts', null);
  const missing = DEMO.filter(([id, , email]) => !list || !list.some(a => a.id === id || a.email === email));
  if (missing.length) {
    // First run, or new demo hosts added since this server was set up
    const pw = hashPassword('demo1234');
    list = [...(list || []), ...missing.map(([id, name, email, role]) => ({ id, name, email, role, password: pw, status: 'active', createdAt: new Date().toISOString(), demo: true }))];
    write('accounts', list);
  }
  return list;
}
export const publicUser = (u) => u && ({ id: u.id, name: u.name, email: u.email, role: u.role });
export const findAccount = (id) => accounts().find(a => a.id === id);

export function login(email, password) {
  const u = accounts().find(a => a.email.toLowerCase() === String(email || '').trim().toLowerCase());
  // Always run scrypt so response time doesn't reveal whether the email exists
  const ok = checkPassword(String(password || ''), u ? u.password : DUMMY_HASH);
  if (!u || !ok) throw new HttpError(401, 'Email or password is incorrect.');
  if (u.status !== 'active') throw new HttpError(403, 'This account is suspended. Contact support.');
  return u;
}

export function signup({ name, email, password, role }) {
  name = String(name || '').trim(); email = String(email || '').trim().toLowerCase();
  if (name.length < 2 || name.length > 80) throw new HttpError(400, 'Please enter your full name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw new HttpError(400, 'Please enter a valid email.');
  if (String(password).length < 8 || !/\d/.test(password) || !/[a-z]/i.test(password)) throw new HttpError(400, 'Password needs at least 8 characters including a letter and a number.');
  const list = accounts();
  if (list.some(a => a.email === email)) throw new HttpError(409, 'An account with this email already exists.');
  const u = { id: 'u_' + crypto.randomBytes(8).toString('hex'), name, email, role: role === 'owner' ? 'owner' : 'customer', password: hashPassword(password), status: 'active', createdAt: new Date().toISOString() };
  list.push(u);
  write('accounts', list);
  return u;
}

export function changePassword(userId, oldPw, newPw) {
  const list = accounts();
  const u = list.find(a => a.id === userId);
  if (!u || !checkPassword(String(oldPw || ''), u.password)) throw new HttpError(400, 'Current password is incorrect.');
  if (String(newPw).length < 8 || !/\d/.test(newPw) || !/[a-z]/i.test(newPw)) throw new HttpError(400, 'New password needs 8+ characters with a letter and a number.');
  u.password = hashPassword(newPw);
  write('accounts', list);
  // Sign out other sessions
  const sessions = read('sessions', {});
  for (const [k, s] of Object.entries(sessions)) if (s.userId === userId) delete sessions[k];
  write('sessions', sessions);
}

export function setAccountStatus(admin, userId, status) {
  if (!['active', 'suspended'].includes(status)) throw new HttpError(400, 'Invalid status.');
  const list = accounts();
  const u = list.find(a => a.id === userId);
  if (!u) throw new HttpError(404, 'User not found.');
  if (u.role === 'admin') throw new HttpError(400, 'Admins can’t be suspended here.');
  u.status = status;
  write('accounts', list);
  if (status === 'suspended') { // end their sessions immediately
    const sessions = read('sessions', {});
    for (const [k, s] of Object.entries(sessions)) if (s.userId === userId) delete sessions[k];
    write('sessions', sessions);
  }
  return u;
}

const sign = (id) => id + '.' + crypto.createHmac('sha256', config.sessionSecret).update(id).digest('base64url');
const unsign = (v) => {
  const i = String(v).lastIndexOf('.');
  if (i < 1) return null;
  const id = v.slice(0, i);
  const a = Buffer.from(sign(id)), b = Buffer.from(v);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? id : null;
};
const secure = () => config.publicUrl.startsWith('https://');

export function createSession(res, user) {
  const id = crypto.randomBytes(32).toString('base64url');
  const sessions = read('sessions', {});
  const now = Date.now();
  for (const [k, s] of Object.entries(sessions)) if (s.expires < now) delete sessions[k];
  sessions[id] = { userId: user.id, expires: now + SESSION_TTL };
  write('sessions', sessions);
  res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, sign(id), { maxAge: SESSION_TTL / 1000, secure: secure() }));
}

export function destroySession(req, res) {
  const id = unsign(parseCookies(req)[SESSION_COOKIE] || '');
  if (id) { const s = read('sessions', {}); delete s[id]; write('sessions', s); }
  res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, '', { maxAge: 0, secure: secure() }));
}

export function currentUser(req) {
  const id = unsign(parseCookies(req)[SESSION_COOKIE] || '');
  if (!id) return null;
  const s = read('sessions', {})[id];
  if (!s || s.expires < Date.now()) return null;
  const u = findAccount(s.userId);
  return u && u.status === 'active' ? u : null;
}

export function requireUser(req, roles) {
  const u = currentUser(req);
  if (!u) throw new HttpError(401, 'Please sign in.', 'unauthenticated');
  if (roles && !roles.includes(u.role)) throw new HttpError(403, 'You don’t have access to this.', 'forbidden');
  return u;
}
