// Incoming WhatsApp message handle karna — PURE LOGIC, koi AI nahi.
// Flow: onboarding -> order conversation -> supplier rate-ask -> photo/text.
const crypto = require('crypto');
const fs = require('fs');
const db = require('./db');
const { normalizePhone } = require('./phone');
const { extractRate, parsePlainNumber } = require('./extractRate');
const { findSupplierByPhone, findBuyerByPhone, searchPhotos, findBuyersForRate, resolveSender } = require('./match');
const { hasWatermark } = require('./watermark');
const { handleOnboarding } = require('./onboarding');
const { getState, setState, clearState } = require('./state');
const { isOrderState, handleOrderReply, startBuyerOrder, findTrackCode } = require('./orders');

const FIRM_ID = process.env.FIRM_ID || null;
const LOOKBACK = +(process.env.BUYER_SEARCH_LOOKBACK_DAYS || 30);
const BROADCAST_DELAY = +(process.env.BROADCAST_DELAY_MS || 1200);
const MAX_BROADCAST = +(process.env.MAX_BROADCAST || 50);   // ek baar me itne buyers ko (demo me 100 fake na bheje)

// Photo finalize: code do, watermark karo, save karo, matching buyers ko bhejo.
async function finalize({ incId, supplier, supplierPhone, imageBuffer, rate, unit, categoryId, categoryName, saveImage, watermark, send }) {
  const code = 'NAM-S' + String(incId).replace(/-/g, '').slice(0, 6).toUpperCase() + '-R' + rate;

  let finalBuffer = imageBuffer;
  if (watermark) {
    try {
      finalBuffer = await watermark(imageBuffer, {
        name: supplier && supplier.display_name, phone: supplierPhone, rate, unit
      });
    } catch (e) { /* original rakho */ }
  }

  const hash = crypto.createHash('sha256').update(imageBuffer).digest('hex').slice(0, 16);
  const imagePath = saveImage ? await saveImage(finalBuffer, hash) : null;

  await db.query(
    `UPDATE wa.incoming
        SET rate = $1, rate_unit = $2, category_id = $3, category_name = $4,
            track_code = $5, image_path = $6, status = 'processed', model_used = 'regex'
      WHERE id = $7`,
    [rate, unit, categoryId, categoryName, code, imagePath, incId]
  );

  // Matching buyers nikaalo (supplier ko reply pehle, broadcast background me).
  const buyers = await findBuyersForRate(rate, categoryId, FIRM_ID);
  const targets = buyers
    .filter(b => b.phone_primary && b.phone_primary !== supplierPhone)
    .slice(0, MAX_BROADCAST);

  // FIRE-AND-FORGET broadcast — supplier ka reply isse rukta nahi.
  (async () => {
    for (const b of targets) {
      try {
        await send(b.phone_primary, {
          image: finalBuffer,
          caption: `🆕 Naya stock!\n${categoryName || 'Fabric'} · ₹${rate}/${unit}\n\nOrder ke liye reply karein:\nORDER ${code}`
        });
        await db.query(
          'INSERT INTO wa.forwards (incoming_id, to_phone, buyer_id, track_code) VALUES ($1,$2,$3,$4)',
          [incId, b.phone_primary, b.id, code]
        );
        await new Promise(r => setTimeout(r, BROADCAST_DELAY));  // ban se bachne ke liye delay
      } catch (e) {
        console.error('[broadcast] fail', b.phone_primary, e.message);
      }
    }
    console.log(`[broadcast] ${targets.length} buyers ko bhej diya — ${code}`);
  })();

  return { code, sent: targets.length, image: finalBuffer };
}

