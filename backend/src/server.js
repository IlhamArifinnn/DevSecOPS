const crypto = require('node:crypto');
const express = require('express');
const mysql = require('mysql2/promise');
const Redis = require('ioredis');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const env = process.env;
for (const k of ['JWT_SECRET', 'MIDTRANS_SERVER_KEY']) {
  if (!env[k]) throw new Error(`${k} wajib di-set di .env`);
}

const db = mysql.createPool({
  host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME, connectionLimit: 10,
});
const redis = new Redis({ host: env.REDIS_HOST, port: env.REDIS_PORT, password: env.REDIS_PASSWORD || undefined });
const mailer = nodemailer.createTransport({
  host: env.SMTP_HOST, port: Number(env.SMTP_PORT),
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
});
const sendMail = (to, subject, text) => mailer.sendMail({ from: env.MAIL_FROM, to, subject, text });

const SESSION_TTL = 30 * 60; // session timeout 30 menit
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const app = express();
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
  next();
});

// Express 5 meneruskan error async ke error handler; helper ini cukup untuk respon 4xx
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

const audit = (req, action, detail = {}) =>
  db.query('INSERT INTO audit_logs (user_id, action, detail, ip) VALUES (?,?,?,?)',
    [req.user?.id ?? null, action, JSON.stringify(detail), req.ip]);

// Rate limit berbasis counter Redis (mitigasi DoS / brute force)
const rateLimit = (name, max, windowSec, keyFn = (req) => req.ip) => async (req, res, next) => {
  const key = `rl:${name}:${keyFn(req)}`;
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, windowSec);
  if (n > max) return res.status(429).json({ error: 'Terlalu banyak request, coba lagi nanti' });
  next();
};

// Auth: JWT (HS256 dikunci) + session di Redis agar bisa di-revoke
const auth = async (req, res, next) => {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  let payload;
  try { payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }); }
  catch { return res.status(401).json({ error: 'Unauthorized' }); }
  const sess = await redis.get(`sess:${payload.jti}`);
  if (!sess) return res.status(401).json({ error: 'Session habis' });
  await redis.expire(`sess:${payload.jti}`, SESSION_TTL);
  req.user = { ...JSON.parse(sess), jti: payload.jti };
  next();
};
// RBAC: role dibaca dari session server-side, bukan dari input client
const adminOnly = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Forbidden' });

const loginLimit = rateLimit('login', 5, 60); // SR-05: 5 req/menit/IP

// ---------- Auth (FR-1, FR-2, FR-8) ----------
app.post('/api/auth/register', rateLimit('register', 5, 60), async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !EMAIL_RE.test(email || '') || typeof password !== 'string' || password.length < 8)
    fail(400, 'Nama, email valid, dan password min 8 karakter wajib diisi');
  const [[existing]] = await db.query('SELECT id, is_verified FROM users WHERE email=?', [email]);
  if (existing?.is_verified) fail(409, 'Email sudah terdaftar');
  const hash = await bcrypt.hash(password, 12);
  if (existing) await db.query('UPDATE users SET name=?, password_hash=? WHERE id=?', [name, hash, existing.id]);
  else await db.query('INSERT INTO users (name, email, password_hash) VALUES (?,?,?)', [name, email, hash]);

  const otp = String(crypto.randomInt(100000, 1000000));
  await redis.set(`otp:${email}`, otp, 'EX', 300);
  await sendMail(email, 'Kode OTP Toko Online', `Kode verifikasi kamu: ${otp} (berlaku 5 menit)`);
  res.status(201).json({ message: 'OTP dikirim ke email' });
});

app.post('/api/auth/verify', rateLimit('verify', 5, 300, (req) => req.body?.email), async (req, res) => {
  const { email, otp } = req.body || {};
  const stored = await redis.get(`otp:${email}`);
  if (!stored || stored !== String(otp)) fail(400, 'OTP salah atau kadaluarsa');
  await redis.del(`otp:${email}`);
  await db.query('UPDATE users SET is_verified=1 WHERE email=?', [email]);
  res.json({ message: 'Akun terverifikasi' });
});

app.post('/api/auth/login', loginLimit, async (req, res) => {
  const { email, password } = req.body || {};
  const [[user]] = await db.query('SELECT * FROM users WHERE email=?', [email || '']);
  const ok = user && await bcrypt.compare(String(password || ''), user.password_hash);
  if (!ok) {
    await audit(req, 'login_failed', { email });
    fail(401, 'Email atau password salah');
  }
  if (!user.is_verified) fail(403, 'Akun belum diverifikasi');
  const jti = crypto.randomUUID();
  await redis.set(`sess:${jti}`, JSON.stringify({ id: user.id, role: user.role, email: user.email }), 'EX', SESSION_TTL);
  const token = jwt.sign({ sub: user.id }, env.JWT_SECRET, { algorithm: 'HS256', jwtid: jti, expiresIn: '1d' });
  req.user = user;
  await audit(req, 'login', {});
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/auth/logout', auth, async (req, res) => {
  await redis.del(`sess:${req.user.jti}`);
  res.json({ message: 'Logout' });
});

