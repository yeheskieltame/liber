# RESEARCH: Rail Crypto → QRIS (Temuan Penting)

> Dokumen riset reusable untuk hackathon manapun yang butuh integrasi crypto → QRIS/Rupiah.
> Terakhir diverifikasi: 14 Juli 2026, langsung dari docs.idrx.co

---

## TL;DR

1. **Tidak ada API publik untuk bayar QRIS merchant arbitrer pakai crypto.** Semua pemain (Bitget dkk) pakai partner settlement berlisensi atau float sendiri.
2. **IDRX adalah rail terbaik yang bisa diakses developer biasa** — tapi arah QRIS-nya cuma on-ramp (mint). Off-ramp hanya ke bank/e-wallet atas nama sendiri.
3. **IDRX TIDAK support Stellar.** Chain yang disupport: Polygon, BNB, Base, Lisk, Etherlink, Kaia, World Chain, Gnosis, Solana.
4. Implikasi: ide crypto→QRIS paling mulus digarap di **Base/Solana/BNB**. Untuk hackathon Stellar, butuh bridge (cross-chain) atau pivot ide.

---

## 1. IDRX — Kemampuan & Batasan (verified)

IDRX = stablecoin Rupiah (1 IDRX = 1 IDR) dengan API developer lengkap. Docs: https://docs.idrx.co

### Chain yang disupport (per Juli 2026)

| Chain | Contract |
|---|---|
| Polygon | `0x649a2DA7B28E0D54c13D5eFf95d3A660652742cC` |
| BNB Chain | `0x649a2DA7B28E0D54c13D5eFf95d3A660652742cC` |
| Base | `0x18Bc5bcC660cf2B9cE3cd51a404aFe1a0cBD3C22` |
| Lisk | `0x18Bc5bcC660cf2B9cE3cd51a404aFe1a0cBD3C22` |
| Etherlink | `0x18bc5bcc660cf2b9ce3cd51a404afe1a0cbd3c22` |
| Kaia | `0x18bc5bcc660cf2b9ce3cd51a404afe1a0cbd3c22` |
| World Chain | `0x18bc5bcc660cf2b9ce3cd51a404afe1a0cbd3c22` |
| Gnosis | `0x18bc5bcc660cf2b9ce3cd51a404afe1a0cbd3c22` |
| Solana | `idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur` |

**Stellar: TIDAK ADA.** ❌

### On-ramp (Mint): IDR → IDRX

- `POST /api/transaction/mint-request` — user bayar Rupiah, terima IDRX on-chain
- **Metode bayar termasuk QRIS** (`qrContent` EMVCo TLV) + GoPay/OVO/DANA/ShopeePay/mobile banking + VA bank
- Bisa juga mint langsung ke stablecoin lain (USDT dll) — "getting other stablecoins"
- Min Rp20.000, max Rp1 miliar

### Off-ramp (Redeem): IDRX → IDR

- `POST /api/transaction/redeem-request` — burn IDRX (via platform!), IDR masuk rekening
- **Tujuan: rekening bank / e-wallet atas nama sendiri saja** (`bankAccount`, `bankCode`, `bankAccountName`)
- ⚠️ **TIDAK bisa bayar QRIS merchant** — tidak ada parameter qrContent di redeem
- ⚠️ Burn token di luar platform = dana hangus
- ✅ Redeem ≤ Rp250 juta diproses **real-time**
- Rp250jt–1M: jam kerja saja; >1M: manual via support
- Redeem beda nama rekening: wajib isi `notes`
- Bisa redeem dari stablecoin lain (USDT→IDR) — "redeeming from other stablecoins"

### API lain yang berguna

- `GET /api/transaction/rates` — rate swap IDRX ↔ token lain
- `GET /api/transaction/method` — daftar bank code
- `POST /api/auth/onboarding` — onboard user baru (KYC via API)
- Webhook callback untuk update status mint/redeem
- Butuh API key (KYB business account) + signature per-request

## 2. Cara Pemain Existing Bayar QRIS Merchant

### Pola Bitget Wallet (dan sejenisnya)
Wallet crypto di depan → "Onchain Payments Matrix" / partner settlement berlisensi di belakang → merchant terima Rupiah via rails QRIS resmi. Partner inilah yang punya akses issuer/PJSP. **Tidak ada API publik yang bisa dipakai developer indie.**

### Pola bot/apps viral (crypto→QRIS Telegram bots dll)
**Treasury float model**: operator pegang saldo e-wallet/bank sendiri → user kirim crypto → operator bayarin QRIS merchant dari float → rekonsiliasi belakangan. Tanpa lisensi, jalan karena skala kecil. Feasible untuk demo hackathon (executor semi-manual).

### Opsi arsitektur untuk builder

| Opsi | Mekanisme | Status |
|---|---|---|
| A. Redeem ke e-wallet sendiri | crypto → IDRX → redeem realtime ke DANA/GoPay user → user bayar QRIS sendiri | ✅ Full API, resmi, 2 langkah |
| B. Treasury float | user bayar crypto → backend/operator bayar QRIS dari float sendiri | ✅ Demo-able, manual/fragile, tidak scalable |
| C. Partner PJSP | integrasi dengan issuer berlisensi | ❌ Tidak realistis untuk hackathon, ini roadmap |

## 3. Implikasi per Hackathon

### Hackathon di chain yang disupport IDRX (Base, Solana, BNB, Lisk, dll)
**Gas langsung.** Full flow bisa production-grade:
- USDC/USDT → swap ke IDRX (DEX atau mint API) → redeem realtime ke e-wallet → (opsional) float model untuk scan-and-pay langsung
- Lisk menarik: chain kecil, kompetisi sepi, IDRX native, sering ada hackathon SEA

### Hackathon Stellar (APAC Stellar Hackathon 2026)
IDRX gak ada di Stellar → dua jalan:

1. **Main cross-chain**: USDC di Stellar → bridge ke Base/Solana (Allbridge Core support Stellar; Wormhole juga) → IDRX → redeem. Stellar jadi layer wallet/UX (passkey, fee murah), Base jadi layer settlement IDR. Kompleksitas naik, tapi "interoperability" justru nilai plus di track DeFi & Ecosystem Composability.
2. **Pivot ide** yang tidak bergantung rail IDR sama sekali (pure on-chain di Stellar), atau pakai anchor Stellar untuk IDR jika ada (cek https://anchors.stellar.org — per riset ini belum ada anchor IDR yang live dan developer-friendly).

## 4. Referensi

- IDRX docs: https://docs.idrx.co (llms.txt tersedia, bisa di-query per halaman dengan `?ask=`)
- Supported chains: https://docs.idrx.co/introduction/supported-chain-and-contract-address
- Redeem API: https://docs.idrx.co/api/transaction-api/post-api-transaction-redeem-request
- QRIS parser open-source: https://github.com/verssache/qris-dinamis · https://github.com/XanderID/qris-dynamicify
- Bitget QRIS (studi kompetitor): https://web3.bitget.com/en/academy/how-to-use-qr-payment-indonesia-with-bitget-wallet
- Stellar Anchor Directory: https://anchors.stellar.org
- Konsep produk terkait: lihat `LIBER-CONCEPT.md` (butuh revisi mekanisme sesuai temuan ini)
