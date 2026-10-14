# Rate Limiter Demo Implementation Plan

> **Untuk agen implementasi:** WAJIB gunakan subskill `superpowers:subagent-driven-development` (disarankan) atau `superpowers:executing-plans` untuk menjalankan rencana ini per tugas. Langkah memakai sintaks checkbox (`- [ ]`).

**Tujuan:** Membangun demo rate limiter tiga algoritma yang bisa dicoba dari UI statis dan dijalankan dengan Docker Compose.

**Arsitektur:** Express melayani API dan aset statis. Middleware memilih limiter dari registry; limiter berbagi interface `check(redis, clientId)`, memakai Redis dengan operasi atomic yang ditetapkan desain. UI HTML/CSS/JS biasa mengirim request memakai client ID yang disimpan di browser.

**Tech Stack:** Node.js 20+, JavaScript ESM, Express, ioredis, Redis, Vitest, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-10-14-rate-limiter-demo-design.md`

## Batasan Global

- Tiga algoritma wajib: Fixed Window Counter, Sliding Window Log, Token Bucket.
- Limit tetap 10 request per 60 detik per client.
- UI vanilla HTML/CSS/JS; teks UI berbahasa Inggris.
- Redis adalah satu-satunya penyimpanan; port Redis tidak dipublikasikan ke host.
- Sliding Window Log dan Token Bucket memakai Lua untuk operasi atomic.
- API demo menyetel `X-RateLimit-Limit` dan `X-RateLimit-Remaining`; 429 juga menyetel `Retry-After`.
- Health check hanya memeriksa proses aplikasi, tidak melakukan ping Redis.
- Tidak ada login, UI framework, build step frontend, dashboard/grafik, maupun konfigurasi limit di UI.
- Target deploy Coolify didokumentasikan, tetapi deploy live tidak termasuk.

## Fokus Tinjauan

- Client ID kosong/terlalu panjang dan header tidak valid: jangan membuat key Redis tanpa batas; tolak ID eksplisit yang lebih dari 128 karakter dengan 400, fallback ke IP hanya jika header tidak dikirim.
- Request bersamaan pada Sliding Log/Token Bucket: tidak boleh melewati kuota karena race; tes integrasi bersamaan membuktikan jumlah sukses maksimal 10.
- Pemulihan setelah TTL/refill: limiter harus menerima request lagi setelah waktu berlalu; gunakan fake clock/script test atau tunggu window pada tes integrasi tanpa membuat suite lambat.
- Algoritma tak dikenal: balas 400 JSON tanpa menyentuh Redis.
- Redis tidak tersedia: health tetap 200, sementara endpoint demo memberi 503 JSON; jangan biarkan error koneksi menjadi unhandled rejection.

---

## Peta File

- `package.json`, `package-lock.json`: ESM, scripts, dependency dan dev dependency.
- `src/redis.js`: client ioredis dari `REDIS_URL` dan penanganan lifecycle.
- `src/limiters/fixedWindow.js`: counter window tetap.
- `src/limiters/slidingLog.js`: sorted set dan Lua script.
- `src/limiters/tokenBucket.js`: hash bucket dan Lua script.
- `src/limiters/index.js`: registry tiga nama algoritma.
- `src/rateLimit.js`: middleware identitas, pemanggilan limiter, header dan error.
- `src/server.js`: route API, reset, health, static serving, start/listen.
- `tests/limiters.test.js`: integration tests limiter terhadap Redis.
- `tests/api.test.js`: tes middleware/route memakai app yang bisa diimpor tanpa listen.
- `public/index.html`, `public/style.css`, `public/app.js`: UI demo responsif dan interaksi.
- `Dockerfile`, `docker-compose.yml`, `.dockerignore`: image app dan Redis lokal.
- `README.md`: algoritma, setup, API, test dan panduan Coolify.

## Tugas 1: Scaffolding, koneksi Redis, dan health endpoint

**File:** `package.json`, `package-lock.json`, `.gitignore`, `src/redis.js`, `src/server.js`, `tests/api.test.js`

- [ ] Buat package ESM dengan scripts `dev`, `start`, `test`; tambahkan Express, ioredis dan Vitest.
- [ ] Buat app Express yang dapat diimpor untuk test tanpa membuka port; route `GET /api/health` selalu mengembalikan 200 `{ "status": "ok" }`.
- [ ] Buat client Redis dari `REDIS_URL` (default lokal `redis://127.0.0.1:6379`) dan tutup koneksi saat proses menerima SIGINT/SIGTERM.
- [ ] Tulis tes `health_is_live_without_redis_ping`: health merespons 200 tanpa memerlukan Redis.
- [ ] Jalankan `npm test` dan pastikan lulus; jalankan server dengan Redis aktif dan verifikasi `GET /api/health` menggunakan `curl`.

