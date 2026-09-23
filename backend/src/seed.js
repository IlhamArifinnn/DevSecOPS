// Buat tabel, akun admin, dan produk contoh. Aman dijalankan berulang.
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const env = process.env;

(async () => {
  const conn = await mysql.createConnection({
    host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD, multipleStatements: true,
  });
  await conn.query(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));

  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 8)
    throw new Error('ADMIN_EMAIL & ADMIN_PASSWORD (min 8 karakter) wajib di .env');
  const hash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
  await conn.query(
    `INSERT INTO users (name, email, password_hash, role, is_verified) VALUES ('Admin', ?, ?, 'admin', 1)
     ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), role='admin', is_verified=1`,
    [env.ADMIN_EMAIL, hash]);

  const [[{ n }]] = await conn.query('SELECT COUNT(*) n FROM products');
  if (!n) {
    await conn.query('INSERT INTO products (name, description, price, stock) VALUES ?', [[
      ['Kaos Polos Hitam', 'Kaos katun combed 30s', 75000, 50],
      ['Kemeja Flanel', 'Kemeja flanel kotak-kotak', 150000, 20],
      ['Celana Chino', 'Celana chino slim fit', 200000, 15],
      ['Topi Baseball', 'Topi baseball adjustable', 50000, 40],
    ]]);
  }
  console.log(`Seed selesai. Admin: ${env.ADMIN_EMAIL}`);
  await conn.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
