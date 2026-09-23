# Mata Kuliah DevSecOps
## Pertemuan 2: Shift-Left Security dalam SDLC

**Dosen:** April Rustianto, S.Komp., M.T., CCIE
**Institusi:** Sekolah Tinggi Teknologi Terpadu Nurul Fikri (STT-NF)

---

## Capaian Pembelajaran

Setelah perkuliahan ini, mahasiswa mampu:
- Menjelaskan konsep Shift-Left Security dan integrasinya dalam SDLC, mengidentifikasi security touchpoints di setiap fase, serta menerapkan Threat Modeling dasar menggunakan metode STRIDE (Sub-CPMK L2, CPMK032)

---

## Agenda 16 Pertemuan (RPS DevSecOps)

| Prt | Topik | CPMK |
|---|---|---|
| 1 | Pengantar DevSecOps & Shift-Left Security | CPMK032 |
| 2 | Shift-Left Security dalam SDLC | CPMK032 |
| 3 | Threat Landscape: OWASP Top 10, CVE/CWE, Threat Modeling | CPMK032 |
| 4 | SAST — Static Application Security Testing | CPMK032 |
| 5 | Integrasi SAST dalam CI/CD Pipeline | CPMK032 |
| 6 | DAST — OWASP ZAP | CPMK032 |
| 7 | SCA — Snyk | CPMK032 |
| 8 | UTS — Evaluasi Tengah Semester | UTS |
| 9 | Container Security — Docker, Trivy | CPMK092 |
| 10 | CI/CD Container Security Integration | CPMK092 |
| 11 | IaC Security — Checkov | CPMK092 |
| 12 | Secrets Management — Vault, GitLeaks | CPMK092 |
| 13 | Security Monitoring & Observability | CPMK092 |
| 14 | Compliance as Code — OPA | CPMK092 |
| 15 | Capstone Project: End-to-End Secure Pipeline | CPMK092 |
| 16 | UAS — Evaluasi Akhir Semester | UAS |

---

## 1. Mengapa Shift-Left Security?

### Apa itu Shift-Left Security?

Shift-Left Security adalah pendekatan yang mengintegrasikan aktivitas keamanan ke tahap-tahap AWAL siklus pengembangan perangkat lunak (SDLC). Alih-alih menguji keamanan di akhir, security dibangun sejak fase planning, requirements, dan design.

> "The cost of remediating security defects increases dramatically as the SDLC progresses."
> — NIST Special Publication 800-218 (SSDF)

### Fakta: Biaya Perbaikan Kerentanan

| Fase | Biaya Fix (relatif) |
|---|---|
| Requirement/Design (baseline termurah) | 1× |
| Development (coding) | 6× |
| Testing/QA | 15× |
| Production (setelah aplikasi live) | 100× |

*Sumber: IBM Systems Sciences Institute; NIST SP 800-218 (SSDF) — Cost of Security Defect Remediation*

### Prinsip Shift-Left Security

1. **Security is Everyone's Responsibility** — Developer, QA, Ops, dan Product Owner berbagi tanggung jawab keamanan bersama
2. **Automate Security Checks** — Integrasikan SAST, SCA, dan Secret Scanning otomatis di setiap CI/CD pipeline
3. **Fail Fast, Fail Safe** — Deteksi dini = perbaikan lebih cepat sebelum merambat ke lingkungan produksi
4. **Continuous Feedback** — Developer mendapat umpan balik keamanan saat menulis kode, bukan setelah berbulan-bulan
5. **Security as Code** — Kebijakan keamanan diwujudkan sebagai konfigurasi yang bisa di-version control
6. **Defense in Depth** — Berlapis-lapis kontrol keamanan di setiap tahap pipeline — tidak bergantung satu tool

---

## 2. Fase SDLC & Security Touchpoints