// handleMessage returns { text } / { } / null. side-messages "send" se jaate hain.
async function handleMessage({ fromPhone, text, imageBuffer, saveImage, watermark, send }) {
  const phone = normalizePhone(fromPhone);
  if (!phone) return null;

  // 0) Onboarding (hi/register + ASK_TYPE/NAME/CITY) — pehle.
  const onb = await handleOnboarding(phone, text || '');
  if (onb) return { text: onb };

  const { state, ctx } = await getState(phone);

  // 1) Order conversation chal rahi hai? (ORDER_CONFIRM/QTY/ACCEPT)
  if (isOrderState(state)) {
    return await handleOrderReply({ phone, text, state, ctx, send });
  }

  // 2) Supplier ne photo bina rate ke bheji thi -> ab rate aaya.
  if (state === 'ASK_RATE') {
    const rate = parsePlainNumber(text);
    if (!rate || rate <= 0) return { text: 'Sirf number bhejein, jaise 699' };
    const incQ = await db.query('SELECT * FROM wa.incoming WHERE id = $1', [ctx.incoming_id]);
    const row = incQ.rows[0];
    if (!row) { await clearState(phone); return { text: 'Photo expire ho gayi, dobara bhejein.' }; }
    let buf = null;
    try { buf = fs.readFileSync(row.image_path); } catch (e) { /* */ }
    if (!buf) { await clearState(phone); return { text: 'Photo nahi mili, dobara bhejein.' }; }
    const supplier = await findSupplierByPhone(phone, FIRM_ID);
    const res = await finalize({
      incId: row.id, supplier, supplierPhone: phone, imageBuffer: buf,
      rate, unit: row.rate_unit || 'mtr', categoryId: row.category_id,
      categoryName: row.category_name, saveImage, watermark, send
    });
    await clearState(phone);
    return { text: `✅ Rate ₹${rate} set ho gaya!\nCode: ${res.code}\n${res.sent} matching buyer(s) ko photo bhej di.` };
  }

  // Sender kaun hai? Both firm: 2 alag number -> saaf; 1 hi number -> ambiguous.
  const { role, supplier, buyer } = await resolveSender(phone, FIRM_ID);

  // Ambiguous (1 number, Both firm) -> photo me watermark = buyer, warna supplier.
  let actAsSupplier = role === 'supplier';
  let actAsBuyer = role === 'buyer';
  if (role === 'ambiguous') {
    if (imageBuffer) {
      const wm = await hasWatermark(imageBuffer);
      if (wm) actAsBuyer = true; else actAsSupplier = true;
    } else {
      const t2 = (text || '').trim();
      const buyerish = findTrackCode(t2) || /\d+\s*-\s*\d+/.test(t2) ||
        /(cotton|silk|saree|kurti|viscose|rayon|print|fabric|lehenga|dupatta|net|chiffon|jacquard|linen|georgette)/i.test(t2);
      if (buyerish) actAsBuyer = true; else actAsSupplier = true;
    }
  }

  // 3) Photo aayi.
  if (imageBuffer) {
    if (actAsSupplier && supplier) {
      const hash = crypto.createHash('sha256').update(imageBuffer).digest('hex').slice(0, 16);
      const ext = await extractRate(text || '', FIRM_ID);
      const ins = await db.query(
        `INSERT INTO wa.incoming
           (firm_id, from_phone, supplier_id, image_hash, caption, rate, rate_unit,
            category_id, category_name, status, model_used)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'regex') RETURNING id`,
        [FIRM_ID, phone, supplier.id, hash, text || null, ext.rate, ext.unit,
         ext.categoryId, ext.categoryName, ext.rate > 0 ? 'processing' : 'awaiting_rate']
      );
      const incId = ins.rows[0].id;

      if (ext.rate > 0) {
        const res = await finalize({
          incId, supplier, supplierPhone: phone, imageBuffer,
          rate: ext.rate, unit: ext.unit, categoryId: ext.categoryId,
          categoryName: ext.categoryName, saveImage, watermark, send
        });
        return {
          text: `✅ Photo save ho gayi!\nRate: ₹${ext.rate}/${ext.unit}` +
                `${ext.categoryName ? ' · ' + ext.categoryName : ''}\nCode: ${res.code}\n` +
                `${res.sent} matching buyer(s) ko bhej di.`
        };
      }
      // Rate nahi mila -> raw image disk pe rakho, rate puchho.
      const imagePath = saveImage ? await saveImage(imageBuffer, hash) : null;
      await db.query('UPDATE wa.incoming SET image_path = $1 WHERE id = $2', [imagePath, incId]);
      await setState(phone, 'ASK_RATE', { incoming_id: incId });
      return { text: '📷 Photo mil gayi! Is fabric ka *rate* kya hai?\n(sirf number bhejein, jaise 699)' };
    }
    if (actAsBuyer && buyer) {
      return { text: '📷 Photo mili. Order ke liye photo ke neeche likha code *ORDER NAM-...* bhejein.' };
    }
    return { text: '📷 Photo mili, par aap registered nahi hain.\n"Hi" bhej kar register karein (1 = Supplier).' };
  }

  // 4) Text message.
  if (text && text.trim()) {
    const t = text.trim();

    // Track code -> order shuru (buyer).
    const code = findTrackCode(t);
    if (code) {
      if (!buyer) return { text: 'Order ke liye BUYER registered hona zaroori hai. "Hi" bhej kar register karein.' };
      return await startBuyerOrder({ buyerPhone: phone, trackCode: code, buyerName: buyer.display_name });
    }

    // Buyer search.
    if (actAsBuyer && buyer) {
      const looksLikeSearch = /\d+\s*-\s*\d+/.test(t) ||
        /(cotton|silk|saree|kurti|viscose|rayon|print|fabric|lehenga|dupatta|net|chiffon|jacquard|linen|georgette)/i.test(t);
      if (looksLikeSearch) {
        const results = await searchPhotos(t, FIRM_ID, LOOKBACK);
        if (!results.length) return { text: `"${t}" ke liye abhi koi stock nahi mila. Baad me try karein.` };
        let msg = `🔍 ${results.length} options "${t}":\n\n`;
        results.forEach((r, i) => {
          msg += `${i + 1}. ${r.category_name || r.caption || 'Fabric'} — ₹${r.rate}/${r.rate_unit} (ORDER ${r.track_code})\n`;
        });
        msg += `\nKisi item ka "ORDER <code>" bhej kar order karein.`;
        return { text: msg };
      }
    }

    // Help.
    if (actAsSupplier && supplier) return { text: 'Fabric ki photo bhejein. Caption me "Rate 699" likh dein, ya na likhein to main puch lunga.' };
    if (actAsBuyer && buyer) return { text: 'Search karein (jaise "Cotton 100-150") ya kisi photo ka "ORDER <code>" bhejein.' };
    if (supplier || buyer) return { text: 'Bechna ho to fabric photo bhejein. Khareedna ho to search karein (jaise "Cotton 100-150").' };
    return { text: '🙏 Namaste! Namokara bot me register karne ke liye "Hi" bhejein.' };
  }

  return null;
}

module.exports = { handleMessage };
