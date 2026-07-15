# Liber Kolo-Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the treasury-float settlement model with a Kolo-routing model: the backend never executes or confirms payment. Users send USDC from their Liber Stellar wallet to their own saved Kolo Stellar deposit address (a plain client-side Stellar payment), then pay QRIS merchants directly in GoPay using their Kolo-linked Visa card. Liber becomes a non-custodial wallet + QRIS-scan/quote calculator + Kolo-routing/history layer.

**Architecture:** Delete the entire order-lifecycle subsystem (state machine, settle route, treasury payment building). Add three small log-only backend routes (kolo-address, scans, topups) plus a stateless quote endpoint. The Kolo top-up transaction is built, signed, and submitted entirely client-side (the frontend talks to Horizon directly for the first time), then reported to the backend purely for history.

**Tech Stack:** Hono, `@stellar/stellar-sdk` (both backend and now client-side), `pg` (no ORM), Node's built-in `node:test`/`node:assert`, `tsx`; Next.js App Router, Tailwind v4.

## Global Constraints

- `backend/` and `frontend/` are fully standalone (no root package.json/workspace) — every task edits files inside exactly one of them, tests run from that directory.
- Backend routes that call an external system (Horizon, `process.env`-derived config, CoinGecko) use the DI-factory pattern: `createXRoute(deps: Partial<XRouteDeps> = {})`. Routes that only touch Postgres do NOT need a DI factory (matches the existing `balance.ts` vs `history.ts` split: `balance.ts` has DI because it calls Horizon, plain `historyRoute`/route objects do not).
- Test runner is Node's built-in `node:test` — no Jest/Vitest. Test files run isolated per-process.
- No em dashes in user-facing Indonesian copy.
- Mainnet only, no testnet fallback.
- Production Postgres is empty (no real users/orders yet) — schema changes may use direct `DROP TABLE`/`ALTER TABLE` without phased-migration concerns.
- Env vars removed by this plan: `TREASURY_PUBLIC_KEY`, `ADMIN_SECRET` (backend). New env var: `NEXT_PUBLIC_HORIZON_URL` (frontend, optional — falls back to the public mainnet Horizon URL exactly like the backend's existing `HORIZON_URL` fallback).
- `@stellar/stellar-sdk` is already a frontend dependency (`^16.0.1`) — no new dependency needed for client-side Horizon calls.

---

### Task 1: Delete the order-lifecycle subsystem, add new schema

**Files:**
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/db/pool.test.ts`
- Delete: `backend/src/orders/` (entire directory: `state-machine.ts`, `state-machine.test.ts`, `repository.ts`, `repository.test.ts`)
- Delete: `backend/src/routes/orders.ts`, `backend/src/routes/orders.test.ts`
- Modify: `backend/src/stellar/account.ts`
- Modify: `backend/src/stellar/account.test.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: nothing new
- Produces: `users.kolo_stellar_address` column, `qris_scans` and `kolo_topups` tables — Tasks 2-6 read/write these. `stellar/account.ts` no longer exports `buildPaymentTx`/`buildPaymentTxFromAccount` (nothing in later tasks needs them — the Kolo top-up transaction is built entirely client-side in Task 8).

This task leaves exactly one known, disclosed gap: `backend/src/routes/history.ts` (untouched by this task) still queries the `orders` table this task drops, so its 2 existing tests will fail after this task lands. This is resolved by Task 6, which rewrites `history.ts` to query the new tables instead. Do not touch `history.ts` or `history.test.ts` in this task — that's Task 6's job.

- [ ] **Step 1: Rewrite `schema.sql`**

Replace the full contents of `backend/src/db/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stellar_public_key TEXT NOT NULL UNIQUE,
  kolo_stellar_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qris_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  merchant_name TEXT NOT NULL,
  merchant_city TEXT NOT NULL,
  amount_idr NUMERIC NOT NULL,
  amount_usdc NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qris_scans_user_id_idx ON qris_scans(user_id);

CREATE TABLE IF NOT EXISTS kolo_topups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  amount_usdc NUMERIC NOT NULL,
  stellar_tx_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kolo_topups_user_id_idx ON kolo_topups(user_id);

-- Kolo-routing pivot (2026-07-15): the treasury-float order lifecycle is
-- gone entirely — payment now happens in the user's own GoPay app via a
-- linked Kolo card, outside this system. DROP TABLE IF EXISTS is idempotent
-- against both a fresh install (table never existed) and the already-
-- deployed Railway database (table existed, now removed).
DROP TABLE IF EXISTS orders;
```

- [ ] **Step 2: Update `pool.test.ts` for the new schema**

Replace the full contents of `backend/src/db/pool.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { getPool } from "./pool.js";
import { migrate } from "./migrate.js";

test("migrate creates users, qris_scans, and kolo_topups tables", async (t) => {
  t.after(() => getPool().end());
  await migrate();
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('users', 'qris_scans', 'kolo_topups')`
  );
  assert.equal(rows.length, 3);

  const { rows: userColumns } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`
  );
  const userColumnNames = userColumns.map((r) => r.column_name);
  for (const expected of ["id", "stellar_public_key", "kolo_stellar_address", "created_at"]) {
    assert.ok(userColumnNames.includes(expected), `missing column: ${expected}`);
  }

  const { rows: orderTable } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders'`
  );
  assert.equal(orderTable.length, 0, "orders table should be dropped");
});
```

- [ ] **Step 3: Run to verify the schema tests pass**

Run (from `backend/`): `DATABASE_URL="postgres://$(whoami)@localhost:5432/liber" node --import tsx --test src/db/pool.test.ts`
Expected: PASS (1 test)

- [ ] **Step 4: Delete the order-lifecycle files**

```bash
cd backend
rm -rf src/orders
rm src/routes/orders.ts src/routes/orders.test.ts
```

- [ ] **Step 5: Remove the payment-building functions from `stellar/account.ts`**

Replace the full contents of `backend/src/stellar/account.ts`:

```ts
import {
  Account,
  Asset,
  Horizon,
  Keypair,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

const NETWORK_PASSPHRASE = () => process.env.STELLAR_NETWORK_PASSPHRASE!;
const HORIZON_URL = () => process.env.HORIZON_URL ?? "https://horizon.stellar.org";
const USDC = () => new Asset("USDC", process.env.USDC_ISSUER!);
const BASE_FEE = "10000"; // stroops, generous for mainnet inclusion

function server() {
  return new Horizon.Server(HORIZON_URL());
}

export function buildOnboardingTxFromAccount(
  sourceAccount: Account,
  fundingSecret: string,
  newAccountPublicKey: string,
  startingBalanceXlm: string
): { signedXdr: string } {
  const funding = Keypair.fromSecret(fundingSecret);
  const tx = new TransactionBuilder(sourceAccount, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE() })
    .addOperation(Operation.createAccount({ destination: newAccountPublicKey, startingBalance: startingBalanceXlm }))
    .setTimeout(30)
    .build();
  tx.sign(funding);
  return { signedXdr: tx.toXDR() };
}

export async function buildOnboardingTx(params: {
  fundingSecret: string;
  newAccountPublicKey: string;
  startingBalanceXlm: string;
}): Promise<{ signedXdr: string }> {
  const funding = Keypair.fromSecret(params.fundingSecret);
  const sourceAccount = await server().loadAccount(funding.publicKey());
  return buildOnboardingTxFromAccount(sourceAccount, params.fundingSecret, params.newAccountPublicKey, params.startingBalanceXlm);
}

export function buildTrustlineTxFromAccount(sourceAccount: Account): { unsignedXdr: string } {
  const tx = new TransactionBuilder(sourceAccount, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE() })
    .addOperation(Operation.changeTrust({ asset: USDC() }))
    .setTimeout(30)
    .build();
  return { unsignedXdr: tx.toXDR() };
}