| Fase SDLC | Security Touchpoint | Tools/Referensi |
|---|---|---|
| Planning | Security Requirements | NIST SP 800-30, OWASP ASVS |
| Requirements | Abuse Cases / Misuse Cases | ASVS |
| Design | Threat Modeling | OWASP Threat Dragon |
| Development | SAST & Secure Coding | SonarQube, Semgrep |
| Testing | DAST & SCA | OWASP ZAP, Snyk |
| Deployment | CI/CD Security Gate | Trivy, GitLeaks |
| Operations | Security Monitoring | ELK Stack, Grafana |
| Compliance | Audit & Reporting | OPA, Conftest |

### DevSecOps Pipeline: Security Gates

**Alur Pipeline:** Plan → Code → Build → Test → Deploy → Monitor → Operate

Setiap gate gagal = pipeline berhenti otomatis → developer notifikasi langsung

**❌ Pipeline Tanpa Security Gate**
- Security test manual hanya sebelum release
- Bug keamanan lolos sampai production
- Biaya remediasi 100× lebih mahal
- Proses lambat, security jadi bottleneck
- Security jadi blocker, bukan enabler

**✅ DevSecOps Pipeline dengan Security Gates**
- [Commit] → Secret Scan → SAST
- [Build] → SCA → Container Scan
- [Test] → DAST → Pentest Otomatis
- [Deploy] → Policy Check → Monitor
- Security as Code: policy di-version control
- Feedback instan ke developer saat commit

---

## 3. Threat Modeling dengan STRIDE

### Apa itu Threat Modeling?

> "Threat modeling is a process by which potential threats can be identified, enumerated, and mitigated." — Adam Shostack

Dilakukan di fase DESIGN untuk menemukan cacat sebelum satu baris kode ditulis.

**Tiga Langkah Threat Modeling:**
1. **Identifikasi** — Apa yang kita bangun? Arsitektur, komponen, aliran data, batas kepercayaan (trust boundary) sistem
2. **Ancaman** — Apa yang bisa salah? Enumerasi ancaman pakai STRIDE: Spoofing, Tampering, Repudiation, Info Disclosure, DoS, Elevation of Privilege
3. **Mitigasi** — Bagaimana mengatasinya? Rancang kontrol keamanan: validasi input, enkripsi, AuthN/Z, rate limiting, audit log

### Metode STRIDE

| Huruf | Ancaman | Contoh | Mitigasi |
|---|---|---|---|
| S | Spoofing Identity | Forged JWT, login dengan kredensial orang lain, IP spoofing | MFA, OAuth2, JWT validation, digital certificate |
| T | Tampering with Data | SQL Injection, modifikasi request body, path traversal | Input validation, HMAC, digital signature, HTTPS |
| R | Repudiation | User menyangkal melakukan transaksi, hapus audit log | Audit log immutable, digital signature, non-repudiation |
| I | Information Disclosure | Data leak, verbose error, insecure API, exposed secrets | Enkripsi at-rest & in-transit, least privilege, error handling |
| D | Denial of Service | DDoS, resource exhaustion, XML bomb, infinite loop | Rate limiting, CAPTCHA, auto-scaling, CDN/WAF |
| E | Elevation of Privilege | User biasa akses admin endpoint, IDOR, JWT role tampering | AuthZ (RBAC/ABAC), principle of least privilege, input validation |

### DFD dalam Threat Modeling

**External Entity** (□ — Kotak/Persegi)
Sumber atau tujuan data eksternal, di LUAR batas sistem. Contoh: User, Admin, Payment Gateway, Third-party API. Setiap alur data dari/ke External Entity = kandidat Spoofing atau Info Disclosure.

**Process** (○ — Lingkaran/Ellips)
Komponen yang memproses data. Contoh: Login API, Checkout Service, Auth Middleware. Process adalah target utama Tampering, Elevation of Privilege, dan DoS.

