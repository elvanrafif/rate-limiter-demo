# Desain — Rate Limiter Demo

**Tanggal:** 14 Oktober 2026  
**Status:** Menunggu tinjauan pengguna

## Tujuan dan ruang lingkup

Membuat demo rate limiter yang dapat dicoba recruiter lewat satu halaman web dan dijalankan lokal dengan `docker compose up`. Implementasi mencakup Fixed Window Counter, Sliding Window Log, dan Token Bucket, dengan Redis sebagai penyimpanan. Deploy ke Coolify tidak termasuk pengerjaan ini; README akan memuat panduan konfigurasi/deploy.

UI memakai teks bahasa Inggris sesuai PRD. Komunikasi dan dokumentasi desain ini memakai bahasa Indonesia.

## Keputusan desain

- JavaScript ESM, bukan TypeScript; tidak ada proses build untuk aplikasi.
- Express menyajikan API sekaligus file statis dari `public/`.
- Tiap limiter mengekspor fungsi `check(redis, clientId)` dengan hasil seragam `{ allowed, limit, remaining, retryAfterSeconds }`.
- Registry algoritma memetakan nama URL ke limiter; nama yang tidak dikenal mendapat HTTP 400.
- Fixed Window memakai `INCR` dan TTL Redis. Sliding Window Log dan Token Bucket memakai Lua agar operasi baca-hitung-tulis atomik.
- Middleware mengambil identitas dari `x-client-id`, dengan IP sebagai fallback, lalu menyetel header rate limit. Penolakan mengembalikan HTTP 429, JSON yang sama bentuknya dengan respons sukses, dan `Retry-After`.
- `/api/reset` hanya menghapus key milik client yang meminta reset, untuk ketiga algoritma.
- `/api/health` adalah liveness check sederhana `{ "status": "ok" }`; tidak melakukan ping Redis. Dengan demikian, kegagalan Redis tidak dianggap sebagai proses aplikasi mati oleh health check.
- Vitest menguji limiter terhadap Redis nyata, termasuk batas kuota dan pemulihan setelah TTL/refill. Tes perlu Redis tersedia; instruksi lokal akan dicantumkan di README.
- Docker Compose menjalankan app dan Redis tanpa mempublikasikan port Redis. Aplikasi menerima `PORT` dan `REDIS_URL`.

## Struktur proyek

```text
rate-limiter-demo/
├─ src/
│  ├─ server.js
│  ├─ redis.js
│  ├─ rateLimit.js
│  └─ limiters/
│     ├─ fixedWindow.js
│     ├─ slidingLog.js
│     ├─ tokenBucket.js
│     └─ index.js
├─ public/
│  ├─ index.html
│  ├─ style.css
│  └─ app.js
├─ tests/limiters.test.js
├─ Dockerfile
├─ docker-compose.yml
├─ package.json
└─ README.md
```

## Alur API dan UI

`POST /api/demo/:algorithm` melewati middleware limiter, lalu mengembalikan status kuota. Header `X-RateLimit-Limit` dan `X-RateLimit-Remaining` hadir pada respons demo; `Retry-After` hanya hadir saat ditolak. `POST /api/reset` mengambil client ID yang sama dan menghapus key dengan prefix algoritma yang sesuai. `GET /api/health` hanya memeriksa bahwa proses merespons.

Browser membuat UUID client sekali dan menyimpannya di `localStorage`, lalu mengirimkannya melalui `x-client-id`. UI berisi tiga tab algoritma, penjelasan singkat, tombol request tunggal/15 request bersamaan/reset, indikator kuota dan daftar hasil terbaru. Batas kuota tetap 10 request per 60 detik; tidak ada kontrol konfigurasi di UI.

## Keamanan dan batasan

- `x-client-id` adalah identitas demo, bukan autentikasi; pengguna dapat mengganti nilainya.
- `trust proxy` tidak diaktifkan secara membabi buta. Fallback IP mengikuti konfigurasi Express agar header forwarding palsu tidak otomatis dipercaya. Deploy di belakang proxy perlu konfigurasi yang sesuai.
- Reset hanya menghapus key milik ID client terkait, bukan seluruh Redis.
- Fixed Window dapat mengalami burst pada batas window; Sliding Window Log memakai memori sebanding dengan jumlah request aktif; Token Bucket mengizinkan burst sesuai kapasitas bucket.
- Health check tidak memverifikasi Redis; endpoint API dapat gagal bila Redis tidak tersedia.

## Verifikasi

- Unit/integration test terhadap Redis nyata untuk kuota, penolakan request ke-11, dan pemulihan setelah window/refill.
- Periksa endpoint health, algoritma tidak dikenal, header limit, respons 429 dan `Retry-After`.
- Jalankan stack melalui Docker Compose dan uji UI/API pada desktop serta viewport ponsel.
- Coolify live deployment tidak dapat diverifikasi tanpa akses ke server/domain pengguna.

## Di luar cakupan

Login, database selain Redis, UI framework/build step, grafik/animasi, Redis cluster, konfigurasi limit dari UI, serta deployment langsung ke Coolify.