// ---------- Produk (FR-3, FR-9) ----------
app.get('/api/products', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const [rows] = q
    ? await db.query('SELECT * FROM products WHERE name LIKE ? OR description LIKE ? ORDER BY id DESC', [`%${q}%`, `%${q}%`])
    : await db.query('SELECT * FROM products ORDER BY id DESC');
  res.json(rows);
});

const productInput = (b = {}) => {
  const price = Number(b.price), stock = Number(b.stock);
  if (!b.name || !(price >= 0) || !Number.isInteger(stock) || stock < 0) fail(400, 'Data produk tidak valid');
  return [String(b.name).slice(0, 150), String(b.description || ''), price, stock];
};

app.post('/api/admin/products', auth, adminOnly, async (req, res) => {
  const [r] = await db.query('INSERT INTO products (name, description, price, stock) VALUES (?,?,?,?)', productInput(req.body));
  await audit(req, 'product_create', { id: r.insertId });
  res.status(201).json({ id: r.insertId });
});

app.put('/api/admin/products/:id', auth, adminOnly, async (req, res) => {
  const [r] = await db.query('UPDATE products SET name=?, description=?, price=?, stock=? WHERE id=?', [...productInput(req.body), req.params.id]);
  if (!r.affectedRows) fail(404, 'Produk tidak ditemukan');
  await audit(req, 'product_update', { id: req.params.id });
  res.json({ message: 'Updated' });
});

app.delete('/api/admin/products/:id', auth, adminOnly, async (req, res) => {
  try {
    const [r] = await db.query('DELETE FROM products WHERE id=?', [req.params.id]);
    if (!r.affectedRows) fail(404, 'Produk tidak ditemukan');
  } catch (e) {
    if (e.code === 'ER_ROW_IS_REFERENCED_2') fail(409, 'Produk sudah ada di order, set stok 0 saja');
    throw e;
  }
  await audit(req, 'product_delete', { id: req.params.id });
  res.json({ message: 'Deleted' });
});

// ---------- Cart di Redis (FR-4) ----------
const cartKey = (req) => `cart:${req.user.id}`;

app.get('/api/cart', auth, async (req, res) => {
  const cart = await redis.hgetall(cartKey(req));
  const ids = Object.keys(cart);
  if (!ids.length) return res.json([]);
  const [products] = await db.query('SELECT id, name, price, stock FROM products WHERE id IN (?)', [ids]);
  res.json(products.map((p) => ({ ...p, qty: Number(cart[p.id]) })));
});

app.put('/api/cart', auth, async (req, res) => {
  const productId = Number(req.body?.productId), qty = Number(req.body?.qty);
  if (!Number.isInteger(productId) || !Number.isInteger(qty) || qty < 0 || qty > 100) fail(400, 'Input cart tidak valid');
  if (qty === 0) await redis.hdel(cartKey(req), productId);
  else await redis.hset(cartKey(req), productId, qty);
  await redis.expire(cartKey(req), 7 * 24 * 3600);
  res.json({ message: 'Cart updated' });
});

// ---------- Checkout & Payment (FR-5, FR-6, FR-13) ----------
async function createMidtransPayment(order, email) {
  if (env.PAYMENT_MOCK === 'true') return null; // dev tanpa akun Midtrans; status diubah via scripts/simulate-webhook.js
  const r = await fetch(`${env.MIDTRANS_SNAP_URL}/snap/v1/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Accept: 'application/json',
      Authorization: 'Basic ' + Buffer.from(env.MIDTRANS_SERVER_KEY + ':').toString('base64'),
    },
    body: JSON.stringify({
      transaction_details: { order_id: order.code, gross_amount: Math.round(order.total) },
      customer_details: { email },
    }),
  });
  if (!r.ok) throw new Error(`Midtrans error ${r.status}`);
  return (await r.json()).redirect_url;
}

app.post('/api/checkout', auth, rateLimit('checkout', 10, 60, (req) => req.user.id), async (req, res) => {
  const cart = await redis.hgetall(cartKey(req));
  const ids = Object.keys(cart);
  if (!ids.length) fail(400, 'Keranjang kosong');

  const conn = await db.getConnection();
  let order;
  try {
    await conn.beginTransaction();
    // Harga & stok diambil dari DB (bukan dari client) + dikunci agar tidak oversell
    const [products] = await conn.query('SELECT id, name, price, stock FROM products WHERE id IN (?) FOR UPDATE', [ids]);
    if (products.length !== ids.length) fail(400, 'Ada produk yang sudah tidak tersedia');
    let total = 0;
    for (const p of products) {
      const qty = Number(cart[p.id]);
      if (p.stock < qty) fail(400, `Stok ${p.name} tidak cukup`);
      total += Number(p.price) * qty;
    }
    const code = `ORD-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const [r] = await conn.query('INSERT INTO orders (code, user_id, total) VALUES (?,?,?)', [code, req.user.id, total]);
    for (const p of products) {
      const qty = Number(cart[p.id]);
      await conn.query('INSERT INTO order_items (order_id, product_id, qty, price) VALUES (?,?,?,?)', [r.insertId, p.id, qty, p.price]);
      await conn.query('UPDATE products SET stock = stock - ? WHERE id=?', [qty, p.id]);
    }
    await conn.commit();
    order = { id: r.insertId, code, total };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  await redis.del(cartKey(req));
  const paymentUrl = await createMidtransPayment(order, req.user.email);
  await db.query('UPDATE orders SET payment_url=? WHERE id=?', [paymentUrl, order.id]);
  await audit(req, 'checkout', { order: order.code, total: order.total });
  res.status(201).json({ ...order, payment_url: paymentUrl });
});

