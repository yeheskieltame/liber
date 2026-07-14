# RESEARCH: Path Cross-Chain Stellar → IDRX → Rupiah

> Riset path token dari Stellar sampai redeem IDR. Semua diverifikasi langsung dari docs resmi, 14 Juli 2026.
> Konteks: IDRX tidak support Stellar (lihat `RESEARCH-QRIS-RAILS.md`), jadi butuh bridge.

---

## TL;DR — Path Utama (VERIFIED ✅)

```
USDC (Stellar, Circle native)
   │  Allbridge Core (SDK JS, non-custodial, tanpa wrapped token)
   ▼
USDC (Base, native)
   │  kirim ke IDRX Deposit Address (per rekening bank)
   ▼
IDR masuk rekening bank — REAL-TIME (≤ $5.555)
```

**Cuma 2 langkah teknis.** Gak perlu swap manual ke IDRX — IDRX otomatis swap USDC→IDRX via Li.fi lalu burn, IDR langsung cair. Bahkan berpotensi 1 langkah: `toAccountAddress` di Allbridge bisa langsung diisi deposit address IDRX (perlu diverifikasi, lihat Open Questions).

---

## 1. Leg 1: Bridge Stellar → EVM/Solana (Allbridge Core)

Satu-satunya bridge production yang support Stellar (via Soroban). Wormhole/CCTP standalone tidak support Stellar.

