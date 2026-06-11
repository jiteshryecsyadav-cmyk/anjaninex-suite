/* Build-time version stamp — har build pe index.html me __APP_VERSION__ ko
   "YYYY.MM.DD HH:mm · <git-short-hash>" se replace karta hai.
   Deploy: node scripts/gen-version.js && ng build  */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let hash = 'local';
try { hash = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim(); } catch (e) {}

const now = new Date(Date.now() + 5.5 * 3600 * 1000); // IST
const pad = (n) => String(n).padStart(2, '0');
const ver = `${now.getUTCFullYear()}.${pad(now.getUTCMonth() + 1)}.${pad(now.getUTCDate())} `
          + `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())} · ${hash}`;

const idx = path.join(__dirname, '..', 'src', 'index.html');
let html = fs.readFileSync(idx, 'utf8');
html = html.replace(/window\.__APP_VERSION__\s*=\s*'[^']*'/, `window.__APP_VERSION__ = '${ver}'`);
fs.writeFileSync(idx, html);
console.log('BUILD_VERSION =', ver);
