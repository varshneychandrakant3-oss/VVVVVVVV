// Tiny JSON-file store. Good enough for a single-server pilot; swap for a real
// database (Postgres etc.) before scaling out.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const cache = new Map();

const file = (name) => path.join(config.dataDir, name + '.json');

export function read(name, fallback) {
  if (cache.has(name)) return cache.get(name);
  let value = fallback;
  try { value = JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch { /* first run */ }
  cache.set(name, value);
  return value;
}

export function write(name, value) {
  cache.set(name, value);
  fs.mkdirSync(config.dataDir, { recursive: true });
  const tmp = file(name) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file(name)); // atomic replace
}

export function appendLog(name, entry) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.appendFileSync(path.join(config.dataDir, name + '.jsonl'), JSON.stringify(entry) + '\n', { mode: 0o600 });
}

export function resetCache() { cache.clear(); }
