// WhatsApp chat se naye supplier/buyer ki registration.
// State machine wa.conversations me store hota hai.
const db = require('./db');

const FIRM_ID = process.env.FIRM_ID || null;

async function getState(phone) {
  const r = await db.query('SELECT state, context FROM wa.conversations WHERE phone = $1', [phone]);
  if (r.rows[0]) return { state: r.rows[0].state, ctx: r.rows[0].context || {} };
  return { state: 'IDLE', ctx: {} };
}

async function setState(phone, state, ctx) {
  await db.query(
    `INSERT INTO wa.conversations (phone, state, context, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (phone) DO UPDATE SET state = $2, context = $3, updated_at = now()`,
    [phone, state, JSON.stringify(ctx || {})]
  );
}

async function clearState(phone) {
  await db.query('DELETE FROM wa.conversations WHERE phone = $1', [phone]);
}

// Phone se already-registered contact dhundo (normalized match).
async function findRegistered(phone) {
  const r = await db.query(
    `SELECT c.display_name,
       EXISTS(SELECT 1 FROM suppliers.supplier_profiles sp WHERE sp.firm_id=$1 AND sp.contact_id=c.id AND sp.is_active) AS is_sup,
       EXISTS(SELECT 1 FROM suppliers.buyer_profiles bp WHERE bp.firm_id=$1 AND bp.contact_id=c.id AND bp.is_active) AS is_buy
     FROM core.contacts c
     WHERE c.firm_id=$1
       AND ( right(regexp_replace(coalesce(c.phone_primary,''),'\\D','','g'),10)=$2
          OR right(regexp_replace(coalesce(c.wa_supplier,''),'\\D','','g'),10)=$2
          OR right(regexp_replace(coalesce(c.wa_buyer,''),'\\D','','g'),10)=$2 )
     LIMIT 1`,
    [FIRM_ID, phone]
  );
  const row = r.rows[0];
  if (row && (row.is_sup || row.is_buy)) return row;
  return null;
}