// Webhook publik Midtrans: WAJIB verifikasi signature (mitigasi Spoofing/Tampering)
const STATUS_MAP = { capture: 'paid', settlement: 'paid', deny: 'failed', cancel: 'failed', failure: 'failed', expire: 'expired' };

app.post('/api/payments/webhook', rateLimit('webhook', 120, 60), async (req, res) => {
  const { order_id, status_code, gross_amount, signature_key, transaction_status, fraud_status } = req.body || {};
  const expected = crypto.createHash('sha512')
    .update(`${order_id}${status_code}${gross_amount}${env.MIDTRANS_SERVER_KEY}`).digest('hex');
  const given = Buffer.from(String(signature_key || ''));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, Buffer.from(expected))) {
    await audit(req, 'webhook_invalid_signature', { order_id });
    fail(401, 'Invalid signature');
  }

  const [[order]] = await db.query('SELECT o.*, u.email FROM orders o JOIN users u ON u.id=o.user_id WHERE o.code=?', [order_id]);
  if (!order) fail(404, 'Order tidak ditemukan');
  if (Number(gross_amount) !== Number(order.total)) fail(400, 'Nominal tidak cocok');

  let status = STATUS_MAP[transaction_status];
  if (transaction_status === 'capture' && fraud_status !== 'accept') status = 'failed';
  // Idempotent: hanya order pending yang boleh berubah status
  const [upd] = status
    ? await db.query("UPDATE orders SET status=? WHERE id=? AND status='pending'", [status, order.id])
    : [{}];
  if (upd.affectedRows) {
    if (status !== 'paid') {
      await db.query('UPDATE products p JOIN order_items i ON i.product_id=p.id SET p.stock=p.stock+i.qty WHERE i.order_id=?', [order.id]);
    }
    await audit(req, 'payment_status', { order: order_id, status });
    sendMail(order.email, `Order ${order_id}: ${status}`,
      status === 'paid' ? `Invoice ${order_id}\nTotal: Rp ${order.total}\nTerima kasih!` : `Status pembayaran: ${status}`)
      .catch((e) => console.error('Email gagal:', e.message));
  }
  res.json({ message: 'OK' });
});

// ---------- Order (FR-7, FR-10, FR-11) ----------
const withItems = async (orders) => {
  if (!orders.length) return orders;
  const [items] = await db.query(
    'SELECT i.order_id, i.qty, i.price, p.name FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id IN (?)',
    [orders.map((o) => o.id)]);
  return orders.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id) }));
};

app.get('/api/orders', auth, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC', [req.user.id]);
  res.json(await withItems(rows));
});

app.get('/api/admin/orders', auth, adminOnly, async (req, res) => {
  const [rows] = await db.query('SELECT o.*, u.email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC');
  res.json(await withItems(rows));
});

app.get('/api/admin/reports', auth, adminOnly, async (req, res) => {
  const [byStatus] = await db.query('SELECT status, COUNT(*) AS count, SUM(total) AS total FROM orders GROUP BY status');
  const [daily] = await db.query(
    `SELECT DATE(created_at) AS day, COUNT(*) AS count, SUM(total) AS revenue
     FROM orders WHERE status='paid' GROUP BY DATE(created_at) ORDER BY day DESC LIMIT 30`);
  res.json({ byStatus, daily });
});

// Error handler: pesan generik, tanpa stack trace ke client (mitigasi Info Disclosure)
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON tidak valid' });
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan server' });
});

app.listen(env.PORT || 3000, () => console.log(`API jalan di http://localhost:${env.PORT || 3000}`));
