# Liber

A non-custodial Stellar wallet that lets anyone spend USDC at Indonesian QRIS merchants, without a custodial exchange and without building a new payment rail.

**Live app:** [liber-qris.vercel.app](https://liber-qris.vercel.app)
**Demo video:** [youtu.be/tAt_Gn67OII](https://youtu.be/tAt_Gn67OII)

## The problem

Millions of Indonesians pay for everyday purchases through QRIS, but anyone holding their money in USDC or other crypto has no direct way to spend it there. Custodial exchanges hold the user's keys instead of the user. Off-ramping to a bank account is slow and fee-heavy. Not a single QRIS merchant accepts crypto directly. Today, spending crypto on daily life in Indonesia means selling it on an exchange, waiting for a bank transfer, then spending rupiah, a multi-day, multi-fee detour just to buy a coffee.

## The solution

Liber closes that gap without inventing a new payment rail:

1. **Scan** any QRIS code. Liber reads the merchant and amount, and quotes the equivalent price in USDC instantly.
2. **Route** that USDC over Stellar, seconds, near-zero fees, to your own Kolo crypto Visa card.
3. **Pay** by opening GoPay or DANA, e-wallets that already support paying QRIS directly from a linked Visa card, scanning the same code, and paying.

Liber never touches the payment itself. It holds the user's own keys, quotes the price, and hands off to infrastructure that is already live and regulated: Stellar settlement, Kolo's card program, and GoPay/DANA's own card-linked QRIS payment feature. Nothing new has to be built or trusted at the settlement layer.

## Architecture

This is a monorepo of two fully independent applications, each deployed separately, with no shared root package.json or workspace tooling:

```
frontend/   Next.js 16 (App Router) app, deployed to Vercel
backend/    Hono API server, deployed to Railway
```

### Frontend

Mobile-first Next.js app: a bottom-nav app shell (Home, Scan, Profile, History) sitting behind a marketing landing page. Wallet keypairs are generated and held entirely client-side (`frontend/src/lib/wallet/`); the backend never sees a private key.

- Next.js 16, React 19, Tailwind v4
- `@stellar/stellar-sdk` for client-side signing and Horizon reads
- `html5-qrcode` for QRIS scanning, `qrcode` for generating the receive-address QR

### Backend

A small Hono API handling account bootstrapping, QRIS quotes, and activity logging. It never executes a payment; it only funds new accounts and relays what the client already signed.

- Hono on `@hono/node-server`
- Postgres for user records and scan/top-up history
- `@stellar/stellar-sdk` for building and submitting Stellar transactions

## Stellar integration

Stellar is the settlement and custody layer end to end:

- **Non-custodial wallets**: every user gets a Stellar keypair generated and held client-side.
- **USDC trustline**: established on account creation via a Stellar `changeTrust` operation.
- **Account funding**: the backend funds each new account's minimum XLM reserve via a Stellar `payment` operation, so the account exists on-chain from the first tap.
- **Kolo top-ups**: sending USDC to a user's Kolo card is a Stellar `payment` operation submitted through Horizon, settling in seconds for a fraction of a cent.
- **Live balance and quotes**: balances and account state are read directly from Horizon.

Stellar's speed and near-zero fees are what make routing USDC to a spendable card practical at everyday-purchase scale, an economics that does not hold up on higher-fee chains.

## Local development

Each app runs independently. Open two terminals.

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in DATABASE_URL and FUNDING_SECRET_KEY
npm run migrate
npm run dev
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # point NEXT_PUBLIC_BACKEND_URL at the backend above
npm run dev
```

Both apps have their own test suites (`npm test`) using Node's built-in test runner.

## Hackathon track

Payment and Consumer Applications. Liber is a consumer-facing payment app built for everyday use, scan a code, see a price, pay, not a DeFi primitive or an institutional finance tool.