function num(t) {
  const m = String(t || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

// Category naam(on) ko suppliers.categories me find-or-create karke unke IDs lao.
// Bot text se naam aata hai (jaise "Cotton, Rayon") — app me bhi yahi category dikhe.
async function resolveCategoryIds(names) {
  const ids = [];
  for (const raw of (names || [])) {
    const nm = String(raw || '').trim();
    if (!nm) continue;
    const r = await db.query(
      `INSERT INTO suppliers.categories (id, firm_id, name, created_at)
       VALUES (gen_random_uuid(), $1, $2, now())
       ON CONFLICT (firm_id, name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [FIRM_ID, nm]
    );
    if (r.rows[0]) ids.push(r.rows[0].id);
  }
  return ids;
}

// Ek contact + supplier/buyer profile banao/update karo (Core Master + AD).
async function registerParty(phone, c) {
  const { type, name, gst, city, min, max } = c;
  const gstClean = gst ? gst.trim().toUpperCase() : null;
  const catIds = await resolveCategoryIds(c.categories);
  const catJson = JSON.stringify(catIds);

  // 1) contact — phone se dedup; mile to update, warna naya
  let contactId;
  const ex = await db.query(
    `SELECT id FROM core.contacts
      WHERE firm_id=$1 AND right(regexp_replace(coalesce(phone_primary,''),'\\D','','g'),10)=$2 LIMIT 1`,
    [FIRM_ID, phone]
  );
  const addr = JSON.stringify([{ type: 'billing', line1: '', city: city || '', state: '', pincode: '' }]);
  if (ex.rows[0]) {
    contactId = ex.rows[0].id;
    await db.query(
      `UPDATE core.contacts SET display_name=$2, gst_number=COALESCE($3, gst_number), addresses=$4, updated_at=now() WHERE id=$1`,
      [contactId, name, gstClean, addr]
    );
  } else {
    const ins = await db.query(
      `INSERT INTO core.contacts (id, firm_id, display_name, entity_type, phone_primary, gst_number, addresses, flags, source_module, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'proprietorship', $3, $4, $5, '{}', 'whatsapp_bot', now(), now())
       RETURNING id`,
      [FIRM_ID, name, phone, gstClean, addr]
    );
    contactId = ins.rows[0].id;
  }

  if (type === 'supplier') {
    const has = await db.query('SELECT id FROM suppliers.supplier_profiles WHERE firm_id=$1 AND contact_id=$2', [FIRM_ID, contactId]);
    if (has.rows[0]) {
      await db.query(
        `UPDATE suppliers.supplier_profiles
            SET rate_min=$2, rate_max=$3, is_active=TRUE,
                categories = CASE WHEN $4::jsonb <> '[]'::jsonb THEN $4::jsonb ELSE categories END,
                updated_at=now()
          WHERE id=$1`,
        [has.rows[0].id, min, max, catJson]);
    } else {
      const cnt = await db.query('SELECT COUNT(*)::int AS n FROM suppliers.supplier_profiles WHERE firm_id=$1', [FIRM_ID]);
      const code = 'SUP-' + String((cnt.rows[0].n || 0) + 1).padStart(3, '0');
      await db.query(
        `INSERT INTO suppliers.supplier_profiles (id, firm_id, contact_id, supplier_code, business_type, categories, rate_unit, rate_min, rate_max, is_active, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'trader', $6::jsonb, 'mtr', $4, $5, TRUE, now(), now())`,
        [FIRM_ID, contactId, code, min, max, catJson]
      );
    }
    await db.query('UPDATE core.contacts SET wa_supplier=$1, updated_at=now() WHERE id=$2', [phone, contactId]);
  } else {
    const has = await db.query('SELECT id FROM suppliers.buyer_profiles WHERE firm_id=$1 AND contact_id=$2', [FIRM_ID, contactId]);
    if (has.rows[0]) {
      await db.query(
        `UPDATE suppliers.buyer_profiles
            SET budget_min=$2, budget_max=$3, is_active=TRUE,
                categories = CASE WHEN $4::jsonb <> '[]'::jsonb THEN $4::jsonb ELSE categories END,
                updated_at=now()
          WHERE id=$1`,
        [has.rows[0].id, min, max, catJson]);
    } else {
      const cnt = await db.query('SELECT COUNT(*)::int AS n FROM suppliers.buyer_profiles WHERE firm_id=$1', [FIRM_ID]);
      const code = 'BUY-' + String((cnt.rows[0].n || 0) + 1).padStart(3, '0');
      await db.query(
        `INSERT INTO suppliers.buyer_profiles (id, firm_id, contact_id, buyer_code, categories, budget_min, budget_max, budget_unit, is_active, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $6::jsonb, $4, $5, 'mtr', TRUE, now(), now())`,
        [FIRM_ID, contactId, code, min, max, catJson]
      );
    }
    await db.query('UPDATE core.contacts SET wa_buyer=$1, updated_at=now() WHERE id=$2', [phone, contactId]);
  }
  return contactId;
}

// Onboarding ka ek step. Returns reply text, ya null (onboarding me nahi).
async function handleOnboarding(phone, text) {
  const { state, ctx } = await getState(phone);
  const t = (text || '').trim();
  const low = t.toLowerCase();

  if (['cancel', 'reset', 'restart', 'band'].includes(low)) {
    await clearState(phone);
    return '🔄 Theek hai, cancel. "Hi" bhej kar dobara shuru karein.';
  }

  if (state === 'IDLE') {
    if (!/^(hi|hii|hello|namaste|register|start|join|naya)/i.test(low)) return null;

    // Pehle se registered? to dobara mat poocho.
    const reg = await findRegistered(phone);
    if (reg) {
      const role = reg.is_sup && reg.is_buy ? 'Supplier + Buyer' : reg.is_sup ? 'Supplier' : 'Buyer';
      return `🙏 Aap pehle se registered hain — ${role}: ${reg.display_name}.\n` +
        (reg.is_sup ? '📷 Fabric photo + "Rate 150" bhejein. ' : '') +
        (reg.is_buy ? '🔍 "Cotton 100-150" search karein.' : '');
    }
    await setState(phone, 'ASK_TYPE', {});
    return '🙏 Namokara me swagat! Aap kya hain?\n\n1️⃣ Supplier (maal bechte ho)\n2️⃣ Buyer (maal khareedte ho)\n\nReply: 1 ya 2';
  }

  if (state === 'ASK_TYPE') {
    let type = null;
    if (low === '1' || /supplier|seller/i.test(low)) type = 'supplier';
    else if (low === '2' || /buyer|customer/i.test(low)) type = 'buyer';
    if (!type) return 'Sahi option chunein:\n1️⃣ Supplier\n2️⃣ Buyer';
    ctx.type = type;
    await setState(phone, 'ASK_NAME', ctx);
    return 'Aapki firm / business ka NAAM kya hai?';
  }

  if (state === 'ASK_NAME') {
    if (t.length < 2) return 'Poora firm naam likhein.';
    ctx.name = t;
    await setState(phone, 'ASK_GST', ctx);
    return 'GST number? (nahi hai to "skip" likhein)';
  }

  if (state === 'ASK_GST') {
    ctx.gst = (['skip', 'no', 'nahi', '-'].includes(low)) ? null : t;
    await setState(phone, 'ASK_CITY', ctx);
    return 'Aapka CITY (shehar) kaunsa hai?';
  }

  if (state === 'ASK_CITY') {
    ctx.city = t;
    await setState(phone, 'ASK_CATEGORY', ctx);
    return ctx.type === 'supplier'
      ? 'Aap kaun-kaunsi CATEGORY / maal BECHTE ho? (jaise Cotton, Rayon, Silk — ek ya comma se zyada)'
      : 'Aapko kaun-kaunsi CATEGORY / maal chahiye? (jaise Cotton, Rayon — ek ya comma se zyada)';
  }

  if (state === 'ASK_CATEGORY') {
    const cats = t.split(',').map(s => s.trim()).filter(Boolean);
    if (cats.length === 0) return 'Kam se kam ek category likhein (jaise Cotton).';
    ctx.categories = cats;
    await setState(phone, 'ASK_MIN', ctx);
    return ctx.type === 'supplier'
      ? 'Aap kis rate se maal BECHTE ho? (MINIMUM rate ₹, jaise 80)'
      : 'Aap kis rate tak maal KHAREEDTE ho? (MINIMUM budget ₹, jaise 80)';
  }

  if (state === 'ASK_MIN') {
    const v = num(t);
    if (v == null) return 'Sirf number bhejein, jaise 80';
    ctx.min = v;
    await setState(phone, 'ASK_MAX', ctx);
    return 'Aur MAXIMUM rate/budget? (₹, jaise 800)';
  }

  if (state === 'ASK_MAX') {
    const v = num(t);
    if (v == null) return 'Sirf number bhejein, jaise 800';
    ctx.max = v;
    await registerParty(phone, ctx);
    await clearState(phone);
    const label = ctx.type === 'supplier' ? 'Supplier' : 'Buyer';
    return `✅ Registration ho gaya!\n${label}: ${ctx.name} (${ctx.city})\n` +
      (ctx.categories?.length ? `Category: ${ctx.categories.join(', ')}\n` : '') +
      `Rate range: ₹${ctx.min}–₹${ctx.max}` + (ctx.gst ? `\nGST: ${ctx.gst}` : '') + '\n\n' +
      (ctx.type === 'supplier'
        ? 'Ab fabric ki photo + "Rate 150" bhej sakte hain.'
        : 'Ab "Cotton 100-150" search kar sakte hain. Aapke budget ke maal aapko milenge.');
  }

  return null;
}

async function isOnboarding(phone) {
  const { state } = await getState(phone);
  return state && state !== 'IDLE';
}

module.exports = { handleOnboarding, isOnboarding };