- **Chain support:** Stellar (SRB), Base, BNB, Polygon, Ethereum, Arbitrum, OP, Avalanche, Celo, Linea, Unichain, Sonic, Tron, Solana, Sui
- **Token:** USDT & USDC, pool native per chain (bukan wrapped) — arsitektur vUsd stable-swap
- **Route Stellar↔Base USDC confirmed:** URL resmi launch mereka literally `core.allbridge.io/?f=BAS&ft=USDC&t=SRB&tt=USDC`
- **Non-custodial**, audited, fee bisa dibayar pakai stablecoin (gak perlu XLM/ETH!), ada opsi **gas top-up** (dapat sedikit ETH di destination)
- **SDK JS lengkap dengan guide Stellar**: build XDR → sign → submit via Soroban RPC. Ada juga REST API dan MCP
  - SDK: `@allbridge/bridge-core-sdk` — contoh full: [srb-send-full-example.ts](https://github.com/allbridge-io/allbridge-core-js-sdk/blob/main/examples/src/examples/bridge/srb/srb-send-full-example.ts)
  - Docs: https://docs-core.allbridge.io/sdk/guides/stellar/transfer
- ⚠️ Catatan teknis Stellar: perlu handle trustline + kemungkinan restore transaction (data archived di Soroban) — sudah ada di contoh SDK

## 2. Leg 2: EVM → IDR (IDRX "Redeem from Other Stablecoins")

Fitur kunci: **deposit address**. Tiap rekening bank yang didaftarkan di IDRX dapat wallet address khusus. Kirim stablecoin ke address itu → IDRX auto-swap (partner API) → burn → IDR masuk rekening.

**Token & chain yang disupport (verified dari docs):**

| Network | Token | Partner swap |
|---|---|---|
| **Base** | **USDC** | Li.fi |
| BNB Chain | USDT | 0x |
| Polygon | USDT | 0x |
| Kaia | USDT | Li.fi |
| Lisk | USDT0 | Li.fi |

- Min $2, max $5.555 per transaksi, **real-time** di bawah max
- Rekening = bank atau e-wallet, harus terdaftar via API (`add-bank-account`), KYC user via onboarding API
- Rate check: `GET /api/transaction/rates`
- ❌ Solana TIDAK ada di daftar redeem-from-stablecoin (IDRX token ada di Solana, tapi jalur auto-swap tidak tersedia — harus swap manual di DEX lalu redeem IDRX, lebih ribet)

## 3. Perbandingan Route

| Route | Leg 1 | Leg 2 | Verdict |
|---|---|---|---|
| **Stellar USDC → Base USDC → IDR** | Allbridge (confirmed) | Deposit address USDC, Li.fi | ✅ **PILIHAN UTAMA** — USDC end-to-end, tanpa swap manual |
| Stellar USDC → BNB USDT → IDR | Allbridge (USDC→USDT cross-token, didukung arsitektur vUsd) | Deposit address USDT, 0x | ✅ Backup — gas BNB murah |
| Stellar USDC → Polygon USDT → IDR | Allbridge | Deposit address USDT | ✅ Backup |
| Stellar → Solana → IDR | Allbridge | Manual swap DEX → redeem IDRX | ⚠️ Ribet, hindari |
| XLM → ... | ✗ Allbridge cuma stablecoin | — | ❌ XLM harus di-swap dulu ke USDC di Stellar DEX (path payment native Stellar — trivial) |

Catatan XLM: user yang pegang XLM tetap bisa — Stellar punya DEX built-in + path payments, konversi XLM→USDC satu operasi native sebelum bridge.

## 4. Arsitektur untuk Hackathon (Liber cross-chain)

Dua mode implementasi:

**Mode A — Non-custodial penuh (ideal, lebih "wow" buat juri):**
User passkey wallet (Stellar) → sign transaksi bridge Allbridge langsung dengan `toAccountAddress` = deposit address IDRX user → IDR masuk rekening user. Satu approval, crypto→rekening bank. Fee dibayar stablecoin, user gak butuh XLM ataupun ETH sama sekali.

**Mode B — Treasury (lebih cepat, UX instan):**
User bayar USDC di Stellar ke treasury (settle 5 detik) → backend langsung eksekusi redeem dari float USDC yang sudah standby di Base → IDR cair tanpa nunggu bridge. Treasury rebalance Stellar→Base via Allbridge secara batch. **User merasa instan; bridge latency disembunyikan.** Ini pola yang tepat untuk payment app.

Rekomendasi: **Mode B untuk produk, Mode A didemokan sebagai proof "fully on-chain path exists".**

## 5. Estimasi Biaya & Waktu (perlu validasi saat build)

| Step | Biaya | Waktu |
|---|---|---|
| Stellar tx (user → treasury / bridge) | ~$0.00001 | 3-5 dtk |
| Allbridge Stellar→Base | LP fee ~0.04-0.3% + relay fee (bisa dibayar stable) | ~menit |
| IDRX redeem USDC→IDR | fee IDRX + spread Li.fi (cek `GET /api/transaction/rates` & halaman Fees) | real-time |

## 6. Open Questions (cek pas mulai build)

1. **Bridge langsung ke deposit address IDRX** — apakah IDRX deteksi transfer USDC yang datang dari kontrak bridge (bukan EOA transfer biasa)? Test dengan nominal kecil. Kalau gagal → selalu via treasury EVM dulu (Mode B).
2. Liquidity pool depth Allbridge SRB↔Base saat ini — cek di https://core.allbridge.io (slippage untuk nominal demo pasti aman, tapi cek untuk klaim scale di pitch).
3. Fee & rate IDRX aktual — perlu API key (KYB) untuk hit `rates`. **Daftar KYB = prioritas hari-1.**
4. Deposit address: satu address per rekening bank — untuk multi-user perlu onboarding API per user (KYC user via API tersedia).

## 7. Referensi

- Allbridge Core docs: https://docs-core.allbridge.io (Stellar SDK guide + REST API + MCP)
- Allbridge Stellar launch (route Base USDC↔SRB USDC): https://allbridge.medium.com/allbridge-core-launches-a-bridge-to-stellar-14156f59e925
- IDRX redeem from other stablecoins: https://docs.idrx.co/integration/processing-redeem-idrx-requests/redeeming-from-other-stablecoins
- IDRX supported chains: https://docs.idrx.co/introduction/supported-chain-and-contract-address
- Dokumen terkait: `RESEARCH-QRIS-RAILS.md`, `LIBER-CONCEPT.md`
