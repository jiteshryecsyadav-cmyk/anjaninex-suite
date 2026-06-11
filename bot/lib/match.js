// Phone se supplier/buyer dhundhna (core.contacts + profiles).
const db = require('./db');

// Supplier match — pehle wa_phone se (Both firm ka supplier number), warna phone_primary.
async function findSupplierByPhone(phone, firmId) {
  const { rows } = await db.query(
    `SELECT sp.id, c.display_name
       FROM suppliers.supplier_profiles sp
       JOIN core.contacts c ON c.id = sp.contact_id
      WHERE sp.firm_id = $1 AND sp.is_active = TRUE
        AND (right(regexp_replace(coalesce(c.wa_supplier,''), '\\D', '', 'g'), 10) = $2
             OR right(regexp_replace(coalesce(c.phone_primary,''), '\\D', '', 'g'), 10) = $2)
      LIMIT 1`,
    [firmId, phone]
  );
  return rows[0] || null;
}

async function findBuyerByPhone(phone, firmId) {
  const { rows } = await db.query(
    `SELECT bp.id, c.display_name, bp.categories, bp.budget_min, bp.budget_max
       FROM suppliers.buyer_profiles bp
       JOIN core.contacts c ON c.id = bp.contact_id
      WHERE bp.firm_id = $1 AND bp.is_active = TRUE
        AND (right(regexp_replace(coalesce(c.wa_buyer,''), '\\D', '', 'g'), 10) = $2
             OR right(regexp_replace(coalesce(c.phone_primary,''), '\\D', '', 'g'), 10) = $2)
      LIMIT 1`,
    [firmId, phone]
  );
  return rows[0] || null;
}

// Sender ka role pakka karo. wa_phone (Both firm ke 2 number) se pehle saaf pehchaan;
// agar dono se match kare (1 hi number) to 'ambiguous' -> caller watermark/action use kare.
async function resolveSender(phone, firmId) {
  // 1) wa_phone se exact match (Both firm ke alag number)
  const supWa = await db.query(
    `SELECT sp.id, c.display_name FROM suppliers.supplier_profiles sp
       JOIN core.contacts c ON c.id = sp.contact_id
      WHERE sp.firm_id = $1 AND sp.is_active = TRUE
        AND c.wa_supplier IS NOT NULL AND c.wa_supplier <> ''
        AND right(regexp_replace(c.wa_supplier, '\\D', '', 'g'), 10) = $2 LIMIT 1`, [firmId, phone]);
  const buyWa = await db.query(
    `SELECT bp.id, c.display_name, bp.categories, bp.budget_min, bp.budget_max FROM suppliers.buyer_profiles bp
       JOIN core.contacts c ON c.id = bp.contact_id
      WHERE bp.firm_id = $1 AND bp.is_active = TRUE
        AND c.wa_buyer IS NOT NULL AND c.wa_buyer <> ''
        AND right(regexp_replace(c.wa_buyer, '\\D', '', 'g'), 10) = $2 LIMIT 1`, [firmId, phone]);

  if (supWa.rows[0] && !buyWa.rows[0]) return { role: 'supplier', supplier: supWa.rows[0], buyer: null };
  if (buyWa.rows[0] && !supWa.rows[0]) return { role: 'buyer', supplier: null, buyer: buyWa.rows[0] };

  // 2) phone_primary se (jisne wa_phone alag nahi diya)
  const supplier = await findSupplierByPhone(phone, firmId);
  const buyer = await findBuyerByPhone(phone, firmId);

  if (supplier && buyer) return { role: 'ambiguous', supplier, buyer };  // 1 number, Both firm
  if (supplier) return { role: 'supplier', supplier, buyer: null };
  if (buyer) return { role: 'buyer', supplier: null, buyer };
  return { role: 'none', supplier: null, buyer: null };
}

// Buyer text search — recent supplier photos matching keyword/rate.
async function searchPhotos(query, firmId, lookbackDays) {
  const m = query.replace(/,/g, '').match(/(\d+)\s*-\s*(\d+)/);
  let rateMin = null, rateMax = null;
  if (m) { rateMin = +m[1]; rateMax = +m[2]; }

  const params = [firmId];
  let where = `firm_id = $1 AND status = 'processed' AND created_at > now() - ($2 || ' days')::interval`;
  params.push(String(lookbackDays || 30));

  if (rateMin != null) {
    params.push(rateMin, rateMax);
    where += ` AND rate BETWEEN $${params.length - 1} AND $${params.length}`;
  } else {
    params.push(`%${query.trim()}%`);
    where += ` AND (caption ILIKE $${params.length} OR category_name ILIKE $${params.length})`;
  }

  const { rows } = await db.query(
    `SELECT id, caption, rate, rate_unit, category_name, track_code, image_path
       FROM wa.incoming WHERE ${where}
      ORDER BY created_at DESC LIMIT 10`,
    params
  );
  return rows;
}

// Supplier ki photo ke liye matching buyers — rate budget me ho + category match.
// budget_min/max NULL ho to "koi limit nahi". categories [] ho to "sab me interest".
async function findBuyersForRate(rate, categoryId, firmId) {
  const { rows } = await db.query(
    `SELECT bp.id, bp.categories, bp.budget_min, bp.budget_max,
            COALESCE(bp.wa_phone, c.phone_primary) AS phone_primary, c.display_name
       FROM suppliers.buyer_profiles bp
       JOIN core.contacts c ON c.id = bp.contact_id
      WHERE bp.firm_id = $1 AND bp.is_active = TRUE
        AND COALESCE(bp.wa_phone, c.phone_primary) IS NOT NULL
        AND (bp.budget_min IS NULL OR bp.budget_min <= $2)
        AND (bp.budget_max IS NULL OR bp.budget_max >= $2)`,
    [firmId, rate]
  );
  return rows.filter(b => {
    if (!categoryId) return true;                       // supplier ne category nahi di -> sab ko
    const cats = Array.isArray(b.categories) ? b.categories : [];
    if (cats.length === 0) return true;                 // buyer ko sab me interest
    return cats.map(String).includes(String(categoryId));
  });
}

module.exports = { findSupplierByPhone, findBuyerByPhone, searchPhotos, findBuyersForRate, resolveSender };
