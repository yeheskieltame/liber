# Liber — Architecture Design

**Date:** 2026-07-15
**Status:** Approved for planning
**Supersedes:** mechanism described in `LIBER-CONCEPT.md` section 3 (see "Why this differs" below)
**Related docs:** `LIBER-CONCEPT.md`, `RESEARCH-QRIS-RAILS.md`, `BRIDGE-PATHS.md`

## 1. Goal

Wallet USDC berbasis Stellar yang memungkinkan user scan QRIS merchant apapun di Indonesia dan bayar dari saldo USDC, dengan settlement akhir dalam Rupiah lewat rail IDRX. Karena IDRX tidak mendukung Stellar, USDC harus di-bridge cross-chain ke Base sebelum masuk rail IDRX.

## 2. Key architecture decisions

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Chain tujuan bridge | **Base** (bukan BSC) | Rute USDC end-to-end tanpa swap manual (BNB butuh cross-token USDC→USDT), real-time redeem via Li.fi. Paling sedikit moving parts. |
| Mode eksekusi | **Mode A — non-custodial per-transaction bridge** | User sign satu bridge tx langsung dari Stellar ke Base per pembayaran. Tidak ada treasury/float, tidak ada custodial risk. Trade-off: latency bridge (~menit) dan tidak instan seperti Mode B. |
| Mekanisme bayar merchant | **Self-redeem + deep-link** | IDRX redeem API tidak punya parameter `qrContent` — tidak bisa bayar merchant pihak ketiga langsung. Redeem selalu cair ke rekening/e-wallet **atas nama user sendiri**. App scan QRIS → convert crypto → IDR masuk e-wallet user sendiri (real-time) → app deep-link user ke e-wallet itu untuk tap terakhir bayar merchant. Fully automatable via API resmi, tanpa float/compliance risk. |
| Contracts | **Tidak ada custom Soroban contract** | Passkey Kit sudah menyediakan smart wallet contract yang teraudit. `contracts/` folder isinya deployment/config factory, bukan contract baru. |
| Repo structure | **Tiga folder fully isolated** — `frontend/`, `backend/`, `contracts/` | Tidak ada root `package.json` atau workspace file. Tiap folder independen penuh: install/build/deploy/versioning sendiri-sendiri. Komunikasi antar folder murni runtime (HTTP API, on-chain calls), zero shared code/tooling. |
| Backend hosting | **Railway** | Long-running process dibutuhkan untuk Horizon stream listener + bridge status polling — tidak cocok serverless. User sudah punya Railway CLI ter-connect. |
| Frontend hosting | **Vercel** | Next.js PWA, standard fit. |
| Contracts deploy | **Manual via Soroban CLI** | Testnet dulu, mainnet setelah validasi. Bukan continuous deploy — deploy sekali per network. |

## 3. Why this differs from LIBER-CONCEPT.md

`LIBER-CONCEPT.md` section 3 mengasumsikan backend bisa memanggil IDRX redeem API dengan `qrContent` untuk membayar merchant langsung. `RESEARCH-QRIS-RAILS.md` (diverifikasi lebih baru, langsung dari docs.idrx.co) mengkonfirmasi parameter itu tidak ada — redeem cuma bisa cair ke rekening/e-wallet atas nama user sendiri. Desain ini mengoreksi mekanisme tersebut: fitur inti tetap "scan QRIS, bayar pakai USDC", tapi step terakhir (bayar merchant) diselesaikan via deep-link ke e-wallet user sendiri yang baru saja ke-top-up, bukan via redeem langsung ke merchant.

## 4. Flow pembayaran

```
User (Stellar passkey wallet)
   │  1. scan QRIS → parse EMVCo (merchant, NMID, nominal IDR)
   │  2. quote nominal IDR → USDC (rate real-time + spread 0.5-1%, locked 30 detik)
   │  3. approve sekali (passkey/WebAuthn, fee disponsori Launchtube)
   ▼
Stellar: smart wallet sign & submit
   │  4. Allbridge Core bridge: USDC Stellar → USDC Base
   │     toAccountAddress = IDRX deposit address milik USER (bukan treasury)
   ▼
Base: USDC landing di IDRX deposit address
   │  5. IDRX auto-detect → auto-swap (Li.fi) → burn → IDR real-time
   ▼
IDR masuk e-wallet/bank USER SENDIRI (GoPay/DANA/OVO/bank — didaftarkan saat onboarding)
   │  6. Backend detect completion (webhook IDRX + polling status bridge)
   ▼
App: deep-link buka e-wallet user dengan QRIS udah ke-scan → user tap terakhir konfirmasi bayar merchant
   │  7. Struk: tx hash Stellar + bridge status + redeem confirmation
```

