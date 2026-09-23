# Toko Online (E-Commerce) — DevSecOps Pertemuan 2

Implementasi dari `docs/PRD_Toko_Online_Threat_Modeling.md`: React Frontend → Node.js REST API → MySQL (`db_ecommerce`) + Redis + Email + Payment Gateway (Midtrans).

```
backend/   Express API (src/server.js), schema.sql, seed, simulasi webhook
frontend/  React (Vite), proxy /api → localhost:3000
docs/      PRD & materi praktikum
```

## Menjalankan (Laragon)

Pastikan MySQL Laragon jalan. Lalu 4 terminal:

```bash
# 1. Redis dengan password (dari .env)
cd backend && npm run redis
# 2. Mailpit (SMTP :1025, inbox http://localhost:8025)
C:/laragon/bin/mailpit/1.22.3/mailpit.exe
# 3. API
cd backend && npm install && cp .env.example .env   # isi .env
npm run seed        # buat tabel db_ecommerce + admin + produk contoh
npm run dev         # http://localhost:3000
# 4. Frontend
cd frontend && npm install && npm run dev   # http://localhost:5173
```

Admin default: `ADMIN_EMAIL` / `ADMIN_PASSWORD` di `backend/.env`.

**Pembayaran:** `PAYMENT_MOCK=true` tidak memanggil Midtrans. Setelah checkout, simulasikan notifikasi:
`npm run webhook -- <ORDER_CODE> <total> [settlement|expire|deny]`.
Untuk Midtrans sandbox asli: isi `MIDTRANS_SERVER_KEY`, set `PAYMENT_MOCK=false`, dan arahkan Notification URL ke `https://<publik>/api/payments/webhook` (mis. via ngrok Laragon).

## Pemetaan Functional Requirement

| FR | Endpoint |
|---|---|
| FR-1 Registrasi + OTP | `POST /api/auth/register`, `POST /api/auth/verify` |
| FR-2 / FR-8 Login (session di Redis) | `POST /api/auth/login`, `POST /api/auth/logout` |
| FR-3 Browse & search | `GET /api/products?q=` |
| FR-4 Cart (Redis) | `GET/PUT /api/cart` |
| FR-5 Checkout → Payment Gateway | `POST /api/checkout` |
| FR-6 / FR-13 Webhook | `POST /api/payments/webhook` |
| FR-7 Riwayat order | `GET /api/orders` |
| FR-9 CRUD produk | `POST/PUT/DELETE /api/admin/products` |
| FR-10 Semua order | `GET /api/admin/orders` |
| FR-11 Laporan | `GET /api/admin/reports` |
| FR-12 Email (OTP, invoice) | nodemailer → SMTP |

## Mitigasi dari PRD Section 7 yang sudah diterapkan

| Ancaman (STRIDE) | Mitigasi di kode |
|---|---|
| Webhook palsu (S/T) | Verifikasi `signature_key` SHA-512 (timing-safe) + cek nominal + update idempoten |
| Redis tanpa AUTH (I) | Redis dijalankan dengan `--requirepass`, bind 127.0.0.1 |
| Admin via API sama (E) | RBAC `adminOnly`, role dibaca dari session server-side |
| Tanpa rate limit (D) | Login 5/menit/IP, checkout 10/menit/user, OTP 5/5 menit (counter Redis) |
| JWT forgery / alg confusion (S/E) | `algorithms: ['HS256']` dikunci, session jti di Redis (bisa di-revoke), timeout 30 menit |
| SQL Injection (T) | Semua query parameterized (`mysql2`) |
| Manipulasi harga (T) | Harga & stok diambil dari DB dengan `SELECT ... FOR UPDATE` saat checkout |
| Password bocor (I) | bcrypt cost 12 |
| Repudiation (R) | Tabel `audit_logs`: login, login gagal, CRUD produk, checkout, status bayar, webhook invalid |
| Verbose error (I) | Error handler generik, tanpa stack trace |

Belum ada (sesuai PRD "versi awal"): **MFA admin**, refresh token, HTTPS/TLS (pakai reverse proxy saat deploy).
