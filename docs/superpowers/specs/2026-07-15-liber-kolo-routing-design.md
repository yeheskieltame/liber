# Liber: Kolo-Routing Model (Replaces Treasury-Float) — Design

> Supersedes `docs/superpowers/specs/2026-07-15-liber-treasury-float-settlement-design.md`. The wallet model, QRIS parser, onboarding funding/trustline flow, and design system are unchanged.

## Problem

The treasury-float model (user pays USDC to an operator wallet, operator manually pays the merchant's QRIS from their own e-wallet, then calls a settle endpoint) requires the operator to be personally available for every single transaction. This does not scale past a handful of manual demo transactions — with real usage (e.g. 100 concurrent users), it means 100 manual merchant payments by one person.

An exhaustive research pass this session ruled out every path to automate the merchant-payment step itself:
- IDRX, Alchemy Pay: KYB business-account gate on all endpoints, no self-serve individual tier
- Binance: IDR isn't supported on their Fiat Withdraw API at all (only BRL/ARS/MXN); their off-ramp widget product is enterprise-sales-only; P2P has counterparty settlement risk and no reliable automation
- Xendit, Midtrans IRIS, DANA Disbursement: all pay out to a **known, pre-registered** bank account or e-wallet phone number — none can pay an **arbitrary** QRIS code a user just scanned
- DANA/GoPay OAuth widget-binding: scoped to "user pays *this* registered merchant," not "this app pays whoever it wants on the user's behalf" — by design, to prevent exactly this kind of open-ended payment fraud
- Parsing the QRIS content itself: reveals which bank/PJSP issued it (via the NSS code) but never a usable account number or phone number — deliberately withheld for privacy

The one path that is real, already licensed, and already working: **Kolo** (kolo.xyz), a crypto Visa card that holds USDC natively on several chains **including Stellar** (no bridging needed), converts crypto to fiat automatically at point-of-sale with 0% markup on stablecoins, and is available in Indonesia. GoPay's own product already lets a user link a Visa/Mastercard card and pay QRIS directly from it (confirmed via GoPay's official blog), capped at Rp 200,000 per transaction, with no GoPay balance required.

## Goal

