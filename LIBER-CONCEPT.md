# LIBER

> *Liber* (Latin: bebas, merdeka) — dewa Romawi kebebasan. Uangmu, bebas berpindah.

**Tagline:** Terima gaji dari mana saja, bayar apa saja di Indonesia. Scan QRIS, bayar pakai USDC.

**Hackathon:** APAC Stellar Hackathon 2026
**Track utama:** Payment Consumer Applications ($20K) — sekunder: Local Finance & Real-World Access

---

## 1. Problem

Jutaan freelancer & remote worker Indonesia digaji dalam USD/USDT/USDC. Untuk hidup sehari-hari mereka harus:

1. Cairkan via Payoneer/PayPal/exchange → potongan 5-8% + kurs jelek
2. Tunggu 1-3 hari
3. Baru bisa bayar bakso

Sementara QRIS adalah rail pembayaran terbaik di Southeast Asia — 60+ juta user, diterima dari warung sampai mall. Yang belum ada: jembatan langsung dari saldo crypto ke QRIS dengan UX yang benar-benar bagus.

## 2. Solusi

Liber = wallet USDC berbasis Stellar dengan satu fitur inti: **scan QRIS apapun, bayar dari saldo USDC, merchant terima Rupiah**. Merchant tidak perlu tahu, tidak perlu ubah apapun.

Kenapa Stellar:
- Settlement 3-5 detik, fee ~$0.00001
- Passkey smart wallet (tanpa seed phrase — login pakai Face ID/fingerprint)
- Fee sponsorship — user tidak perlu punya XLM
- USDC native (Circle) di Stellar

## 3. Mekanisme (Inti Teknis)

Rail off-ramp: **IDRX** (stablecoin Rupiah) — redeem API mereka menerima payload QRIS mentah (`qrContent` EMVCo TLV) dan membayar merchant via rails QRIS resmi. Support GoPay, OVO, DANA, ShopeePay, mobile banking.

### Flow pembayaran

```
User                    Liber App              Backend                 IDRX
 |                          |                     |                      |
 |-- scan QRIS ------------>|                     |                      |
 |                          |-- parse EMVCo TLV   |                      |
 |                          |   (NMID, merchant,  |                      |
 |                          |    nominal)         |                      |
 |<- quote: Rp25.000 =      |                     |                      |
 |   1.52 USDC              |<-- rate oracle -----|                      |
 |                          |                     |                      |
 |-- approve (passkey) ---->|                     |                      |
 |                          |-- USDC transfer --->| (Stellar, 3-5 dtk)   |
 |                          |   ke treasury       |                      |
 |                          |                     |-- redeem request --->|
 |                          |                     |   qrContent + amount |
 |                          |                     |                      |-- bayar merchant
 |                          |                     |<-- webhook callback -|   via QRIS rails
 |<- struk "berhasil" ------|<-- update status ---|                      |
```

1. **Scan & parse** — kamera scan QRIS → parse payload EMVCo (merchant name, NMID, nominal). QRIS statis → user input nominal. Library parser open-source tersedia (mis. `qris-dinamis`).
2. **Quote** — nominal IDR → USDC pakai rate real-time + spread tipis (0.5-1%). Quote locked 30 detik.
3. **Approve** — user konfirmasi pakai passkey (WebAuthn). Smart wallet Soroban tanda tangan transaksi, fee disponsori via Launchtube.
4. **Settle on-chain** — USDC pindah ke treasury wallet. Final dalam ~5 detik.
5. **Redeem** — backend deteksi payment masuk (Horizon stream) → call IDRX redeem API dengan `qrContent` → merchant dibayar Rupiah.
6. **Konfirmasi** — webhook IDRX → status + struk di app (nama merchant, nominal, tx hash).

### Treasury & rebalancing

- Treasury wallet Stellar terima USDC dari user
- Saldo IDRX di akun IDRX dipakai untuk redeem
- Rebalance berkala: USDC terkumpul → convert → top-up saldo mint IDRX
- Untuk MVP/demo: pre-fund saldo IDRX secukupnya, rebalancing manual

### Fallback demo (kalau IDRX production access lambat)