export async function buildTrustlineTx(params: { accountPublicKey: string }): Promise<{ unsignedXdr: string }> {
  const sourceAccount = await server().loadAccount(params.accountPublicKey);
  return buildTrustlineTxFromAccount(sourceAccount);
}

export async function submitStellarTx(signedXdr: string): Promise<{ hash: string }> {
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE());
  const response = await server().submitTransaction(tx);
  return { hash: response.hash };
}
```

- [ ] **Step 6: Remove the payment-building test from `stellar/account.test.ts`**

Replace the full contents of `backend/src/stellar/account.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { Account, Keypair, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { buildOnboardingTxFromAccount, buildTrustlineTxFromAccount } from "./account.js";

test("buildOnboardingTxFromAccount produces a signed createAccount operation with the right starting balance", () => {
  const funding = Keypair.random();
  const newAccount = Keypair.random();
  const sourceAccount = new Account(funding.publicKey(), "100");

  const { signedXdr } = buildOnboardingTxFromAccount(sourceAccount, funding.secret(), newAccount.publicKey(), "1.5");

  const tx = TransactionBuilder.fromXDR(signedXdr, process.env.STELLAR_NETWORK_PASSPHRASE!);
  assert.equal(tx.operations.length, 1);
  const op = tx.operations[0];
  assert.equal(op.type, "createAccount");
  assert.equal((op as any).destination, newAccount.publicKey());
  assert.equal((op as any).startingBalance, "1.5000000");
  assert.equal((tx as Transaction).source, funding.publicKey());
  assert.equal(tx.signatures.length, 1);
});

test("buildTrustlineTxFromAccount produces an unsigned changeTrust operation for USDC", () => {
  const account = Keypair.random();
  const sourceAccount = new Account(account.publicKey(), "100");

  const { unsignedXdr } = buildTrustlineTxFromAccount(sourceAccount);

  const tx = TransactionBuilder.fromXDR(unsignedXdr, process.env.STELLAR_NETWORK_PASSPHRASE!);
  assert.equal(tx.operations.length, 1);
  const op = tx.operations[0] as any;
  assert.equal(op.type, "changeTrust");
  assert.equal(op.line.code, "USDC");
  assert.equal(op.line.issuer, process.env.USDC_ISSUER);
  assert.equal(tx.signatures.length, 0);
});
```

- [ ] **Step 7: Run to verify account tests pass**

Run: `STELLAR_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015" USDC_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN node --import tsx --test src/stellar/account.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 8: Remove `ordersRoute` from `app.ts`**

Replace the full contents of `backend/src/app.ts`:

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { usersRoute } from "./routes/users.js";
import { balanceRoute } from "./routes/balance.js";
import { historyRoute } from "./routes/history.js";

export function createApp() {
  const app = new Hono();
  app.use(
    "*",
    cors({
      origin: (process.env.FRONTEND_ORIGINS ?? "http://localhost:3000").split(","),
    }),
  );
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.route("/", usersRoute);
  app.route("/", balanceRoute);
  app.route("/", historyRoute);
  return app;
}
```

(Tasks 2, 4, and 5 each add one more `app.route(...)` line back in as their routes are built.)

- [ ] **Step 9: Remove treasury/admin vars from `server.ts`'s required list**

Replace the full contents of `backend/src/server.ts`:

```ts
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

// Fail fast on a misconfigured deploy rather than accepting traffic that
// will error out mid-flow. These have no working default.
const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "STELLAR_NETWORK_PASSPHRASE",
  "USDC_ISSUER",
  "FUNDING_SECRET_KEY",
];

const missingEnvVars = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variable(s): ${missingEnvVars.join(", ")}`);
  process.exit(1);
}

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`liber-backend listening on :${info.port}`);
});
```

- [ ] **Step 10: Remove treasury/admin vars from `.env.example`**

Replace the full contents of `backend/.env.example`:

```
DATABASE_URL=postgres://user:password@localhost:5432/liber
PORT=3001
FRONTEND_ORIGINS=http://localhost:3000

STELLAR_NETWORK_PASSPHRASE=Public Global Stellar Network ; September 2015
HORIZON_URL=https://horizon.stellar.org
USDC_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
FUNDING_SECRET_KEY=

COINGECKO_API_URL=https://api.coingecko.com/api/v3
```

- [ ] **Step 11: Run the full backend test suite and typecheck**

Run: `DATABASE_URL="postgres://$(whoami)@localhost:5432/liber" STELLAR_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015" HORIZON_URL=https://horizon.stellar.org USDC_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN FUNDING_SECRET_KEY=SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA npm test`
Expected: the suite mostly passes. `src/routes/history.test.ts`'s 2 tests are EXPECTED to fail here (`relation "orders" does not exist`) — this is the disclosed, known gap this task's brief describes, resolved by Task 6. Every other test file must pass. If anything other than `history.test.ts` fails, stop and investigate before proceeding.

Run: `npm run typecheck`
Expected: clean, no errors (the failing tests above are a runtime/data issue against a real database, not a type error — `history.ts`'s SQL is a plain string, so it still compiles).

- [ ] **Step 12: Commit**

```bash
cd backend
git add -A
git commit -m "Delete order-lifecycle subsystem; add qris_scans/kolo_topups schema"
```

---

### Task 2: Quote route

**Files:**
- Create: `backend/src/routes/quote.ts`
- Create: `backend/src/routes/quote.test.ts`
- Modify: `backend/src/app.ts`

**Interfaces:**
- Consumes: `getQuote` from `backend/src/quote/quote.ts` (unchanged, pre-existing — returns `{ amountUsdc: string, rateIdrPerUsdc: string, expiresAt: Date }`)
- Produces: `POST /quote` — Task 7 (frontend `api.ts`) consumes this exact shape.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/routes/quote.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createQuoteRoute } from "./quote.js";

test("POST /quote returns the converted USDC amount and rate", async () => {
  const app = createQuoteRoute({
    getQuote: async (amountIdr: number) => ({
      amountUsdc: (amountIdr / 16000).toFixed(2),
      rateIdrPerUsdc: "16000",
      expiresAt: new Date("2026-07-15T00:00:30.000Z"),
    }),
  });

  const res = await app.request("/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amountIdr: 32000 }),
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.amountUsdc, "2.00");
  assert.equal(body.rateIdrPerUsdc, "16000");
  assert.equal(body.expiresAt, "2026-07-15T00:00:30.000Z");
});

test("POST /quote returns 400 for a non-positive amountIdr", async () => {
  const app = createQuoteRoute();
  const res = await app.request("/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amountIdr: -5 }),
  });
  assert.equal(res.status, 400);
});