## Tugas 2: Limiter, middleware, demo API, dan reset

**File:** `src/limiters/*.js`, `src/rateLimit.js`, `src/server.js`, `tests/limiters.test.js`, `tests/api.test.js`

**Interface:** setiap limiter mengekspor `async function check(redis, clientId)` dan menghasilkan `{ allowed, limit, remaining, retryAfterSeconds }`. Nilai tetap `limit=10`, `window=60_000` ms. Registry mengekspor `limiters` dengan key `fixed-window`, `sliding-log`, `token-bucket`.

- [ ] Mulai Redis test service lokal dan tulis tes limit 10/ditolak ke-11 untuk tiap algoritma; verifikasi tes gagal sebelum implementasi.
- [ ] Implementasikan Fixed Window memakai key `rl:fw:{clientId}:{windowIndex}`, `INCR`, dan TTL sampai akhir window; `retryAfterSeconds` adalah detik hingga window berakhir.
- [ ] Implementasikan Sliding Window Log dengan Lua atomic: buang timestamp lebih tua dari 60 detik, hitung entri, tolak bila sudah 10, selain itu tambahkan request unik; key memiliki TTL.
- [ ] Implementasikan Token Bucket dengan Lua atomic: kapasitas 10, refill kontinu 10 token per 60 detik, konsumsi satu token bila tersedia; simpan token dan timestamp di hash dengan TTL.
- [ ] Tambahkan tes untuk reset window/refill dan tes concurrent request: maksimal 10 request sukses per algoritma dari 15 request bersamaan.
- [ ] Implementasikan middleware `rateLimit(algorithm)`: baca `x-client-id` atau fallback ke `req.ip`; tolak header eksplisit lebih dari 128 karakter dengan 400; selalu set dua header kuota; set `Retry-After` dan balas 429 untuk penolakan.
- [ ] Tambahkan `POST /api/demo/:algorithm` dengan respons JSON memuat `allowed`, `algorithm`, `limit`, `remaining`, serta `retryAfterSeconds` hanya saat 429; algoritma tak dikenal mendapat 400.
- [ ] Tambahkan `POST /api/reset` yang menghapus key milik client tersebut untuk ketiga algoritma saja; header client ID sama, fallback IP sama.
- [ ] Tangani Redis error dengan 503 JSON, tanpa unhandled rejection; health endpoint tetap 200 saat Redis tak tersedia.
- [ ] Jalankan `npm test` dan pastikan seluruh tes limiter/API lulus.

## Tugas 3: UI satu halaman

**File:** `public/index.html`, `public/style.css`, `public/app.js`, `src/server.js`

- [ ] Layani direktori `public/` dari Express.
- [ ] Buat layout berisi judul/penjelasan/link repo, tiga tab algoritma dengan deskripsi, tombol `Send request`, `Send 15 at once`, `Reset`, indikator sisa kuota/progress, dan daftar hasil terbaru.
- [ ] Buat UUID client dan simpan di `localStorage`; kirim sebagai `x-client-id` pada request demo/reset.
- [ ] Render hasil 200/429, kuota, waktu, serta `Retry-After` bila tersedia; tampilkan error jaringan/503 secara terbaca.
- [ ] Verifikasi manual pada desktop dan viewport ponsel; cek tab, request tunggal, batch 15, reset, dan tidak ada error console.

## Tugas 4: Docker dan dokumentasi menjalankan/deploy

**File:** `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `README.md`

- [ ] Buat Dockerfile Node 20+ yang menginstal dependency production dan menjalankan `npm start`.
- [ ] Buat Compose service `app` dan `redis`; expose hanya port app, set `PORT` dan `REDIS_URL=redis://redis:6379`, serta health check app ke `/api/health`.
- [ ] Tulis README bahasa Inggris untuk recruiter: demo link sebagai placeholder yang jelas, ringkasan tiga algoritma/trade-off, API, `docker compose up --build`, test, env vars dan langkah deploy Coolify.
- [ ] Jalankan `docker compose config` lalu `docker compose up --build -d`; verifikasi health, request 11 kali per algoritma (ke-11 429 + Retry-After), reset, dan `docker compose down`.

## Tinjauan akhir

- [ ] Jalankan `npm test` dan `docker compose config` setelah seluruh tugas digabung.
- [ ] Pastikan Redis tidak punya `ports:` pada Compose dan konfigurasi proxy tidak mempercayai `x-forwarded-for` sembarang.
- [ ] Tinjau ulang UI desktop/mobile; pastikan tidak ada fitur non-tujuan yang ikut ditambahkan.
- [ ] Catat bahwa deploy Coolify live belum diverifikasi karena memerlukan akses server/domain pengguna.
