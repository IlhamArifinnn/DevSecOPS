# PRD: Sistem Toko Online (E-Commerce)
## Studi Kasus untuk Praktikum Threat Modeling — DevSecOps Pertemuan 2

> **Catatan penting:** Dokumen ini BUKAN deliverable yang dinilai di rubrik praktikum. Fungsinya hanya sebagai spesifikasi pendukung supaya DFD, STRIDE, dan Security Requirements yang kamu buat di OWASP Threat Dragon konkret dan bukan asal tebak. Alokasikan maksimal ~10-15 menit untuk baca ini, sisanya fokus ke tool.

---

## 1. Ringkasan

Startup mengembangkan **aplikasi manajemen toko online** dengan tiga aktor utama: Customer (daftar, login, pesan, bayar), Admin (kelola produk), dan Payment Gateway pihak ketiga (Midtrans/Xendit). Sistem dibangun dengan React Frontend, Node.js REST API, MySQL sebagai database utama, Redis sebagai cache/session store, dan Email Service untuk notifikasi.

**Tujuan PRD:** memberi cukup detail arsitektur dan alur data agar tim bisa membangun DFD yang akurat dan mengidentifikasi ancaman keamanan yang realistis — bukan generik.

---

## 2. Actors / External Entities

| Actor | Jenis | Keterangan |
|---|---|---|
| Customer | External Entity | Unauthenticated (browsing) & authenticated (transaksi) |
| Admin | External Entity | Privilege lebih tinggi dari Customer |
| Payment Gateway (Midtrans/Xendit) | External Entity (3rd party) | Kirim & terima callback pembayaran |
| Email Provider (SMTP/3rd party) | External Entity (3rd party) | Kirim OTP, invoice, notifikasi |

---

## 3. Arsitektur Komponen (Process & Data Store)

| Komponen | Tipe DFD | Fungsi |
|---|---|---|
| React Frontend | — (bukan trust node, tapi UI di sisi Customer/Admin) | Antarmuka web |
| Node.js REST API | Process | Business logic: Auth, Product, Order, Payment Handler |
| MySQL DB | Data Store | Data user, produk, order, transaksi |
| Redis | Data Store | Session token, cart sementara, rate-limit counter |
| Email Service | Process/External | Kirim notifikasi async |

---

## 4. Functional Requirements (Sumber Data Flow)

### 4.1 Customer
- **FR-1** Registrasi akun + verifikasi email (OTP)
- **FR-2** Login (email/password) → session disimpan di Redis, token dikirim ke frontend
- **FR-3** Browse & search produk
- **FR-4** Kelola keranjang (cart) — disimpan sementara di Redis
- **FR-5** Checkout → redirect/request ke Payment Gateway
- **FR-6** Terima callback/webhook dari Payment Gateway → update status order
- **FR-7** Lihat riwayat & status order

### 4.2 Admin
- **FR-8** Login admin (harus terpisah privilege dari customer)
- **FR-9** CRUD produk
- **FR-10** Kelola & lihat semua order
- **FR-11** Lihat laporan transaksi

### 4.3 Sistem/Integrasi
- **FR-12** Kirim email otomatis (OTP, invoice, notifikasi status)
- **FR-13** Terima & verifikasi webhook payment gateway

---

## 5. Data Flow Kandidat untuk DFD

Minimal 8 aliran diperlukan di praktikum — berikut 11 kandidat, sudah lebih dari cukup:

| No | Sumber | Tujuan | Data | Protokol | Trust Boundary |
|---|---|---|---|---|---|
| 1 | Customer Browser | Node.js API | Login request (email, password) | HTTPS | Internet → DMZ |
| 2 | Node.js API | MySQL | Query credential user | Internal | DMZ → Internal |
| 3 | Node.js API | Redis | Simpan session token | Internal | DMZ → Internal |
| 4 | Customer Browser | Node.js API | Update cart | HTTPS | Internet → DMZ |
| 5 | Node.js API | Redis | Cart temporary storage | Internal | DMZ → Internal |
| 6 | Node.js API | Payment Gateway | Create payment request | HTTPS | DMZ → Internet |
| 7 | Payment Gateway | Node.js API | Webhook callback status bayar | HTTPS | Internet → DMZ |
| 8 | Node.js API | MySQL | Update status order | Internal | DMZ → Internal |
| 9 | Node.js API | Email Service | Kirim invoice/OTP | SMTP/HTTPS | DMZ → Internet |
| 10 | Admin Browser | Node.js API | CRUD produk | HTTPS | Internet → DMZ |
| 11 | Node.js API | MySQL | Write data produk | Internal | DMZ → Internal |

---

## 6. Trust Boundaries

- **TB-1: Internet ↔ DMZ** — semua traffic dari Customer/Admin browser dan Payment Gateway
- **TB-2: DMZ ↔ Internal Network** — Node.js API ke MySQL & Redis
- *(opsional) TB-3: Internal ↔ Third-party services* jika mau lebih granular memisahkan Payment Gateway dan Email Service

---

## 7. Asumsi & Constraint Eksplisit

Bagian ini paling penting — tulis asumsi ini di laporan kamu, karena inilah sumber ancaman konkret, bukan generik:

- **Autentikasi:** diasumsikan JWT + refresh token, session state disimpan di Redis
- **Tidak ada MFA** di versi awal → celah nyata kategori *Spoofing*
- **Webhook payment** diasumsikan endpoint publik (harus reachable dari internet oleh gateway) → kandidat kuat *Tampering* & *Spoofing* jika signature tidak divalidasi
- **Redis diasumsikan tanpa AUTH password** by default (konfigurasi umum yang lalai) → kandidat *Information Disclosure*
- **Admin panel** memakai API yang sama dengan customer, hanya beda endpoint/role → kandidat *Elevation of Privilege* jika role check lemah
- **Rate limiting** belum diterapkan di endpoint login/checkout → kandidat *Denial of Service*

---

## 8. Out of Scope

- Keamanan internal Payment Gateway (tanggung jawab Midtrans/Xendit)
- Aplikasi mobile (skenario hanya menyebut web)
- Keamanan pipeline CI/CD (materi pertemuan lain)

---

## 9. Pemetaan Langsung ke Deliverable Praktikum

| Deliverable Praktikum | Sumber di PRD ini |
|---|---|
| DFD (min 6 komponen, 8 aliran, 2 trust boundary) | Section 3 (komponen) + Section 5 (aliran data) + Section 6 (trust boundary) |
| Identifikasi STRIDE (min 8) | Setiap baris Section 5 punya 1-2 kategori STRIDE relevan; Section 7 menandai titik paling rawan (webhook, Redis, admin auth) |
| Security Requirements (min 5) | Turunkan langsung dari Section 7: MFA admin, webhook signature validation, Redis AUTH, RBAC endpoint admin, rate limiting login |

---

## 10. Catatan Jujur

Kalau niat kamu sebenarnya membangun aplikasi toko online beneran (bukan sekadar bahan threat modeling), PRD ini masih terlalu tipis — belum ada non-functional requirement (performance, scalability, SLA), data model detail, atau spesifikasi UI. Untuk kebutuhan praktikum DevSecOps ini, PRD di atas sudah cukup — jangan over-engineer dan buang waktu di luar yang dinilai.