Reposition Liber as a non-custodial Stellar wallet + QRIS-scan/quote UX + routing layer to the user's own Kolo card. Liber never touches payment execution — the user's own Kolo account (their own KYC) and their own GoPay app (linked card, GoPay's own licensed QRIS rails) handle the actual merchant payment. This removes every part of the stack that required an operator in the loop.

## Non-goals

- No payment execution, confirmation, or settlement of any kind on our side. We cannot know whether a user actually completed their GoPay payment after scanning, and we don't try to.
- No Kolo API integration. Kolo's deposit address is just a Stellar public key the user pastes in — there's no partnership or API relationship with Kolo itself.
- No changes to the wallet/keypair model, QRIS TLV parser, onboarding funding/trustline flow, or design system.

## Architecture

```
Onboarding (unchanged): create Stellar wallet, fund it, establish USDC trustline
        |
        v
Connect Kolo (new, one-time): paste/scan Kolo's Stellar deposit address, saved to the user's row
        |
        v
   ,----+----.
   |         |
Top up Kolo   Scan QRIS
(on demand,   (per purchase, informational)
decoupled     |
from any      v
specific   Parse QRIS, quote IDR->USDC (existing engine, unchanged)
purchase)     |
   |          v
   |      Log scan intent to history
   |          |
   |          v
   |      Show quote + "open GoPay, pay with your linked Kolo card" +
   |      best-effort deep link
   v
Frontend builds+signs+submits a plain Stellar payment
(USER's account -> saved Kolo address), client-side,
no backend involvement in building the transaction
   |
   v
Log confirmed top-up to history (stellar_tx_hash)
        |
        v
GET /users/:id/history returns both log types, merged by time
```

Top-up and scan are two independent actions now, not a single atomic flow like the old order lifecycle — the user keeps *some* balance sitting in Kolo (topped up whenever, in whatever amount), and scanning a QRIS is purely informational: it tells them how much they need and reminds them to check their Kolo balance covers it, then hands off to GoPay for the real payment.

## Backend changes

**Deleted entirely:**
- `src/orders/` (`state-machine.ts`, `state-machine.test.ts`, `repository.ts`, `repository.test.ts`) — no more order lifecycle to track
- `src/routes/orders.ts`, `orders.test.ts` — replaced by two new thin log-only routes (below)
- `buildPaymentTx`, `buildPaymentTxFromAccount` in `src/stellar/account.ts` and their tests — only existed to build the treasury payment; the Kolo top-up transaction is now built client-side, so the backend never constructs a USDC payment transaction at all
- `TREASURY_PUBLIC_KEY`, `ADMIN_SECRET` env vars — no treasury, no settle route, nothing to protect
- The `orders` table

**Kept unchanged:** `submitStellarTx` in `stellar/account.ts` (still used by onboarding's funding tx and trustline confirmation — unrelated to this pivot), `routes/users.ts`'s onboarding/confirm-trustline handlers, `routes/balance.ts`, `quote/quote.ts` (the CoinGecko-based IDR/USDC rate engine).

**Schema additions:**
- `users.kolo_stellar_address TEXT` (nullable) — set via the new kolo-address route, null until the user connects Kolo
- New table `qris_scans`: `id, user_id, merchant_name, merchant_city, amount_idr, amount_usdc, created_at` — a pure log, no state machine, no lifecycle
- New table `kolo_topups`: `id, user_id, amount_usdc, stellar_tx_hash, created_at` — a pure log of confirmed on-chain transfers to the user's saved Kolo address

**New/changed routes:**
- `POST /users/:id/kolo-address` — body `{ koloStellarAddress: string }`, validates it's a well-formed Stellar public key (`G...`, 56 chars, matches `StrKey.isValidEd25519PublicKey`), upserts onto the user row
- `POST /quote` — body `{ amountIdr: number }`, returns `{ amountUsdc, rateIdrPerUsdc, expiresAt }` via the existing quote engine. Replaces `POST /orders`'s quoting half; no order row is created, this is a pure calculation endpoint
- `POST /users/:id/scans` — body `{ merchantName, merchantCity, amountIdr, amountUsdc }`, inserts a `qris_scans` row, returns `{ id }`. Fire-and-forget from the frontend's perspective (logging failure shouldn't block showing the quote)
- `POST /users/:id/topups` — body `{ amountUsdc, stellarTxHash }`, inserts a `kolo_topups` row, returns `{ id }`. Called by the frontend *after* it has independently confirmed the Stellar payment succeeded
- `GET /users/:id/history` — replaces the old order-history endpoint. Queries both `qris_scans` and `kolo_topups` for the user, merges and sorts by `created_at` descending, returns each with a `type: "scan" | "topup"` discriminator plus its type-specific fields

## Frontend changes

- **New "Connect Kolo" step**: a standalone page reachable from home, *not* a blocking part of onboarding (wallet creation shouldn't wait on the user going off to sign up for and KYC with a third-party product) — input for pasting a Stellar address, or scanning a QR (Kolo's own app shows a receive QR the user could scan with our camera scanner, reusing the existing `QrScanner` component), validates it looks like a Stellar public key client-side before saving. Scanning and quoting a merchant's QRIS works regardless of whether Kolo is connected yet (it's pure calculation); only the "Top up Kolo" action requires a saved address, and prompts the user to connect Kolo first if they try it without one
- **New "Top up Kolo" flow**: amount input (USDC), builds a plain Stellar `Payment` operation from the user's own loaded account to `kolo_stellar_address`, signs with the wallet's local keypair, submits directly to Horizon (client-side, using `@stellar/stellar-sdk` already a frontend dependency for keypair/XDR signing), then POSTs the confirmed hash to `POST /users/:id/topups`. Building a *new* transaction (as opposed to signing an XDR the backend already built) needs the account's current sequence number, which means the frontend now talks to Horizon directly for the first time: `new Horizon.Server(process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon.stellar.org").loadAccount(publicKey)` to get an `Account` object, then the same `TransactionBuilder`/`Operation.payment` pattern the backend used to use server-side. Horizon's public endpoints support CORS, so this works from the browser without a backend proxy. New env var: `NEXT_PUBLIC_HORIZON_URL` (frontend), mirroring the backend's existing `HORIZON_URL` fallback default
- **`pay/page.tsx` rewritten**: scan QRIS (unchanged scanner/parser) → call `POST /quote` → show merchant name, Rp amount, USDC amount, and a reminder to check Kolo balance → POST the scan to `/users/:id/scans` (best-effort, don't block the UI on it) → show a best-effort GoPay deep link + short instructions. No navigation to a second page, no polling — this screen is now a single self-contained view. `pay/[orderId]/page.tsx` and `OrderStatus.tsx` are deleted entirely, along with the deep-link-builder concept from the treasury-float era (already removed) — this pivot introduces its own simpler best-effort `gojek://gopay` link inline, not a revived shared module, since there's only one link target now (GoPay), not per-provider branching
- **`history/page.tsx` rewritten**: renders the merged `GET /users/:id/history` list, branching per entry's `type` — scan entries show merchant + Rp + USDC with a neutral/informational visual treatment (no `StatusPill` state, since there's no state); top-up entries show the USDC amount + truncated tx hash with a confirmed/on-chain visual treatment
- **`receive/page.tsx`**: unchanged — still shows the user's own Stellar address for receiving USDC from anywhere (salary, friends, an exchange withdrawal, etc.), independent of this pivot

## Testing

Backend: same DI-factory pattern for the new thin routes (`kolo-address`, `scans`, `topups`, `history`), each independently testable against a real Postgres per the existing convention. `POST /users/:id/kolo-address` gets a test asserting invalid-format addresses are rejected before insert. Frontend: the Kolo top-up's transaction-building logic gets a unit test in the style of `wallet/keypair.test.ts` (build a payment operation, assert operation type/destination/asset/amount — mirroring the assertions already written for the backend's now-deleted `buildPaymentTxFromAccount` test, just relocated client-side).

## Rollout

Both services are already deployed (Railway backend, empty-of-real-users production database; Vercel frontend). This ships as a normal redeploy: apply the schema changes (add `kolo_stellar_address` column, create two new tables, drop the `orders` table), remove `TREASURY_PUBLIC_KEY`/`ADMIN_SECRET` from Railway (no longer read by any code), redeploy both. No data migration concerns — no real orders exist yet to preserve.

## References

- This session's research (WebSearch/WebFetch transcripts, not a separate document) into IDRX, Binance, Xendit, Midtrans, DANA, GoPay, Alchemy Pay, Transak, Indodax, Tokocrypto, and Kolo — the elimination process that led here.
- `docs/superpowers/specs/2026-07-15-liber-treasury-float-settlement-design.md` — the design this supersedes; its own removal of IDRX/Allbridge stays valid, only the settlement mechanism changes again here.
