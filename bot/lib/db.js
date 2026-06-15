// PostgreSQL pool — bot isi DB se baat karta hai jo Suite use karta hai.
const { Pool } = require('pg');

const FIRM_ID = process.env.FIRM_ID || null;

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: +(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'namokara_dev',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
  max: 5
});

// RLS: production me bot 'namokara_app' (NOBYPASSRLS) se connect karta hai. Har naye
// connection par firm-context set karo, warna RLS tenant data (suppliers/buyers/contacts)
// padhne hi nahi deta (current_firm_id() NULL -> sab rows hidden). Bot single-firm hai
// (FIRM_ID env), isliye yahi context har query par lagega.
pool.on('connect', (client) => {
  if (FIRM_ID) {
    client.query("SELECT set_config('app.current_firm_id', $1, false)", [FIRM_ID])
      .catch((e) => console.error('[db] set firm context failed:', e.message));
  }
});

pool.on('error', (e) => console.error('[db] pool error:', e.message));

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
