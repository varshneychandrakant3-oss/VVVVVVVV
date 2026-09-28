// Loads the shared core (the same plain scripts the web app uses) into Node,
// so the server and the in-browser demo backend apply identical rules.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { ROOT } from './config.js';

const FILES = [
  'assets/js/config.js',
  'assets/js/core/validate.js',
  'assets/js/core/sandbox.js',
  'assets/js/core/verify-rules.js',
  'assets/js/core/market-rules.js',
  'assets/js/seed.js',
  'assets/js/db.js'
];

const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });

export const App = ctx.App;
export const core = ctx.App.core;
