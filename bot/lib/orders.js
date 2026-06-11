// Order flow — buyer photo pasand kare -> confirm -> quantity -> supplier accept.
// Sab state wa.conversations me; order wa.orders me save hota hai. Koi AI nahi.
const db = require('./db');
const { getState, setState, clearState } = require('./state');
const { parsePlainNumber } = require('./extractRate');

const FIRM_ID = process.env.FIRM_ID || null;

const ORDER_STATES = ['ORDER_CONFIRM', 'ORDER_QTY', 'ORDER_ACCEPT'];
function isOrderState(state) { return ORDER_STATES.includes(state); }

// Text me track code (NAM-...) dhundo.
function findTrackCode(text) {
  if (!text) return null;
  const m = String(text).match(/NAM-\S+/i);
  return m ? m[0].replace(/[.,;]+$/, '') : null;
}

async function nextOrderCode() {
  const r = await db.query('SELECT COUNT(*)::int AS n FROM wa.orders WHERE firm_id = $1', [FIRM_ID]);
  return 'ORD-' + String((r.rows[0].n || 0) + 1).padStart(6, '0');
}

// Buyer ne code bheja -> order shuru karo (ORDER_CONFIRM).
async function startBuyerOrder({ buyerPhone, trackCode, buyerName }) {
  const inc = await db.query('SELECT * FROM wa.incoming WHERE track_code = $1 LIMIT 1', [trackCode]);
  if (!inc.rows[0]) return { text: `❌ Code "${trackCode}" nahi mila. Photo ke neeche likha code waise hi bhejein.` };
  const row = inc.rows[0];

  await setState(buyerPhone, 'ORDER_CONFIRM', {
    incoming_id: row.id,
    track_code: trackCode,
    supplier_phone: row.from_phone,
    supplier_id: row.supplier_id,
    rate: Number(row.rate) || 0,
    rate_unit: row.rate_unit || 'mtr',
    category_name: row.category_name || null,
    image_path: row.image_path || null,
    buyer_name: buyerName || null
  });

  return {
    text: `📦 ${row.category_name || 'Fabric'} · ₹${row.rate}/${row.rate_unit || 'mtr'}\n` +
          `Code: ${trackCode}\n\nOrder confirm karna hai? (reply: yes / no)`
  };
}

// ORDER_* state me reply handle karo. side-messages "send" se jaate hain.
async function handleOrderReply({ phone, text, state, ctx, send }) {
  const low = String(text || '').trim().toLowerCase();

  if (['cancel', 'reset', 'no', 'nahi', 'na'].includes(low) && state !== 'ORDER_QTY') {
    await clearState(phone);
    // Supplier ne reject kiya to buyer ko batao.
    if (state === 'ORDER_ACCEPT' && ctx.order_id) {
      await db.query(`UPDATE wa.orders SET status = 'rejected', updated_at = now() WHERE id = $1`, [ctx.order_id]);
      if (send && ctx.buyer_phone) {
        await send(ctx.buyer_phone, { text: `😔 Maaf kijiye, supplier ne aapka order (${ctx.order_code || ''}) abhi mana kar diya.` });
      }
      return { text: 'Theek hai, order reject kar diya. Buyer ko bata diya.' };
    }
    return { text: 'Theek hai, cancel kar diya.' };
  }

  if (state === 'ORDER_CONFIRM') {
    if (['yes', 'haan', 'ha', 'ok', 'okay', 'confirm', 'y'].includes(low)) {
      await setState(phone, 'ORDER_QTY', ctx);
      return { text: 'Kitni quantity chahiye? (sirf number bhejein, jaise 500)' };
    }
    return { text: 'Reply karein: yes (order karna hai) ya no (cancel).' };
  }

  if (state === 'ORDER_QTY') {
    const qty = parsePlainNumber(text);
    if (!qty || qty <= 0) return { text: 'Sirf number bhejein, jaise 500' };

    const rate = Number(ctx.rate) || 0;
    const amount = rate * qty;
    const code = await nextOrderCode();

    // Buyer/supplier naam
    const bn = ctx.buyer_name || null;
    let supplierName = null;
    if (ctx.supplier_id) {
      const s = await db.query(
        `SELECT c.display_name FROM suppliers.supplier_profiles sp
           JOIN core.contacts c ON c.id = sp.contact_id WHERE sp.id = $1`, [ctx.supplier_id]);
      supplierName = s.rows[0] ? s.rows[0].display_name : null;
    }

    const ins = await db.query(
      `INSERT INTO wa.orders
        (firm_id, order_code, incoming_id, track_code, buyer_phone, buyer_name,
         supplier_phone, supplier_id, supplier_name, category_name,
         rate, rate_unit, quantity, amount, image_path, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'pending_supplier')
       RETURNING id`,
      [FIRM_ID, code, ctx.incoming_id, ctx.track_code, phone, bn,
       ctx.supplier_phone, ctx.supplier_id, supplierName, ctx.category_name,
       rate, ctx.rate_unit, qty, amount, ctx.image_path]
    );
    const orderId = ins.rows[0].id;

    // Buyer ki conversation khatam (wait).
    await clearState(phone);

    // Supplier ko order bhejo + accept ka state.
    if (ctx.supplier_phone) {
      await setState(ctx.supplier_phone, 'ORDER_ACCEPT', {
        order_id: orderId, order_code: code, buyer_phone: phone,
        buyer_name: bn, quantity: qty, rate, rate_unit: ctx.rate_unit,
        category_name: ctx.category_name, amount
      });
      if (send) {
        await send(ctx.supplier_phone, {
          text: `🛒 *Naya Order!* (${code})\n` +
                `${ctx.category_name || 'Fabric'} · ₹${rate}/${ctx.rate_unit || 'mtr'}\n` +
                `Quantity: ${qty} ${ctx.rate_unit || 'mtr'}\n` +
                `Total: ₹${amount}\n\n` +
                `Is order ko accept karte ho? (reply: yes / no)`
        });
      }
    }

    return {
      text: `✅ Aapka order (${code}) bhej diya.\n` +
            `${ctx.category_name || 'Fabric'} — ${qty} ${ctx.rate_unit || 'mtr'} @ ₹${rate} = ₹${amount}\n\n` +
            `Supplier ke confirmation ka wait karein. ⏳`
    };
  }

  if (state === 'ORDER_ACCEPT') {
    if (['yes', 'haan', 'ha', 'ok', 'okay', 'accept', 'y'].includes(low)) {
      await db.query(`UPDATE wa.orders SET status = 'accepted', updated_at = now() WHERE id = $1`, [ctx.order_id]);
      await clearState(phone);
      if (send && ctx.buyer_phone) {
        await send(ctx.buyer_phone, {
          text: `🎉 Mubarak! Supplier ne aapka order *${ctx.order_code}* ACCEPT kar liya.\n` +
                `${ctx.category_name || 'Fabric'} — ${ctx.quantity} ${ctx.rate_unit || 'mtr'} @ ₹${ctx.rate} = ₹${ctx.amount}\n\n` +
                `Hamari team aapse aage ki baat ke liye sampark karegi.`
        });
      }
      return { text: `✅ Order ${ctx.order_code} accept ho gaya. Buyer ko bata diya.` };
    }
    return { text: 'Reply karein: yes (order accept) ya no (reject).' };
  }

  return null;
}

module.exports = { isOrderState, handleOrderReply, startBuyerOrder, findTrackCode };