**Data Store & Trust Boundary** (═ / [ ] — Dua garis sejajar / Kotak putus-putus)
Data Store: tempat data disimpan (DB, Cache, Session). Trust Boundary: batas zona kepercayaan (Internet vs Internal vs DB). Data Store → target Info Disclosure & Tampering. Setiap data melewati Trust Boundary wajib dianalisis.

---

## 4. Security Requirements

### Kategori Security Requirements

1. **Authentication & Authorization** — MFA untuk admin, JWT validation, session timeout 30 menit, RBAC per endpoint API
2. **Data Protection** — Enkripsi at-rest (AES-256), TLS 1.2+ in-transit, bcrypt/argon2 untuk password, backup terenkripsi
3. **Input Validation & Output Encoding** — Sanitasi semua input server-side, encode output (anti-XSS), prepared statements, validasi file upload
4. **Audit & Logging** — Log semua event keamanan (login gagal, akses ditolak), immutable 90 hari, alert anomali otomatis
5. **API Security** — Rate limiting, API key rotation, CORS policy, OAuth2 scopes, versioning dengan deprecation plan
6. **Error Handling & Resilience** — Generic error message (no stack trace), graceful degradation, circuit breaker, chaos engineering

---

## 5. Praktikum — OWASP Threat Dragon

### Skenario Studi Kasus: Toko Online

Startup mengembangkan aplikasi manajemen toko online dengan aktor: Customer (daftar, login, pesan, bayar), Admin (kelola produk), Payment Gateway (Midtrans/Xendit). Komponen: React Frontend, Node.js REST API, MySQL DB, Redis Cache, Email Service.

**Akses:** threatdragon.com

**Tugas Kelompok (3-4 orang, ±60 menit):**
1. Buat DFD di OWASP Threat Dragon
2. Identifikasi min. 8 ancaman STRIDE
3. Tulis 5 Security Requirements
4. Presentasi singkat temuan

### Langkah Praktikum OWASP Threat Dragon

| Langkah | Kegiatan |
|---|---|
| 1. Setup Tool | threatdragon.com → New Model |
| 2. Buat DFD | Gambar komponen & aliran data |
| 3. Identifikasi Ancaman | Pakai STRIDE, min. 8 ancaman |
| 4. Tulis Mitigasi | Per ancaman, mitigasi konkret |
| 5. Security Requirements | Min. 5 requirement dari temuan |
| 6. Export & Laporan | JSON / screenshot diagram |

**Penilaian:** DFD 25% + STRIDE 30% + Mitigasi 20% + Req 20% + Lap 5%
**Durasi:** ±60 menit kelompok + laporan individu

> "The threat modeling process naturally produces a list of mitigations ranked by risk."
> — Adam Shostack, Author of *Threat Modeling: Designing for Security*

---

## Referensi

1. Myrbakken, H., & Colomo-Palacios, R. (2017). DevSecOps: A Multivocal Literature Review. Springer CCIS Vol. 731.
2. Kim, G., Humble, J., Debois, P., & Willis, J. (2016). The DevOps Handbook: How to Create World-Class Agility, Reliability, and Security. IT Revolution Press.
3. Rajapakse, R. N., Zahedi, M., & Babar, M. A. (2022). An Empirical Analysis of Practitioners' Perspectives on Security Tool Integration in DevOps. Empirical Software Engineering, 27(1).
4. NIST SP 800-30 Rev. 1: Guide for Conducting Risk Assessments. https://csrc.nist.gov/publications/detail/sp/800-30/rev-1/final
5. NIST SP 800-218: Secure Software Development Framework (SSDF). https://csrc.nist.gov/publications/detail/sp/800-218/final
6. Microsoft. (2023). STRIDE Threat Model. https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats
7. Kim, G., Humble, J., Debois, P., & Willis, J. (2016). The DevOps Handbook. IT Revolution Press.
8. Mohan, V., & Ben Othmane, L. (2016). SecDevOps: Is It a Marketing Buzzword? IEEE ICSSP 2016.
