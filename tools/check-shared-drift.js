#!/usr/bin/env node
/* =============================================================================
 * SHARED DRIFT GUARD — do app me ek hi screen ki do copy hain, wo alag na ho jaayein
 * =============================================================================
 * apps/web (agency) aur apps/manufacturer, dono me Wallet, Plans, CREDIL,
 * Party Chat, Complaint Box, HR, Bazaar Link, Online Dukan, Team aur shared/
 * ki NAKAL hai — lagbhag 16,000 line.
 *
 * Asli ilaaj ek hi copy rakhna hai, par uske liye pehle dono app ka
 * AuthService ek roop ka karna padega (abhi ek `mfg_token` padhta hai, doosra
 * apni jagah se) — aur wo apps/web chhede bina nahi hota, jispar asli grahak
 * baithe hain.
 *
 * Tab tak ye guard: agency me bug theek karo aur manufacturer ki copy bhool
 * jao, to ye CHILLAYEGA. Chup-chaap alag ho jaana sabse bura hai — mahino
 * baad pata chalta hai, aur tab tak dono taraf alag-alag bug pal chuke hote hain.
 *
 * Chalao:  node tools/check-shared-drift.js
 * ============================================================================= */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'apps', 'web', 'src', 'app');
const MFG = path.join(ROOT, 'apps', 'manufacturer', 'src', 'app');

/* -----------------------------------------------------------------------------
 * JAAN-BOOJH KAR alag rakhi gayi cheezein — inhe milane ki koshish mat karna
 * --------------------------------------------------------------------------- */
const CHHOD_DO = {
  'shared/field-registry.ts':
    'Manufacturer ka apna registry hai (job slip/challan/inward ke field). '
    + 'Agency wale me bill/order/commission ke hain.',
  'modules/trading/services/trading.service.ts':
    'Manufacturer me sirf patla khol hai — Party Chat ko party ki list chahiye, '
    + 'aur wo /api/mfg/parties se aati hai. Agency ki 500-line service ki zarurat nahi.'
};

/* -----------------------------------------------------------------------------
 * Jo farak MAANA hua hai — milaan se pehle dono taraf ek jaisa kar dete hain,
 * warna har file "alag" dikhegi aur guard bekaar ho jayega
 * --------------------------------------------------------------------------- */
function normalise(s) {
  return s
    // Import ki gehrai: credil ka pardah agency me `pages/` ke andar hai,
    // manufacturer me ek seedhi upar. Isse sirf `../` ki ginti badalti hai,
    // code nahi — isliye dono ko ek jaisa kar lete hain.
    .replace(/from '(\.\.\/)+shared\//g, "from 'SHARED/")
    .replace(/from '\.?\.?\/?credil\.service'/g, "from 'CREDILSVC'")
    // Auth service ka rasta: agency me core/auth/, manufacturer me core/
    .replace(/core\/auth\/auth\.service/g, 'core/auth.service')
    // Token: agency me signal, manufacturer me getter
    .replace(/auth\.accessToken\(\)/g, 'auth.token')
    // Brand rang: agency purple, manufacturer navy
    .replace(/#5c1a8b/gi, 'BRAND').replace(/#1B2E5C/gi, 'BRAND')
    .replace(/#6b3fa0/gi, 'MUTED').replace(/#4A5878/gi, 'MUTED')
    .replace(/#9333ea/gi, 'ACCENT').replace(/#DC2626/gi, 'ACCENT')
    .replace(/purple-50\/50/g, 'BRANDSOFT').replace(/anjaninex-navy-soft/g, 'BRANDSOFT')
    // Component ka selector: app-xxx bनाम mfg-xxx
    .replace(/selector: '(app|mfg)-/g, "selector: 'X-")
    // Line ending aur aakhri khali line
    .replace(/\r\n/g, '\n').trimEnd();
}

/* -----------------------------------------------------------------------------
 * Manufacturer ki har copy ke saamne agency wali file kaunsi hai
 * --------------------------------------------------------------------------- */
const SAAJHA_MODULE = ['wallet', 'plans', 'complaints', 'party-chat',
                       'hr', 'suppliers', 'dukan', 'team', 'subscription'];

/** credil ki file agency me `pages/` ke andar hai, manufacturer me seedhi. */
const KHAAS = {
  'modules/credil/credil-page.component.ts': 'modules/credil/pages/credil-page.component.ts'
};

function tsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? tsFiles(p) : (d.name.endsWith('.ts') ? [p] : []);
  });
}

function jodeeList() {
  const out = [];
  const daalo = (mfgAbs) => {
    const rel = path.relative(MFG, mfgAbs).split(path.sep).join('/');
    if (CHHOD_DO[rel]) return;
    const webRel = KHAAS[rel] || rel;
    out.push({ rel, mfg: mfgAbs, web: path.join(WEB, webRel), webRel });
  };

  tsFiles(path.join(MFG, 'shared')).forEach(daalo);
  for (const m of SAAJHA_MODULE) tsFiles(path.join(MFG, 'modules', m)).forEach(daalo);
  tsFiles(path.join(MFG, 'modules', 'credil')).forEach(daalo);
  tsFiles(path.join(MFG, 'modules', 'settings')).forEach(daalo);
  return out;
}

/* --------------------------------------------------------------------------- */
const jodee = jodeeList();
const alag = [];
const gayab = [];

for (const j of jodee) {
  if (!fs.existsSync(j.web)) { gayab.push(j); continue; }
  const a = normalise(fs.readFileSync(j.web, 'utf8'));
  const b = normalise(fs.readFileSync(j.mfg, 'utf8'));
  if (a !== b) alag.push(j);
}

const N = jodee.length;
console.log(`\nSaajha file: ${N}  ·  chhodi hui: ${Object.keys(CHHOD_DO).length}\n`);

if (gayab.length) {
  console.log('⚠️  Ye manufacturer me hain par agency me nahi mili —');
  console.log('    ya to naam badla hai, ya ye manufacturer ki apni hai.');
  console.log('    Apni hai to CHHOD_DO me wajah likh do:\n');
  gayab.forEach(g => console.log(`      ${g.rel}`));
  console.log();
}

if (alag.length === 0 && gayab.length === 0) {
  console.log('✅ Dono copy abhi tak ek jaisi hain.\n');
  process.exit(0);
}

if (alag.length) {
  console.log(`❌ ${alag.length} file alag ho chuki hai:\n`);
  alag.forEach(a => {
    console.log(`   ${a.rel}`);
    console.log(`      agency : apps/web/src/app/${a.webRel}`);
    console.log(`      mfg    : apps/manufacturer/src/app/${a.rel}`);
  });
  console.log('\n   Ek jagah theek kiya to doosri jagah bhi karna hai.');
  console.log('   Farak jaan-boojh kar hai to tools/check-shared-drift.js me');
  console.log('   normalise() ya CHHOD_DO me wajah likh do.\n');
}

process.exit(1);