## 5. Component boundaries

### `contracts/`
Deployment & config untuk Passkey Kit smart wallet factory (Soroban, Rust/CLI, contract WASM existing). Output: factory address per network + wallet deployment script yang dipanggil backend saat onboarding user baru. Tidak ada Soroban contract custom untuk MVP.

### `backend/`
Node.js (Hono) + Postgres, deploy Railway. Satu-satunya layer yang bicara ke pihak eksternal (Horizon, Allbridge, IDRX). Tanggung jawab:
- Order state machine: `scanned → quoted → approved → bridging → redeeming → completed | failed`
- Quote/rate engine (Reflector/CoinGecko + spread)
- Horizon payment stream listener (deteksi sign bridge tx)
- Allbridge SDK orchestration (build XDR, submit, poll status bridge)
- IDRX integration (onboarding/KYC, add-bank-account, rates, webhook receiver)
- Deep-link payload generator per e-wallet (GoPay/DANA/OVO — skema URI beda-beda). **MVP scope: implementasi penuh untuk satu e-wallet dulu (GoPay — paling umum), yang lain pakai fallback manual (lihat §7.3) sampai deep-link-nya ditambahkan.**

### `frontend/`
Next.js PWA, deploy Vercel. Semua UI: onboarding passkey, scan QRIS (html5-qrcode + parser EMVCo), quote screen, approve (WebAuthn), balance, riwayat/struk, deep-link handoff ke e-wallet.

**Boundary rule:** frontend tidak pernah bicara langsung ke Horizon/Allbridge/IDRX — selalu lewat backend API.

## 6. Repo structure

```
stellar-apac/
├── frontend/          # Next.js PWA — deploy: Vercel (root dir = frontend/)
├── backend/           # Node.js + Hono — deploy: Railway (root dir = backend/)
├── contracts/         # Soroban — deploy: manual via soroban CLI
├── LIBER-CONCEPT.md
├── RESEARCH-QRIS-RAILS.md
└── BRIDGE-PATHS.md
```

Tidak ada `pnpm-workspace.yaml` atau root `package.json`. Tiap folder self-contained: `package.json`/`Cargo.toml` sendiri, install/build/deploy sendiri.

## 7. Risiko teknis & fallback

1. **Bridge langsung ke IDRX deposit address belum tervalidasi** — apakah IDRX mendeteksi USDC yang masuk dari kontrak Allbridge (bukan EOA biasa)? **Test di awal implementasi**: kirim nominal kecil real via Allbridge, cek auto-detect. **Fallback**: backend provision satu EVM wallet ringan per user (key di-generate & disimpan backend, murni technical hop, tidak pernah diekspos ke user). Bridge landing di situ dulu, backend forward otomatis ke IDRX deposit address dalam satu siklus. Ditandai `ponytail:` shortcut di kode kalau dipakai — upgrade path: deterministic derivation dari passkey kalau ada waktu.

2. **KYB IDRX belum tentu approve cepat** — prioritas hari-1. Fallback: sandbox + video demo dari akun personal (sudah diantisipasi di `LIBER-CONCEPT.md`).

3. **Deep-link e-wallet beda skema URI per provider**, tidak semua provider punya deep-link resmi buat buka QRIS scanner langsung. **Fallback**: kalau deep-link native gagal, tampilkan instruksi manual + re-render QR code di app untuk di-scan ulang dari e-wallet manapun.

4. **Latency bridge Allbridge (~menit)** — bukan instan. Frontend butuh status screen jelas (bridging → redeeming → siap dibayar), bukan spinner kosong.

## 8. Testing approach

- **`contracts/`**: script `deploy-and-verify.sh` di testnet — deploy factory, buat 1 wallet, sign 1 payment, verifikasi on-chain. Bukan test framework baru.
- **`backend/`**: unit test per module (quote engine, deep-link builder) + 1 integration test end-to-end (testnet Stellar + IDRX sandbox/mock). Order state machine perlu test failure path (bridge gagal, redeem gagal, webhook telat).
- **`frontend/`**: manual testing checklist di device real (kamera QR perlu hardware asli) — tidak perlu e2e framework baru untuk MVP hackathon.

Tidak ada CI/CD pipeline baru untuk MVP. Deploy manual per komponen (`vercel deploy`, `railway up`, `soroban contract deploy`) cukup untuk timeline hackathon.

## 9. Out of scope (tetap sesuai LIBER-CONCEPT.md)

PPOB, transfer bank/nomor HP, yield/tabungan, multi-chain deposit selain jalur bridge ini, treasury/float model (ditolak demi non-custodial), CI/CD pipeline, custom Soroban contract di luar wallet factory.
