// Chat state machine helpers (wa.conversations) — onboarding + order flow share karte hain.
const db = require('./db');

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

module.exports = { getState, setState, clearState };