IDRX perlu KYB untuk API key production. Mitigasi:
- Daftar KYB minggu pertama (prioritas #1)
- Plan B: demo pakai IDRX sandbox + video real transaction dari akun personal
- Plan C: mock IDRX endpoint dengan delay & webhook realistis, tapi transaksi Stellar tetap real di mainnet/testnet

## 4. Scope MVP (fokus QRIS only)

### In scope

1. **Onboarding passkey** — buat wallet pakai Face ID, tanpa seed phrase, < 30 detik
2. **Terima USDC** — alamat Stellar + QR untuk terima gaji/transfer
3. **Scan & pay QRIS** — fitur inti, end-to-end
4. **Riwayat transaksi** — struk dengan nama merchant + tx hash (proof on-chain)
5. **Saldo dalam 2 mata uang** — tampil USDC dan estimasi Rupiah

### Out of scope (roadmap, disebut di pitch saja)

- PPOB (pulsa, token listrik, BPJS)
- Transfer bank / kirim ke nomor HP
- Yield/tabungan
- Multi-chain deposit (bridge dari EVM/Solana)

## 5. Tech Stack

| Layer | Pilihan | Alasan |
|---|---|---|
| Frontend | Next.js PWA (mobile-first) | Cepat digarap, gampang demo, kamera API tersedia |
| Wallet | Passkey Kit + Soroban smart wallet | Killer UX, showcase Soroban ke juri |
| Fee sponsorship | Launchtube | User tanpa XLM |
| Chain ops | Stellar SDK (JS) + Horizon | Payment stream & submit tx |
| QRIS parser | qris-dinamis / parser EMVCo custom | Sudah teruji |
| QR scanner | html5-qrcode | PWA-friendly |
| Backend | Node.js (Hono/Express) + Postgres | Order state machine, webhook handler |
| Off-ramp | IDRX Redeem API | Rail QRIS |
| Rate | Reflector (oracle Stellar) / CoinGecko + spread | Quote USDC-IDR |

## 6. Timeline (14 Juli → deadline akhir Juli)

| Hari | Fokus |
|---|---|
| 1-2 | Setup repo, daftar IDRX KYB, passkey wallet jalan di testnet |
| 3-4 | Scan + parse QRIS, quote engine |
| 5-7 | Payment flow end-to-end (Stellar → backend → IDRX sandbox) |
| 8-9 | Webhook, order state machine, riwayat + struk |
| 10-11 | Polish UI (ini yang bikin menang — UX harus kayak GoPay, bukan kayak dApp) |
| 12 | Test beneran di warung, rekam video demo |
| 13-14 | Pitch deck, submission, buffer |

## 7. Demo Plan (untuk juri)

Video < 2 menit: buka app → Face ID → saldo USDC → jalan ke warung beneran → scan QRIS merchant → bayar → penjual terima notifikasi Rupiah di HP-nya → struk on-chain. **Transaksi nyata di merchant nyata** = momen yang menjual.

Angka untuk pitch: 60+ juta user QRIS, jutaan freelancer Indonesia digaji USD, biaya cairkan konvensional 5-8% vs Liber ~1%.

## 8. Kenapa Liber Menang

1. **Berguna nyata** — pain yang kejadian tiap bulan pas gajian, bukan use case buatan
2. **Mekanisme terbukti** — pola sama dengan Bitget Wallet (wallet crypto depan, settlement partner belakang), tapi UX lokal yang lebih baik + Stellar-native
3. **Showcase Stellar sungguhan** — passkey smart wallet, Soroban, fee sponsorship, USDC native; bukan sekadar token transfer
4. **Demo real** — bayar di warung beneran, bukan simulasi
5. **GTM jelas** — komunitas freelancer/web3 Indonesia, word-of-mouth organik seperti yang terjadi pada apps crypto-QRIS yang lagi rame

---

*Referensi teknis: [IDRX Redeem docs](https://docs.idrx.co/services/redeem-idr) · [Passkey Kit](https://github.com/kalepail/passkey-kit) · [qris-dinamis](https://github.com/verssache/qris-dinamis) · [Stellar Anchor Directory](https://anchors.stellar.org/)*
