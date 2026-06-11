// Caption se rate + unit nikalna — PURE REGEX, koi AI nahi.
// Rule: rate SIRF tab jab "rate"/"price"/"rs"/"₹"/"@" ke AAGE number ho.
// Na mile to rate = 0 -> bot khud puchega.
const db = require('./db');

let _catCache = null;
let _catCacheAt = 0;

async function getCategories(firmId) {
  if (_catCache && Date.now() - _catCacheAt < 300000) return _catCache;
  const r = await db.query(
    'SELECT id, name FROM suppliers.categories WHERE firm_id = $1 OR firm_id IS NULL ORDER BY name',
    [firmId]
  );
  _catCache = r.rows;
  _catCacheAt = Date.now();
  return r.rows;
}

// "Rate 699", "price: 150", "rs 200", "₹ 90", "@120" -> number. Warna 0.
function parseLabeledRate(caption) {
  if (!caption) return 0;
  const clean = String(caption).replace(/,/g, '');
  const m = clean.match(/(?:rate|price|rs|inr|rupees|₹|@)\s*[:\-]?\s*(\d+(?:\.\d+)?)/i);
  return m ? parseFloat(m[1]) : 0;
}

// Sirf number (jab bot ne "rate kya hai?" pucha ho, supplier "699" bheje).
function parsePlainNumber(text) {
  if (!text) return 0;
  const m = String(text).replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

function parseUnit(caption) {
  if (!caption) return 'mtr';
  if (/pc|piece|pcs/i.test(caption)) return 'pcs';
  if (/kg|kilo/i.test(caption)) return 'kg';
  return 'mtr';
}

// Caption me category ka naam aaya kya? (substring match) -> category id/name.
async function guessCategory(caption, firmId) {
  if (!caption) return { categoryId: null, categoryName: null };
  const cats = await getCategories(firmId);
  const low = caption.toLowerCase();
  for (const c of cats) {
    if (c.name && low.includes(String(c.name).toLowerCase())) {
      return { categoryId: c.id, categoryName: c.name };
    }
  }
  return { categoryId: null, categoryName: null };
}

// Caption se rate/unit/category — bina AI.
async function extractRate(caption, firmId) {
  const rate = parseLabeledRate(caption);
  const unit = parseUnit(caption);
  const { categoryId, categoryName } = await guessCategory(caption, firmId);
  return { rate, unit, categoryId, categoryName, model: 'regex' };
}

module.exports = { extractRate, parseLabeledRate, parsePlainNumber };
