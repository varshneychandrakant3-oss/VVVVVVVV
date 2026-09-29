// Loads settings from .env (if present) and the process environment.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').replace(/\s+#.*$/, '');
  }
}
const env = (k, d = '') => process.env[k] || d;

export const config = {
  port: Number(env('PORT', '8080')),
  publicUrl: env('PUBLIC_URL', 'http://localhost:' + env('PORT', '8080')).replace(/\/$/, ''),
  dataDir: env('DATA_DIR', path.join(ROOT, 'data')),
  sessionSecret: env('SESSION_SECRET'),
  provider: env('VERIFY_PROVIDER', 'sandbox'),
  cashfree: {
    env: env('CASHFREE_ENV', 'sandbox'),
    clientId: env('CASHFREE_CLIENT_ID'),
    clientSecret: env('CASHFREE_CLIENT_SECRET')
  },
  digilocker: {
    mode: env('DIGILOCKER_MODE', 'sandbox'),
    clientId: env('DIGILOCKER_CLIENT_ID'),
    clientSecret: env('DIGILOCKER_CLIENT_SECRET'),
    redirectUri: env('DIGILOCKER_REDIRECT_URI', env('PUBLIC_URL', 'http://localhost:8080').replace(/\/$/, '') + '/api/digilocker/callback')
  }
};

export const isLive = () => config.provider !== 'sandbox' || config.digilocker.mode !== 'sandbox';

export function validateConfig(log = console) {
  if (!config.sessionSecret) {
    if (isLive()) throw new Error('SESSION_SECRET must be set when real verification is enabled.');
    config.sessionSecret = crypto.randomBytes(48).toString('base64url');
    log.warn('SESSION_SECRET not set — using a random one (sessions reset on restart). Set it in .env.');
  }
  if (config.provider === 'cashfree' && (!config.cashfree.clientId || !config.cashfree.clientSecret)) {
    throw new Error('VERIFY_PROVIDER=cashfree needs CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET.');
  }
  // The DigiLocker test screen lets anyone type their own "Aadhaar" details, so it
  // must never run next to production verification
  if (config.provider !== 'sandbox' && config.cashfree.env === 'production' && config.digilocker.mode !== 'live') {
    throw new Error('DIGILOCKER_MODE=sandbox cannot be used with production verification. Set DIGILOCKER_MODE=live.');
  }
  if (config.digilocker.mode === 'live' && (!config.digilocker.clientId || !config.digilocker.clientSecret)) {
    throw new Error('DIGILOCKER_MODE=live needs DIGILOCKER_CLIENT_ID and DIGILOCKER_CLIENT_SECRET.');
  }
  if (isLive() && !config.publicUrl.startsWith('https://') && !/localhost|127\.0\.0\.1/.test(config.publicUrl)) {
    throw new Error('PUBLIC_URL must use https when real verification is enabled.');
  }
}