test("POST /quote returns 400 for a non-numeric amountIdr", async () => {
  const app = createQuoteRoute();
  const res = await app.request("/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amountIdr: "abc" }),
  });
  assert.equal(res.status, 400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/routes/quote.test.ts`
Expected: FAIL — `createQuoteRoute is not a function` (module doesn't exist yet)

- [ ] **Step 3: Implement `quote.ts`**

Create `backend/src/routes/quote.ts`:

```ts
// backend/src/routes/quote.ts
import { Hono } from "hono";
import { getQuote as defaultGetQuote } from "../quote/quote.js";

export interface QuoteRouteDeps {
  getQuote: typeof defaultGetQuote;
}

const defaultDeps: QuoteRouteDeps = { getQuote: defaultGetQuote };

export function createQuoteRoute(deps: Partial<QuoteRouteDeps> = {}): Hono {
  const { getQuote } = { ...defaultDeps, ...deps };
  const quoteRoute = new Hono();

  quoteRoute.post("/quote", async (c) => {
    const { amountIdr } = await c.req.json<{ amountIdr: number }>();
    if (!Number.isFinite(amountIdr) || amountIdr <= 0) {
      return c.json({ error: "amountIdr must be a positive number" }, 400);
    }

    const quote = await getQuote(amountIdr);
    return c.json({
      amountUsdc: quote.amountUsdc,
      rateIdrPerUsdc: quote.rateIdrPerUsdc,
      expiresAt: quote.expiresAt,
    });
  });

  return quoteRoute;
}

export const quoteRoute = createQuoteRoute();
```

- [ ] **Step 4: Wire it into `app.ts`**

In `backend/src/app.ts`, add the import and registration:

```ts
import { quoteRoute } from "./routes/quote.js";
```

(alongside the other route imports), and:

```ts
  app.route("/", quoteRoute);
```

(alongside the other `app.route(...)` calls).

- [ ] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test src/routes/quote.test.ts`
Expected: PASS (3 tests)

Also run `npm run typecheck` — expected: clean.

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/routes/quote.ts src/routes/quote.test.ts src/app.ts
git commit -m "Add stateless POST /quote route"
```

---

### Task 3: Kolo-address route on users.ts

**Files:**
- Modify: `backend/src/routes/users.ts`
- Modify: `backend/src/routes/users.test.ts`

**Interfaces:**
- Consumes: `users.kolo_stellar_address` column from Task 1; `StrKey` from `@stellar/stellar-sdk` (already a dependency)
- Produces: `POST /users/:id/kolo-address` — Task 8 (frontend Kolo page) consumes this.

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/routes/users.test.ts` (add the import for `Keypair` to the existing `@stellar/stellar-sdk`-free import list — this file currently has no SDK import, so add a new one):

```ts
import { Keypair } from "@stellar/stellar-sdk";
```

Add these three tests at the end of the file:

```ts
test("POST /users/:id/kolo-address saves a valid Stellar address", async () => {
  const pool = getPool();
  const { rows } = await pool.query(`INSERT INTO users (stellar_public_key) VALUES ($1) RETURNING id`, [
    `GKOLOUSER${Math.random().toString(36).slice(2)}`,
  ]);
  const userId = rows[0].id;
  const koloAddress = Keypair.random().publicKey();

  const app = createUsersRoute();
  const res = await app.request(`/users/${userId}/kolo-address`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ koloStellarAddress: koloAddress }),
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.koloStellarAddress, koloAddress);

  const { rows: check } = await pool.query(`SELECT kolo_stellar_address FROM users WHERE id = $1`, [userId]);
  assert.equal(check[0].kolo_stellar_address, koloAddress);
});

test("POST /users/:id/kolo-address rejects an invalid address", async () => {
  const pool = getPool();
  const { rows } = await pool.query(`INSERT INTO users (stellar_public_key) VALUES ($1) RETURNING id`, [
    `GKOLOUSER${Math.random().toString(36).slice(2)}`,
  ]);
  const userId = rows[0].id;

  const app = createUsersRoute();
  const res = await app.request(`/users/${userId}/kolo-address`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ koloStellarAddress: "not-a-real-address" }),
  });

  assert.equal(res.status, 400);
});

test("POST /users/:id/kolo-address returns 404 for an unknown user", async () => {
  const app = createUsersRoute();
  const res = await app.request("/users/00000000-0000-0000-0000-000000000000/kolo-address", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ koloStellarAddress: Keypair.random().publicKey() }),
  });

  assert.equal(res.status, 404);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL="postgres://$(whoami)@localhost:5432/liber" node --import tsx --test src/routes/users.test.ts`
Expected: the 3 new tests FAIL (route doesn't exist, 404 on all of them from Hono's default not-found handler), existing 3 tests still PASS

- [ ] **Step 3: Add the route to `users.ts`**

In `backend/src/routes/users.ts`, add `StrKey` to the existing `@stellar/stellar-sdk`... actually this file doesn't import from `@stellar/stellar-sdk` directly today (it imports from `../stellar/account.js`). Add a new import line at the top:

```ts
import { StrKey } from "@stellar/stellar-sdk";
```

Then add this route inside `createUsersRoute`, after the existing `/users/:id/confirm-trustline` route and before the `return usersRoute;` line:

```ts
  usersRoute.post("/users/:id/kolo-address", async (c) => {
    const { koloStellarAddress } = await c.req.json<{ koloStellarAddress: string }>();
    if (!StrKey.isValidEd25519PublicKey(koloStellarAddress)) {
      return c.json({ error: "koloStellarAddress must be a valid Stellar public key" }, 400);
    }

    const { rows } = await getPool().query(
      `UPDATE users SET kolo_stellar_address = $2 WHERE id = $1 RETURNING id`,
      [c.req.param("id"), koloStellarAddress]
    );
    if (!rows[0]) return c.json({ error: "user not found" }, 404);

    return c.json({ koloStellarAddress });
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `DATABASE_URL="postgres://$(whoami)@localhost:5432/liber" node --import tsx --test src/routes/users.test.ts`
Expected: PASS (6 tests)

Also run `npm run typecheck` — expected: clean.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/routes/users.ts src/routes/users.test.ts
git commit -m "Add POST /users/:id/kolo-address route"
```

---

### Task 4: Scans log route

**Files:**
- Create: `backend/src/routes/scans.ts`
- Create: `backend/src/routes/scans.test.ts`
- Modify: `backend/src/app.ts`

**Interfaces:**
- Consumes: `qris_scans` table from Task 1
- Produces: `POST /users/:id/scans` — Task 9 (frontend `pay/page.tsx`) consumes this.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/routes/scans.test.ts`:

```ts
// backend/src/routes/scans.test.ts
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { scansRoute } from "./scans.js";

before(async () => {
  await migrate();
});

async function insertTestUser(): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(`INSERT INTO users (stellar_public_key) VALUES ($1) RETURNING id`, [
    `GSCANUSER${Math.random().toString(36).slice(2)}`,
  ]);
  return rows[0].id;
}

test("POST /users/:id/scans logs a scan and returns its id", async () => {
  const userId = await insertTestUser();

  const res = await scansRoute.request(`/users/${userId}/scans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      merchantName: "Warung Kopi Asa",
      merchantCity: "Jakarta",
      amountIdr: "32000",
      amountUsdc: "2.02",
    }),
  });

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.ok(body.id);

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT merchant_name, merchant_city, amount_idr, amount_usdc FROM qris_scans WHERE id = $1`,
    [body.id]
  );
  assert.equal(rows[0].merchant_name, "Warung Kopi Asa");
  assert.equal(rows[0].merchant_city, "Jakarta");
  assert.equal(rows[0].amount_idr, "32000");
  assert.equal(rows[0].amount_usdc, "2.02");
});

test("POST /users/:id/scans returns 404 for an unknown user", async () => {
  const res = await scansRoute.request("/users/00000000-0000-0000-0000-000000000000/scans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ merchantName: "X", merchantCity: "Y", amountIdr: "1000", amountUsdc: "0.06" }),
  });

  assert.equal(res.status, 404);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL="postgres://$(whoami)@localhost:5432/liber" node --import tsx --test src/routes/scans.test.ts`
Expected: FAIL — `scansRoute is not defined` / module doesn't exist

- [ ] **Step 3: Implement `scans.ts`**

Create `backend/src/routes/scans.ts`:

```ts
// backend/src/routes/scans.ts
import { Hono } from "hono";
import { getPool } from "../db/pool.js";

export const scansRoute = new Hono();

scansRoute.post("/users/:id/scans", async (c) => {
  const userId = c.req.param("id");
  const { merchantName, merchantCity, amountIdr, amountUsdc } = await c.req.json<{
    merchantName: string;
    merchantCity: string;
    amountIdr: string;
    amountUsdc: string;
  }>();

  const { rows: userRows } = await getPool().query(`SELECT id FROM users WHERE id = $1`, [userId]);
  if (!userRows[0]) return c.json({ error: "user not found" }, 404);

  const { rows } = await getPool().query(
    `INSERT INTO qris_scans (user_id, merchant_name, merchant_city, amount_idr, amount_usdc)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [userId, merchantName, merchantCity, amountIdr, amountUsdc]
  );

  return c.json({ id: rows[0].id }, 201);
});
```

- [ ] **Step 4: Wire it into `app.ts`**

In `backend/src/app.ts`, add:

```ts
import { scansRoute } from "./routes/scans.js";
```

and:

```ts
  app.route("/", scansRoute);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `DATABASE_URL="postgres://$(whoami)@localhost:5432/liber" node --import tsx --test src/routes/scans.test.ts`
Expected: PASS (2 tests)

Also run `npm run typecheck` — expected: clean.

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/routes/scans.ts src/routes/scans.test.ts src/app.ts
git commit -m "Add POST /users/:id/scans log route"
```

---

### Task 5: Top-up log route

**Files:**
- Create: `backend/src/routes/topups.ts`
- Create: `backend/src/routes/topups.test.ts`
- Modify: `backend/src/app.ts`

**Interfaces:**
- Consumes: `kolo_topups` table from Task 1
- Produces: `POST /users/:id/topups` — Task 8 (frontend Kolo page) consumes this.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/routes/topups.test.ts`:

```ts
// backend/src/routes/topups.test.ts
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { topupsRoute } from "./topups.js";

before(async () => {
  await migrate();
});

async function insertTestUser(): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(`INSERT INTO users (stellar_public_key) VALUES ($1) RETURNING id`, [
    `GTOPUPUSER${Math.random().toString(36).slice(2)}`,
  ]);
  return rows[0].id;
}

test("POST /users/:id/topups logs a top-up and returns its id", async () => {
  const userId = await insertTestUser();

  const res = await topupsRoute.request(`/users/${userId}/topups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amountUsdc: "5.00", stellarTxHash: "hash1" }),
  });

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.ok(body.id);

  const pool = getPool();
  const { rows } = await pool.query(`SELECT amount_usdc, stellar_tx_hash FROM kolo_topups WHERE id = $1`, [body.id]);
  assert.equal(rows[0].amount_usdc, "5.00");
  assert.equal(rows[0].stellar_tx_hash, "hash1");
});

test("POST /users/:id/topups returns 404 for an unknown user", async () => {
  const res = await topupsRoute.request("/users/00000000-0000-0000-0000-000000000000/topups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amountUsdc: "5.00", stellarTxHash: "hash1" }),
  });

  assert.equal(res.status, 404);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL="postgres://$(whoami)@localhost:5432/liber" node --import tsx --test src/routes/topups.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement `topups.ts`**

Create `backend/src/routes/topups.ts`:

```ts
// backend/src/routes/topups.ts
import { Hono } from "hono";
import { getPool } from "../db/pool.js";

export const topupsRoute = new Hono();

topupsRoute.post("/users/:id/topups", async (c) => {
  const userId = c.req.param("id");
  const { amountUsdc, stellarTxHash } = await c.req.json<{ amountUsdc: string; stellarTxHash: string }>();

  const { rows: userRows } = await getPool().query(`SELECT id FROM users WHERE id = $1`, [userId]);
  if (!userRows[0]) return c.json({ error: "user not found" }, 404);

  const { rows } = await getPool().query(
    `INSERT INTO kolo_topups (user_id, amount_usdc, stellar_tx_hash) VALUES ($1, $2, $3) RETURNING id`,
    [userId, amountUsdc, stellarTxHash]
  );

  return c.json({ id: rows[0].id }, 201);
});
```

- [ ] **Step 4: Wire it into `app.ts`**

In `backend/src/app.ts`, add:

```ts
import { topupsRoute } from "./routes/topups.js";
```

and:

```ts
  app.route("/", topupsRoute);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `DATABASE_URL="postgres://$(whoami)@localhost:5432/liber" node --import tsx --test src/routes/topups.test.ts`
Expected: PASS (2 tests)

Also run `npm run typecheck` — expected: clean.

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/routes/topups.ts src/routes/topups.test.ts src/app.ts
git commit -m "Add POST /users/:id/topups log route"
```

---

### Task 6: Rewrite history route (resolves Task 1's disclosed gap)

**Files:**
- Modify: `backend/src/routes/history.ts`
- Modify: `backend/src/routes/history.test.ts`

**Interfaces:**
- Consumes: `qris_scans` and `kolo_topups` tables from Task 1
- Produces: `GET /users/:id/history` returning `{ entries: Array<ScanEntry | TopupEntry> }` sorted newest-first — Task 10 (frontend `history/page.tsx`) consumes this exact shape (`type: "scan" | "topup"` discriminator).

This task resolves the known gap disclosed in Task 1: `history.test.ts` currently fails because it inserts into the now-dropped `orders` table. After this task, the full suite must be 100% green.

- [ ] **Step 1: Rewrite `history.test.ts`**

Replace the full contents of `backend/src/routes/history.test.ts`:

```ts
// backend/src/routes/history.test.ts
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app.js";
import { getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";

before(async () => {
  await migrate();
});

test("GET /users/:id/history returns scans and topups merged, newest first", async () => {
  const pool = getPool();
  const { rows: userRows } = await pool.query(
    `INSERT INTO users (stellar_public_key) VALUES ($1) RETURNING id`,
    [`GHISTORYUSER${Math.random().toString(36).slice(2)}`]
  );
  const userId = userRows[0].id;

  await pool.query(
    `INSERT INTO qris_scans (user_id, merchant_name, merchant_city, amount_idr, amount_usdc, created_at)
     VALUES ($1, 'Warung A', 'Jakarta', 10000, '0.62', now() - interval '2 hour')`,
    [userId]
  );
  await pool.query(
    `INSERT INTO kolo_topups (user_id, amount_usdc, stellar_tx_hash, created_at)
     VALUES ($1, '5.00', 'hash1', now() - interval '1 hour')`,
    [userId]
  );

  const app = createApp();
  const res = await app.request(`/users/${userId}/history`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.entries.length, 2);

  assert.equal(body.entries[0].type, "topup");
  assert.equal(body.entries[0].amountUsdc, "5.00");
  assert.equal(body.entries[0].stellarTxHash, "hash1");
  assert(body.entries[0].createdAt, "createdAt should be present");

  assert.equal(body.entries[1].type, "scan");
  assert.equal(body.entries[1].merchantName, "Warung A");
  assert.equal(body.entries[1].merchantCity, "Jakarta");
  assert.equal(body.entries[1].amountIdr, "10000");
  assert.equal(body.entries[1].amountUsdc, "0.62");
  assert(body.entries[1].createdAt, "createdAt should be present");
});

test("GET /users/:id/history returns 404 for nonexistent user", async () => {
  const app = createApp();
  const res = await app.request("/users/00000000-0000-0000-0000-000000000000/history");
  const body = await res.json();

  assert.equal(res.status, 404);
  assert.equal(body.error, "user not found");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL="postgres://$(whoami)@localhost:5432/liber" node --import tsx --test src/routes/history.test.ts`
Expected: FAIL — 404 on `/users/:id/history` since the route still only serves `/users/:id/orders`

- [ ] **Step 3: Rewrite `history.ts`**

Replace the full contents of `backend/src/routes/history.ts`:

```ts
// backend/src/routes/history.ts
import { Hono } from "hono";
import { getPool } from "../db/pool.js";

export const historyRoute = new Hono();

historyRoute.get("/users/:id/history", async (c) => {
  const userId = c.req.param("id");

  const { rows: userRows } = await getPool().query(`SELECT id FROM users WHERE id = $1`, [userId]);
  if (!userRows[0]) return c.json({ error: "user not found" }, 404);

  const [{ rows: scans }, { rows: topups }] = await Promise.all([
    getPool().query(
      `SELECT id, merchant_name, merchant_city, amount_idr, amount_usdc, created_at
       FROM qris_scans WHERE user_id = $1`,
      [userId]
    ),
    getPool().query(
      `SELECT id, amount_usdc, stellar_tx_hash, created_at
       FROM kolo_topups WHERE user_id = $1`,
      [userId]
    ),
  ]);

  const entries = [
    ...scans.map((r) => ({
      type: "scan" as const,
      id: r.id,
      merchantName: r.merchant_name,
      merchantCity: r.merchant_city,
      amountIdr: r.amount_idr,
      amountUsdc: r.amount_usdc,
      createdAt: r.created_at,
    })),
    ...topups.map((r) => ({
      type: "topup" as const,
      id: r.id,
      amountUsdc: r.amount_usdc,
      stellarTxHash: r.stellar_tx_hash,
      createdAt: r.created_at,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return c.json({ entries });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `DATABASE_URL="postgres://$(whoami)@localhost:5432/liber" node --import tsx --test src/routes/history.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the FULL backend test suite — must be 100% green**

Run: `DATABASE_URL="postgres://$(whoami)@localhost:5432/liber" STELLAR_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015" HORIZON_URL=https://horizon.stellar.org USDC_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN FUNDING_SECRET_KEY=SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA npm test`
Expected: 100% pass, zero failures — this resolves Task 1's disclosed gap; there should be nothing outstanding after this task.

Run: `npm run typecheck`
Expected: clean, zero errors.

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/routes/history.ts src/routes/history.test.ts
git commit -m "Rewrite history route to merge qris_scans and kolo_topups"
```

---

### Task 7: Frontend API contract rewrite

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/api.test.ts`

**Interfaces:**
- Consumes: `POST /quote`, `POST /users/:id/kolo-address`, `POST /users/:id/scans`, `POST /users/:id/topups`, `GET /users/:id/history` (Tasks 2-6)
- Produces: `Quote`, `HistoryEntry` types and `getQuote`, `saveKoloAddress`, `logScan`, `logTopup`, `getHistory` functions — Tasks 8, 9, 10 consume these.

- [ ] **Step 1: Rewrite `api.ts`**

Replace the full contents of `frontend/src/lib/api.ts`:

```ts
export interface CreateUserRequest {
  stellarPublicKey: string;
}

export interface Quote {
  amountUsdc: string;
  rateIdrPerUsdc: string;
  expiresAt: string;
}

export interface HistoryEntry {
  type: "scan" | "topup";
  id: string;
  createdAt: string;
  merchantName?: string;
  merchantCity?: string;
  amountIdr?: string;
  amountUsdc?: string;
  stellarTxHash?: string;
}

function baseUrl(override?: string): string {
  return override ?? process.env.NEXT_PUBLIC_BACKEND_URL!;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const message = await res
    .json()
    .then((body) => body.error)
    .catch(() => null);
  return message ?? fallback;
}

async function postJson<T>(path: string, body: unknown, fetchImpl: typeof fetch, base: string): Promise<T> {
  const res = await fetchImpl(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessage(res, `${path} failed: ${res.status}`));
  return res.json() as Promise<T>;
}

export async function createUser(
  req: CreateUserRequest,
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<{ userId: string; unsignedTrustlineXdr: string }> {
  return postJson("/users", req, fetchImpl, base);
}

export async function confirmTrustline(
  userId: string,
  signedXdr: string,
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<{ ready: boolean }> {
  return postJson(`/users/${userId}/confirm-trustline`, { signedXdr }, fetchImpl, base);
}

export async function getQuote(
  amountIdr: number,
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<Quote> {
  return postJson("/quote", { amountIdr }, fetchImpl, base);
}

export async function saveKoloAddress(
  userId: string,
  koloStellarAddress: string,
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<{ koloStellarAddress: string }> {
  return postJson(`/users/${userId}/kolo-address`, { koloStellarAddress }, fetchImpl, base);
}

export async function logScan(
  userId: string,
  scan: { merchantName: string; merchantCity: string; amountIdr: string; amountUsdc: string },
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<{ id: string }> {
  return postJson(`/users/${userId}/scans`, scan, fetchImpl, base);
}

export async function logTopup(
  userId: string,
  topup: { amountUsdc: string; stellarTxHash: string },
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<{ id: string }> {
  return postJson(`/users/${userId}/topups`, topup, fetchImpl, base);
}

export async function getBalance(
  userId: string,
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<{ usdcBalance: string; idrEstimate: string }> {
  const res = await fetchImpl(`${base}/users/${userId}/balance`);
  if (!res.ok) throw new Error(await errorMessage(res, `getBalance failed: ${res.status}`));
  return res.json();
}

export async function getHistory(
  userId: string,
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<HistoryEntry[]> {
  const res = await fetchImpl(`${base}/users/${userId}/history`);
  if (!res.ok) throw new Error(await errorMessage(res, `getHistory failed: ${res.status}`));
  const body = (await res.json()) as { entries: HistoryEntry[] };
  return body.entries;
}
```

- [ ] **Step 2: Rewrite `api.test.ts`**

Replace the full contents of `frontend/src/lib/api.test.ts`:

```ts
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { getQuote, saveKoloAddress, logScan, logTopup, getHistory } from "./api.js";

test("getQuote posts the IDR amount and returns the parsed quote", async () => {
  const fakeFetch = mock.fn(async (url: string, init: RequestInit) => {
    assert.equal(url, "http://backend.test/quote");
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body as string), { amountIdr: 32000 });
    return new Response(
      JSON.stringify({ amountUsdc: "2.02", rateIdrPerUsdc: "16000", expiresAt: "2026-07-15T00:00:30.000Z" }),
      { status: 200 }
    );
  });

  const result = await getQuote(32000, fakeFetch as typeof fetch, "http://backend.test");

  assert.equal(result.amountUsdc, "2.02");
  assert.equal(result.rateIdrPerUsdc, "16000");
});

test("getQuote surfaces the backend's error message on a non-OK response", async () => {
  const fakeFetch = mock.fn(async () => {
    return new Response(JSON.stringify({ error: "amountIdr must be a positive number" }), { status: 400 });
  });

  await assert.rejects(getQuote(-5, fakeFetch as typeof fetch, "http://backend.test"), (err: Error) => {
    assert.equal(err.message, "amountIdr must be a positive number");
    return true;
  });
});

test("saveKoloAddress posts the address and returns it", async () => {
  const fakeFetch = mock.fn(async (url: string, init: RequestInit) => {
    assert.equal(url, "http://backend.test/users/u1/kolo-address");
    assert.deepEqual(JSON.parse(init.body as string), { koloStellarAddress: "GKOLO..." });
    return new Response(JSON.stringify({ koloStellarAddress: "GKOLO..." }), { status: 200 });
  });

  const result = await saveKoloAddress("u1", "GKOLO...", fakeFetch as typeof fetch, "http://backend.test");
  assert.equal(result.koloStellarAddress, "GKOLO...");
});

test("logScan posts the scan details", async () => {
  const fakeFetch = mock.fn(async (url: string, init: RequestInit) => {
    assert.equal(url, "http://backend.test/users/u1/scans");
    assert.deepEqual(JSON.parse(init.body as string), {
      merchantName: "Warung Kopi Asa",
      merchantCity: "Jakarta",
      amountIdr: "32000",
      amountUsdc: "2.02",
    });
    return new Response(JSON.stringify({ id: "s1" }), { status: 201 });
  });

  const result = await logScan(
    "u1",
    { merchantName: "Warung Kopi Asa", merchantCity: "Jakarta", amountIdr: "32000", amountUsdc: "2.02" },
    fakeFetch as typeof fetch,
    "http://backend.test"
  );
  assert.equal(result.id, "s1");
});

test("logTopup posts the topup details", async () => {
  const fakeFetch = mock.fn(async (url: string, init: RequestInit) => {
    assert.equal(url, "http://backend.test/users/u1/topups");
    assert.deepEqual(JSON.parse(init.body as string), { amountUsdc: "5.00", stellarTxHash: "hash1" });
    return new Response(JSON.stringify({ id: "t1" }), { status: 201 });
  });

  const result = await logTopup(
    "u1",
    { amountUsdc: "5.00", stellarTxHash: "hash1" },
    fakeFetch as typeof fetch,
    "http://backend.test"
  );
  assert.equal(result.id, "t1");
});

test("getHistory returns the merged entries list", async () => {
  const fakeFetch = mock.fn(async (url: string) => {
    assert.equal(url, "http://backend.test/users/u1/history");
    return new Response(
      JSON.stringify({
        entries: [
          { type: "topup", id: "t1", amountUsdc: "5.00", stellarTxHash: "hash1", createdAt: "2026-07-15T01:00:00.000Z" },
          { type: "scan", id: "s1", merchantName: "Warung Kopi Asa", merchantCity: "Jakarta", amountIdr: "32000", amountUsdc: "2.02", createdAt: "2026-07-15T00:00:00.000Z" },
        ],
      }),
      { status: 200 }
    );
  });

  const result = await getHistory("u1", fakeFetch as typeof fetch, "http://backend.test");
  assert.equal(result.length, 2);
  assert.equal(result[0].type, "topup");
  assert.equal(result[1].type, "scan");
});

test("getHistory surfaces the backend's error message on a non-OK response", async () => {
  const fakeFetch = mock.fn(async () => {
    return new Response(JSON.stringify({ error: "user not found" }), { status: 404 });
  });

  await assert.rejects(getHistory("u1", fakeFetch as typeof fetch, "http://backend.test"), (err: Error) => {
    assert.equal(err.message, "user not found");
    return true;
  });
});
```

- [ ] **Step 3: Run to verify the tests pass**

Run (from `frontend/`): `npm test`
Expected: PASS (all tests). Note: `createUser`/`confirmTrustline`/`getBalance` have no dedicated tests in this file (they didn't before either) — that's expected, unchanged from before this task.

- [ ] **Step 4: Confirm other files that import the removed exports don't typecheck yet — expected**

Run: `npx tsc --noEmit`
Expected: several errors in `pay/page.tsx`, `pay/[orderId]/page.tsx`, `OrderStatus.tsx`, `QuoteCard.tsx`, `history/page.tsx` — all of them import `OrderQuote`, `OrderStatus`, `createOrder`, `approveOrder`, `getOrder`, or `getOrderHistory`, which this task removed. This is expected and disclosed: Tasks 9 and 10 rewrite those files to use the new exports. Confirm the errors are confined to those files and `api.ts`/`api.test.ts` themselves are clean.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/lib/api.ts src/lib/api.test.ts
git commit -m "Rewrite api.ts for the Kolo-routing contract"
```

---

### Task 8: Kolo page (connect + top up)

**Files:**
- Create: `frontend/src/lib/wallet/topup.ts`
- Create: `frontend/src/lib/wallet/topup.test.ts`
- Create: `frontend/src/app/kolo/page.tsx`
- Modify: `frontend/.env.local.example`

**Interfaces:**
- Consumes: `saveKoloAddress`, `logTopup` from `frontend/src/lib/api.ts` (Task 7); `getOrCreateWallet`, `LocalStorageWalletStorage` from `frontend/src/lib/wallet/storage.ts` (unchanged); `signXdr` from `frontend/src/lib/wallet/keypair.ts` (unchanged, reused for signing exactly like every other signing flow in this app); `QrScanner` from `frontend/src/components/QrScanner.tsx` (unchanged, reused as-is — it just returns whatever text the camera decodes, so it works for a plain Stellar address QR the same way it works for a QRIS payload)
- Produces: `buildTopUpTx` — nothing else in this plan consumes it, but it's the pure, independently-testable piece of the top-up flow (mirrors the old backend `buildPaymentTxFromAccount` that Task 1 deleted, now living client-side). Task 11 (home page) links to `/kolo`.

- [ ] **Step 1: Add `NEXT_PUBLIC_HORIZON_URL` to `.env.local.example`**

Replace the full contents of `frontend/.env.local.example`:

```
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_HORIZON_URL=https://horizon.stellar.org
```

- [ ] **Step 2: Write the failing test for the pure transaction-building function**

Create `frontend/src/lib/wallet/topup.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { Account, Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { buildTopUpTx } from "./topup.js";

const NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

test("buildTopUpTx produces an unsigned USDC payment to the destination", () => {
  const source = Keypair.random();
  const destination = Keypair.random();
  const sourceAccount = new Account(source.publicKey(), "100");

  const { unsignedXdr } = buildTopUpTx(sourceAccount, {
    destinationPublicKey: destination.publicKey(),
    amountUsdc: "5.00",
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  const tx = TransactionBuilder.fromXDR(unsignedXdr, NETWORK_PASSPHRASE);
  assert.equal(tx.operations.length, 1);
  const op = tx.operations[0] as any;
  assert.equal(op.type, "payment");
  assert.equal(op.destination, destination.publicKey());
  assert.equal(op.asset.code, "USDC");
  assert.equal(op.asset.issuer, USDC_ISSUER);
  assert.equal(op.amount, "5.0000000");
  assert.equal(tx.signatures.length, 0);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run (from `frontend/`): `node --import tsx --test src/lib/wallet/topup.test.ts`
Expected: FAIL — `buildTopUpTx is not a function` (module doesn't exist yet)

- [ ] **Step 4: Implement `topup.ts`**

Create `frontend/src/lib/wallet/topup.ts`:

```ts
import { Account, Asset, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const BASE_FEE = "10000"; // stroops, generous for mainnet inclusion

export function buildTopUpTx(
  sourceAccount: Account,
  params: { destinationPublicKey: string; amountUsdc: string; networkPassphrase: string }
): { unsignedXdr: string } {
  const tx = new TransactionBuilder(sourceAccount, { fee: BASE_FEE, networkPassphrase: params.networkPassphrase })
    .addOperation(
      Operation.payment({
        destination: params.destinationPublicKey,
        asset: new Asset("USDC", USDC_ISSUER),
        amount: params.amountUsdc,
      })
    )
    .setTimeout(30)
    .build();
  return { unsignedXdr: tx.toXDR() };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test src/lib/wallet/topup.test.ts`
Expected: PASS (1 test)

- [ ] **Step 6: Create the Kolo page, using `buildTopUpTx` + the existing `signXdr` helper**

Create `frontend/src/app/kolo/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { StrKey, Horizon, TransactionBuilder } from "@stellar/stellar-sdk";
import { PageShell } from "@/components/ui/PageShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { QrScanner } from "@/components/QrScanner";
import { getOrCreateWallet, LocalStorageWalletStorage } from "@/lib/wallet/storage";
import { signXdr } from "@/lib/wallet/keypair";
import { buildTopUpTx } from "@/lib/wallet/topup";
import { saveKoloAddress, logTopup } from "@/lib/api";

const NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const KOLO_ADDRESS_KEY = "liber:koloAddress";

export default function KoloPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [koloAddress, setKoloAddress] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [addressInput, setAddressInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setUserId(window.localStorage.getItem("liber:userId"));
    setKoloAddress(window.localStorage.getItem(KOLO_ADDRESS_KEY));
  }, []);

  async function handleConnect(address: string) {
    setError(null);
    if (!StrKey.isValidEd25519PublicKey(address)) {
      setError("Alamat Kolo tidak valid. Pastikan ini alamat Stellar (diawali G).");
      return;
    }
    if (!userId) return;

    setSubmitting(true);
    try {
      await saveKoloAddress(userId, address);
      window.localStorage.setItem(KOLO_ADDRESS_KEY, address);
      setKoloAddress(address);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTopUp() {
    setError(null);
    setSuccess(null);
    const amountUsdc = Number(amountInput);
    if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
      setError("Nominal tidak valid. Masukkan angka lebih dari 0.");
      return;
    }
    if (!userId || !koloAddress) return;

    setSubmitting(true);
    try {
      const wallet = await getOrCreateWallet(new LocalStorageWalletStorage());
      const horizonUrl = process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon.stellar.org";
      const server = new Horizon.Server(horizonUrl);
      const sourceAccount = await server.loadAccount(wallet.publicKey);

      const { unsignedXdr } = buildTopUpTx(sourceAccount, {
        destinationPublicKey: koloAddress,
        amountUsdc: amountUsdc.toFixed(2),
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      const signedXdr = signXdr(wallet.secretKey, unsignedXdr, NETWORK_PASSPHRASE);
      const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
      const response = await server.submitTransaction(tx);

      await logTopup(userId, { amountUsdc: amountUsdc.toFixed(2), stellarTxHash: response.hash });
      setSuccess(`Berhasil kirim ${amountUsdc.toFixed(2)} USDC ke Kolo.`);
      setAmountInput("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!userId) return null;

  return (
    <PageShell>
      <h1 className="font-display text-2xl italic text-ink">Kolo</h1>

      {!koloAddress ? (
        <Card className="mt-6 flex flex-col gap-4">
          <p className="text-sm text-ink/60">
            Hubungkan alamat Stellar dari akun Kolo kamu. USDC yang kamu kirim ke situ bisa langsung dibelanjakan lewat kartu Kolo yang di-link ke GoPay.
          </p>
          {scanning ? (
            <QrScanner
              onScan={(text) => {
                setScanning(false);
                handleConnect(text);
              }}
              onError={setError}
            />
          ) : (
            <>
              <input
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                placeholder="Alamat Stellar Kolo (G...)"
                className="w-full rounded-2xl bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink/40 outline-none ring-1 ring-transparent focus:ring-emerald"
              />
              <Button onClick={() => handleConnect(addressInput)} disabled={submitting || !addressInput}>
                {submitting ? "Menghubungkan..." : "Hubungkan"}
              </Button>
              <Button variant="ghost" onClick={() => setScanning(true)}>
                Scan QR Kolo
              </Button>
            </>
          )}
        </Card>
      ) : (
        <Card className="mt-6 flex flex-col gap-4">
          <p className="text-xs text-ink/50">Terhubung ke Kolo</p>
          <p className="break-all font-mono text-xs text-ink/70">{koloAddress}</p>
          <input
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="Jumlah USDC"
            inputMode="decimal"
            className="w-full rounded-2xl bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink/40 outline-none ring-1 ring-transparent focus:ring-emerald"
          />
          <Button onClick={handleTopUp} disabled={submitting || !amountInput}>
            {submitting ? "Mengirim..." : "Top up Kolo"}
          </Button>
        </Card>
      )}

      {error && <p className="mt-4 text-center text-sm text-rose">{error}</p>}
      {success && <p className="mt-4 text-center text-sm text-emerald">{success}</p>}
    </PageShell>
  );
}
```

- [ ] **Step 7: Run typecheck**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: no NEW errors introduced by these files (the pre-existing errors from Task 7's step 4, in `pay/page.tsx` etc., are still there and still expected — Tasks 9/10 resolve those).

- [ ] **Step 8: Visually verify**

Run `npm run dev`, open `http://localhost:3000/kolo` with a fake `liber:userId` set in localStorage (e.g. via devtools console: `localStorage.setItem("liber:userId", "test")`).
Expected: the "connect" card renders (input, Hubungkan button, Scan QR Kolo button), no console errors on load.

- [ ] **Step 9: Commit**

```bash
cd frontend
git add src/lib/wallet/topup.ts src/lib/wallet/topup.test.ts src/app/kolo/page.tsx .env.local.example
git commit -m "Add Kolo connect + top-up page with testable tx-building"
```

---

### Task 9: Rewrite pay/page.tsx and QuoteCard.tsx; delete the order-approval page

**Files:**
- Modify: `frontend/src/app/pay/page.tsx`
- Modify: `frontend/src/components/QuoteCard.tsx`
- Delete: `frontend/src/app/pay/[orderId]/page.tsx` (entire `[orderId]` directory)
- Delete: `frontend/src/components/OrderStatus.tsx`

**Interfaces:**
- Consumes: `getQuote`, `logScan`, `Quote` from `frontend/src/lib/api.ts` (Task 7); `parseQRIS` from `frontend/src/lib/qris/parser.ts` (unchanged); `QrScanner` (unchanged)
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Rewrite `QuoteCard.tsx`**

Replace the full contents of `frontend/src/components/QuoteCard.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { Quote } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const QUOTE_WINDOW_SECONDS = 30;

export function QuoteCard({
  merchantName,
  merchantCity,
  amountIdr,
  quote,
}: {
  merchantName: string;
  merchantCity: string;
  amountIdr: string;
  quote: Quote;
}) {
  const [secondsLeft, setSecondsLeft] = useState(QUOTE_WINDOW_SECONDS);

  useEffect(() => {
    const expiresAt = new Date(quote.expiresAt).getTime();
    const interval = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
    }, 500);
    return () => clearInterval(interval);
  }, [quote.expiresAt]);

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-ink/50">
          {merchantName} &middot; {merchantCity}
        </p>
        <p className="mt-2 font-display text-4xl italic text-ink tabular-nums">
          Rp {Number(amountIdr).toLocaleString("id-ID")}
        </p>
        <p className="mt-1 text-sm text-ink/60 tabular-nums">setara {quote.amountUsdc} USDC</p>
      </div>

      <div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
          <div
            className="h-full rounded-full bg-emerald transition-[width] duration-500"
            style={{ width: `${(secondsLeft / QUOTE_WINDOW_SECONDS) * 100}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-ink/40">Kurs berlaku {secondsLeft} detik lagi</p>
      </div>

      <a href="gojek://gopay" className="w-full">
        <Button>Buka GoPay</Button>
      </a>
      <p className="text-center text-xs text-ink/40">
        Scan QRIS yang sama di GoPay, lalu bayar pakai kartu Kolo yang sudah kamu link.
      </p>
    </Card>
  );
}
```

- [ ] **Step 2: Rewrite `pay/page.tsx`**

Replace the full contents of `frontend/src/app/pay/page.tsx`:

```tsx
"use client";

import { useCallback, useState } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { QrScanner } from "@/components/QrScanner";
import { QuoteCard } from "@/components/QuoteCard";
import { parseQRIS } from "@/lib/qris/parser";
import { getQuote, logScan, type Quote } from "@/lib/api";

export default function PayPage() {
  const [merchant, setMerchant] = useState<{ name: string; city: string; amountIdr: string } | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleScan = useCallback(async (qrContent: string) => {
    try {
      const parsed = parseQRIS(qrContent);
      const userId = window.localStorage.getItem("liber:userId");
      if (!userId) throw new Error("Belum onboarding. Buka /onboarding dulu.");

      let amountIdr: number;
      if (parsed.amount) {
        amountIdr = Number(parsed.amount);
      } else {
        const input = window.prompt(`Nominal untuk ${parsed.merchantName} (Rp)`);
        if (!input) return;
        amountIdr = Number(input);
        if (!Number.isFinite(amountIdr) || amountIdr <= 0) {
          setError("Nominal tidak valid. Masukkan angka lebih dari 0.");
          return;
        }
      }

      const result = await getQuote(amountIdr);
      setMerchant({ name: parsed.merchantName, city: parsed.merchantCity, amountIdr: amountIdr.toString() });
      setQuote(result);

      logScan(userId, {
        merchantName: parsed.merchantName,
        merchantCity: parsed.merchantCity,
        amountIdr: amountIdr.toString(),
        amountUsdc: result.amountUsdc,
      }).catch((err) => console.error("failed to log scan", err));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  return (
    <PageShell>
      <h1 className="font-display text-2xl italic text-ink">Scan QRIS</h1>
      <div className="mt-6">
        {!quote && <QrScanner onScan={handleScan} onError={setError} />}
        {error && <p className="mt-4 text-center text-sm text-rose">{error}</p>}
        {quote && merchant && (
          <QuoteCard merchantName={merchant.name} merchantCity={merchant.city} amountIdr={merchant.amountIdr} quote={quote} />
        )}
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 3: Delete the order-approval page and `OrderStatus.tsx`**

```bash
cd frontend
rm -rf "src/app/pay/[orderId]"
rm src/components/OrderStatus.tsx
```

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: the errors from `pay/page.tsx` and `QuoteCard.tsx` (present since Task 7) are gone. Remaining errors should be confined to `history/page.tsx` only (Task 10's job).

- [ ] **Step 5: Visually verify**

Run `npm run dev`, open `http://localhost:3000/pay` with a fake `liber:userId` in localStorage.
Expected: camera scanner renders with no console errors. (Full scan-to-quote flow needs a real backend + real QRIS code to verify end to end — confirm at minimum that the page renders without crashing and the scanner initializes.)

- [ ] **Step 6: Commit**

```bash
cd frontend
git add -A
git commit -m "Rewrite pay page for Kolo/GoPay handoff; remove order-approval flow"
```

---

### Task 10: Rewrite history page and StatusPill

**Files:**
- Modify: `frontend/src/app/history/page.tsx`
- Modify: `frontend/src/components/ui/StatusPill.tsx`

**Interfaces:**
- Consumes: `getHistory`, `HistoryEntry` from `frontend/src/lib/api.ts` (Task 7)
- Produces: nothing consumed by later tasks.

This task resolves the last typecheck errors remaining from Task 7 (Step 4) and Task 9 (Step 4) — after this task, `npx tsc --noEmit` must be fully clean.

- [ ] **Step 1: Rewrite `StatusPill.tsx`**

Replace the full contents of `frontend/src/components/ui/StatusPill.tsx`:

```tsx
const STYLES: Record<string, string> = {
  scan: "bg-ink/5 text-ink/60",
  topup: "bg-emerald/15 text-emerald-deep",
};

export function StatusPill({ state, label }: { state: string; label: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${STYLES[state] ?? STYLES.scan}`}>
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Rewrite `history/page.tsx`**

Replace the full contents of `frontend/src/app/history/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { getHistory, type HistoryEntry } from "@/lib/api";

function truncateHash(hash: string): string {
  return hash.length > 14 ? `${hash.slice(0, 8)}...${hash.slice(-6)}` : hash;
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    const userId = window.localStorage.getItem("liber:userId");
    if (userId) {
      getHistory(userId)
        .then(setEntries)
        .catch(() => setEntries([]));
    }
  }, []);

  return (
    <PageShell>
      <h1 className="font-display text-2xl italic text-ink">Riwayat</h1>

      {!entries && <p className="mt-8 text-center text-sm text-ink/60">Memuat riwayat...</p>}
      {entries?.length === 0 && <p className="mt-8 text-center text-sm text-ink/40">Belum ada aktivitas.</p>}

      <ul className="mt-6 flex flex-col gap-3">
        {entries?.map((entry) => (
          <li key={entry.id}>
            <Card className="flex flex-col gap-2">
              {entry.type === "scan" ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-medium text-ink">{entry.merchantName}</span>
                    <StatusPill state="scan" label="Scan QRIS" />
                  </div>
                  <p className="text-xs text-ink/50">{entry.merchantCity}</p>
                  <p className="text-sm tabular-nums text-ink/80">
                    Rp {Number(entry.amountIdr).toLocaleString("id-ID")} &middot; {entry.amountUsdc} USDC
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-medium text-ink">Top up Kolo</span>
                    <StatusPill state="topup" label="Terkirim" />
                  </div>
                  <p className="text-sm tabular-nums text-ink/80">{entry.amountUsdc} USDC</p>
                  {entry.stellarTxHash && (
                    <p className="font-mono text-xs text-ink/40">Tx: {truncateHash(entry.stellarTxHash)}</p>
                  )}
                </>
              )}
              <p className="text-xs text-ink/30">{new Date(entry.createdAt).toLocaleString("id-ID")}</p>
            </Card>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
```

- [ ] **Step 3: Run the full frontend test suite and typecheck — must be fully clean**

Run: `npm test`
Expected: PASS (all tests).

Run: `npx tsc --noEmit`
Expected: fully clean, zero errors anywhere. This resolves every disclosed gap from Tasks 7 and 9.

- [ ] **Step 4: Visually verify**

Run `npm run dev`, open `http://localhost:3000/history` with a fake `liber:userId` in localStorage.
Expected: "Belum ada aktivitas." renders (empty state) since there's no real backend data for this fake user, no console errors.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/app/history/page.tsx src/components/ui/StatusPill.tsx
git commit -m "Rewrite history page for merged scan/topup entries"
```

---

### Task 11: Home page — add Kolo link

**Files:**
- Modify: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: nothing consumed elsewhere — final task in this plan.

- [ ] **Step 1: Add a link to `/kolo`**

In `frontend/src/app/page.tsx`, find this block:

```tsx
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Link
          href="/pay"
          className="flex flex-col items-center justify-center gap-2 rounded-3xl bg-gold p-5 text-center font-semibold text-ink shadow-[0_12px_30px_-12px_rgba(231,163,58,0.65)]"
        >
          Scan QRIS
        </Link>
        <Link
          href="/receive"
          className="flex flex-col items-center justify-center gap-2 rounded-3xl border border-ink/15 p-5 text-center font-semibold text-ink"
        >
          Terima USDC
        </Link>
      </div>

      <Link href="/history" className="mt-6 text-center text-sm text-ink/50 underline underline-offset-4">
        Lihat riwayat transaksi
      </Link>
```

Replace it with:

```tsx
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Link
          href="/pay"
          className="flex flex-col items-center justify-center gap-2 rounded-3xl bg-gold p-5 text-center font-semibold text-ink shadow-[0_12px_30px_-12px_rgba(231,163,58,0.65)]"
        >
          Scan QRIS
        </Link>
        <Link
          href="/receive"
          className="flex flex-col items-center justify-center gap-2 rounded-3xl border border-ink/15 p-5 text-center font-semibold text-ink"
        >
          Terima USDC
        </Link>
      </div>

      <Link
        href="/kolo"
        className="mt-3 flex items-center justify-center gap-2 rounded-3xl border border-ink/15 p-4 text-center text-sm font-semibold text-ink"
      >
        Kelola Kolo
      </Link>

      <Link href="/history" className="mt-6 text-center text-sm text-ink/50 underline underline-offset-4">
        Lihat riwayat transaksi
      </Link>
```

- [ ] **Step 2: Run the full frontend test suite and typecheck**

Run: `npm test`
Expected: PASS (all tests, unchanged count — this task touches no test files).

Run: `npx tsc --noEmit`
Expected: clean, zero errors.

- [ ] **Step 3: Visually verify**

Run `npm run dev`, open `http://localhost:3000/` with a fake `liber:userId` in localStorage.
Expected: "Kelola Kolo" link renders below the Scan QRIS / Terima USDC tiles, above "Lihat riwayat transaksi", navigates to `/kolo` on click.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/app/page.tsx
git commit -m "Add Kolo link to home page"
```

---

## Deployment (after all tasks land)

Both services are already deployed. This ships as a normal redeploy:

```bash
cd backend
railway run --service liber-backend npm run migrate   # applies DROP TABLE orders, new tables/column
railway variable delete TREASURY_PUBLIC_KEY --service liber-backend --json
railway variable delete ADMIN_SECRET --service liber-backend --json
railway up --service liber-backend --detach

cd ../frontend
vercel env add NEXT_PUBLIC_HORIZON_URL production   # https://horizon.stellar.org
vercel deploy --prod --yes
```

No data migration concerns — no real orders exist in production to preserve.
