// Builds the site that ships: index.html plus minified, content-hashed bundles in
// assets/build/. The source shell is app.html, which loads every file separately
// (handy for debugging: open /app.html on the Node server).
//
//   app.html (source)            index.html (built)
//   boot.js                  →   assets/build/boot.<hash>.js      (runs first, in <head>)
//   deferred scripts, in order → assets/build/app.<hash>.js       (one file)
//   <template id="staff-scripts">→ assets/build/staff.<hash>.js   (owner and admin, loaded on demand)
//   assets/css/app.css       →   assets/build/app.<hash>.css
//
// The scripts are plain browser scripts sharing the global `App`, so they're joined
// in order and minified as one script (top-level names are kept).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'assets/build';
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const src = read('app.html');

const tpl = src.match(/<template id="staff-scripts">([\s\S]*?)<\/template>/);
if (!tpl) throw new Error('app.html: <template id="staff-scripts"> not found');
const srcsIn = (html) => [...html.matchAll(/<script src="(assets\/js\/[^"]+)"( defer)?><\/script>/g)].map(m => ({ file: m[1], defer: !!m[2] }));
const staff = srcsIn(tpl[1]).map(s => s.file);
const outside = srcsIn(src.replace(tpl[0], ''));
const boot = outside.filter(s => !s.defer).map(s => s.file);
const main = outside.filter(s => s.defer).map(s => s.file);

const TARGET = ['chrome100', 'firefox100', 'safari15', 'edge100'];
const js = async (files) => {
  // Each file ends with a newline and a semicolon guard, so joined files can't run together
  const code = files.map(f => `/* ${f} */\n${read(f)}\n;`).join('\n');
  return (await transform(code, { loader: 'js', minify: true, target: TARGET, legalComments: 'none', charset: 'utf8' })).code;
};
const css = async (file) => (await transform(read(file), { loader: 'css', minify: true, target: TARGET, charset: 'utf8' })).code;

fs.rmSync(path.join(ROOT, OUT), { recursive: true, force: true });
fs.mkdirSync(path.join(ROOT, OUT), { recursive: true });
const write = (name, ext, code) => {
  const hash = crypto.createHash('sha256').update(code).digest('hex').slice(0, 10);
  const rel = `${OUT}/${name}.${hash}.${ext}`;
  fs.writeFileSync(path.join(ROOT, rel), code);
  return rel;
};

const out = {
  boot: write('boot', 'js', await js(boot)),
  app: write('app', 'js', await js(main)),
  staff: write('staff', 'js', await js(staff)),
  css: write('app', 'css', await css('assets/css/app.css'))
};

let html = src.replace(tpl[0], `<template id="staff-scripts"><script src="${out.staff}"></script></template>`);
for (const s of outside) html = html.replace(new RegExp(`[ \\t]*<script src="${s.file.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"( defer)?></script>\\n?`), '');
html = html
  .replace('<link rel="stylesheet" href="assets/css/app.css">', `<link rel="stylesheet" href="${out.css}">\n  <script src="${out.boot}"></script>`)
  .replace('</body>', `  <script src="${out.app}" defer></script>\n</body>`)
  .replace(/<!-- Owner and admin screens:[^>]*-->\n\s*/, '')
  .replace('<head>', '<head>\n  <!-- Built by scripts/build.mjs from app.html: edit app.html, then run npm run build. -->');
if (/assets\/js\//.test(html)) throw new Error('index.html still refers to a source script');
fs.writeFileSync(path.join(ROOT, 'index.html'), html);

const kb = (f) => (fs.statSync(path.join(ROOT, f)).size / 1024).toFixed(0) + ' KB';
const srcKb = (files) => (files.reduce((n, f) => n + fs.statSync(path.join(ROOT, f)).size, 0) / 1024).toFixed(0) + ' KB';
console.log(`Built index.html:
  ${out.app}  ${kb(out.app)} (from ${main.length} files, ${srcKb(main)})
  ${out.staff}  ${kb(out.staff)} (from ${staff.length} files, ${srcKb(staff)})
  ${out.css}  ${kb(out.css)} (from ${srcKb(['assets/css/app.css'])})
  ${out.boot}  ${kb(out.boot)}`);
