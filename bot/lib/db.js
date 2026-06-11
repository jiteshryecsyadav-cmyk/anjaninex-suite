// PostgreSQL pool — bot isi DB se baat karta hai jo Suite use karta hai.
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: +(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'namokara_dev',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
  max: 5
});

pool.on('error', (e) => console.error('[db] pool error:', e.message));

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
