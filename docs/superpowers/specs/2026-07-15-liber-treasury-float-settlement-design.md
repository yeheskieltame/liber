# Liber: Treasury-Float Settlement (Replaces IDRX) — Design

> Supersedes the IDRX-based settlement leg of `docs/superpowers/specs/2026-07-15-liber-architecture-design.md`. Everything else in that spec (QRIS parsing, quote engine, wallet model, frontend design system) is unchanged.

## Problem

IDRX's API is gated behind a business account: every endpoint, including the already-implemented self-redeem-to-own-e-wallet flow, requires KYB approval (legal entity documents, ~3 business days, no sandbox). The team has no registered company to apply with, and re-research confirmed no more accessible IDR stablecoin or Stellar IDR anchor exists — this isn't a rail-selection problem, it's a licensing gate that applies to any rail capable of moving crypto into Indonesian bank/e-wallet rails.

## Goal

Get Liber demoable end-to-end without IDRX, using a treasury-float model: the operator (the team) holds their own IDR balance in a personal e-wallet/bank account and settles merchant QRIS payments manually, off-app, funded by USDC that users pay on-chain. This is explicitly a demo-time shortcut — custodial and manual — not a scalable production design. Production path remains: apply for IDRX business account, revert to the self-redeem flow (this pivot's removed code stays in git history for that).

## Non-goals

- No automated settlement to the merchant. There is no accessible API for that; the operator pays manually.
- No production-scale custody design (multi-sig treasury, float rebalancing, reconciliation tooling). Out of scope for a hackathon demo.
- No changes to QRIS parsing, the quote engine, or the wallet/keypair model.

## Architecture

```
User scans merchant QRIS
        |
        v
Frontend parses EMVCo TLV, calls POST /orders (unchanged)
        |
        v
Backend quotes amountUsdc via CoinGecko (unchanged), returns an
UNSIGNED Stellar Payment XDR: user's account -> TREASURY_PUBLIC_KEY
        |
        v
User signs the payment client-side, POSTs to /orders/:id/approve
        |
        v
Backend submits the signed tx to Horizon directly (no bridge).
Order -> "awaiting_settlement"
        |
        v
Operator (off-app): opens own e-wallet, scans the SAME merchant QRIS,
pays it from their own float
        |
        v
Operator calls POST /orders/:id/settle (ADMIN_SECRET header)
Order -> "completed"
        |
        v
Frontend polling (existing OrderStatus.tsx) shows the receipt
```

The user and the operator are both native Stellar accounts now — no cross-chain leg, no Base, no Allbridge. This removes an entire subsystem rather than adding one.

## Order state machine

Replace `bridging`/`redeeming` with a single `awaiting_settlement` state:

```
scanned --quote_received--> quoted --user_approved--> approved
  --payment_submitted--> awaiting_settlement --settled--> completed

(any state) --failure--> failed
```

`payment_submitted` replaces `bridge_submitted` (fires after the plain Stellar payment is submitted to Horizon, mirroring the current approve-route error handling: submission failure transitions to `failed` with `failure_reason` set). `settled` replaces `idrx_redeemed` and is the event fired by the new settle route.

## Backend changes

**Removed entirely:**
- `src/bridge/` (`allbridge.ts`, `poller.ts`) — Allbridge cross-chain orchestration and its bridging-status poller
- `src/idrx/client.ts` — IDRX HMAC-signed API client
- `src/routes/webhooks.ts` — IDRX webhook receiver + reconciliation
- `src/deeplink/builder.ts` — e-wallet app-link builder (no longer meaningful: the user doesn't pay a second time, so there's nothing to hand off to)
- `@allbridge/bridge-core-sdk` dependency from `package.json`
- The 60-second bridge-poll `setInterval` in `src/server.ts`

**`src/orders/state-machine.ts`:** states/events as above.

**`src/routes/orders.ts`:**
- `POST /orders`: replace the `buildBridgeTx` call with a plain Stellar `Payment` operation builder (source: `user.stellar_public_key`, destination: `process.env.TREASURY_PUBLIC_KEY!`, asset: USDC via `USDC_ISSUER`, amount: `quote.amountUsdc`), returned as an unsigned XDR under the same `unsignedBridgeXdr` response key is misleading now — rename to `unsignedPaymentXdr` (frontend updates to match).
- `POST /orders/:id/approve`: replace `submitBridgeTx` with a direct Horizon `submitTransaction` call (same pattern already used in `users.ts`'s `defaultSubmitStellarTx`); on success transition to `awaiting_settlement` via `payment_submitted`.
- `GET /orders/:id`: drop `ewalletHandoff` from the response entirely; switch from `getOrderWithProvider` to the existing plain `getOrder` (the provider join existed solely to build the handoff). Delete `getOrderWithProvider` from `src/orders/repository.ts` — nothing else calls it.
- New `POST /orders/:id/settle`: reads `x-admin-secret` header, 403s if it doesn't match `process.env.ADMIN_SECRET`, otherwise transitions `awaiting_settlement` → `completed` via `settled` and returns the updated state. 404 if the order doesn't exist, 409 (via `InvalidTransitionError`) if it's not in `awaiting_settlement`. The operator gets the order ID from the frontend URL (`/pay/[orderId]`) they're watching — no separate admin-listing endpoint, consistent with the single-operator, protected-endpoint-only choice.

**`src/routes/users.ts`:**
- Drop `onboardUser`/`addBankAccount` IDRX calls and their request fields (`idFileBase64`, `idNumber`, `address`, `bankAccountNumber`, `bankCode`, `provider`).
- Keep `buildOnboardingTx` (account funding) and `buildTrustlineTx` (USDC trustline) exactly as-is — this part was never IDRX-dependent.
- `POST /users` request body shrinks to `{ stellarPublicKey, email, fullname }`; insert only `stellar_public_key` into the `users` table (no IDRX columns to populate).

**`src/db/schema.sql`:**
- `users`: drop `idrx_user_id`, `idrx_api_key`, `idrx_api_secret`, `idrx_deposit_address`, `provider`, and the `users_idrx_deposit_address_unique` index.
- `orders`: drop `bridge_status`, `idrx_merchant_order_id`, `idrx_status`.
- The production database has no real order/user data yet (fresh migration from this session), so a direct `ALTER TABLE ... DROP COLUMN IF EXISTS` is safe — no backfill or phased rollout needed.

**New environment variables** (`.env.example` + Railway):
- `TREASURY_PUBLIC_KEY` — the operator's Stellar public key; payment destination. Public key only, no secret needed in the app (the operator moves funds out of this account themselves, outside Liber).
- `ADMIN_SECRET` — shared secret for the settle route. Generated once, set on Railway, never in a frontend-visible `NEXT_PUBLIC_*` var.

`FUNDING_SECRET_KEY` keeps its current, unrelated job: sponsoring new-user account creation (unchanged).

## Frontend changes

**`OnboardingForm.tsx`:** drop the KTP file upload, NIK, address, and bank/e-wallet provider fields. Form becomes `email` + `fullname` + wallet creation + trustline signing — same submit flow, fewer fields.

**`lib/api.ts`:** `createOrder`'s response type drops `unsignedBridgeXdr` in favor of `unsignedPaymentXdr` (naming only, same shape); `getOrder`'s response type drops `ewalletHandoff`.

**`OrderStatus.tsx`:**
- `STEPS`/`STEP_INDEX` become: `approved` ("Disetujui") → `awaiting_settlement` ("Menunggu pembayaran ke merchant") → `completed` ("Selesai").
- The "completed" card drops the QR-and-reopen-your-e-wallet UI (`qrDataUrl`, `QRCode.toDataURL`, the `ewalletHandoff.appLink` button) entirely, replaced with a plain receipt: merchant name, amount paid, Stellar tx hash. No polling/effect changes needed beyond removing the now-dead `ewalletHandoff` read.

**`pay/page.tsx`, `QuoteCard.tsx`:** no changes — they only consume `amountUsdc`/`amountIdr`/`quoteExpiresAt`, none of which change shape.

## Testing

Same DI-factory pattern already established (`createOrdersRoute(deps)`, `createUsersRoute(deps)`) extends to the settle route and the plain-payment builder — inject a fake Horizon submitter the way `submitStellarTx` is already faked in `users.ts` tests. State machine gets updated unit tests for the new `awaiting_settlement` transitions, mirroring the existing `bridging`/`redeeming` test shape. Frontend: `OrderStatus.tsx`'s existing tests (if any exercise step rendering) update their fixtures to the new state names; `api.test.ts` updates the two renamed response fields.

## Rollout

Since both services are already deployed (Railway backend, Vercel frontend) with an empty production database, this pivot ships as a normal redeploy: apply the schema change, set the two new env vars, redeploy backend, redeploy frontend. No dual-write or migration-in-place concerns — nothing depends on the old IDRX columns existing.

## References

- `RESEARCH-QRIS-RAILS.md` — Option B ("Treasury Float") is the origin of this design, written before implementation began.
- `docs/superpowers/specs/2026-07-15-liber-architecture-design.md` — original architecture; §10 addendum documents the mainnet/plain-keypair decisions this pivot doesn't touch.
- `docs/superpowers/plans/2026-07-15-liber-backend.md` — Task 15 (the IDRX correlation fix) is the code this pivot removes; kept in git history for the production-roadmap revert path.
