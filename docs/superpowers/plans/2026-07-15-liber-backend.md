# Liber Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `backend/` service that orchestrates the Liber payment flow — parse a scanned QRIS, quote USDC for an IDR amount, provision a mainnet Stellar account, build/submit the Allbridge bridge transaction, and reconcile IDRX redemption status — exposed as an HTTP API for `frontend/` to call.

**Architecture:** Hono HTTP server on Node.js, plain `pg` client against Postgres (no ORM — two tables), one module per external integration (QRIS parsing, quote/CoinGecko, Stellar account + bridge tx building, IDRX HMAC client), a pure order state machine, and a thin routes layer wiring them together. Frontend never talks to Stellar/Allbridge/IDRX directly — only to this API.

**Tech Stack:** Node.js >=20, TypeScript, Hono + `@hono/node-server`, `pg`, `@stellar/stellar-sdk`, `@allbridge/bridge-core-sdk`, `big.js`. Test runner: Node's built-in `node:test` + `node:assert` (no Jest/Vitest — nothing here needs more than that). Run via `tsx`.

## Global Constraints

- This is `backend/` — a fully standalone project. No root `package.json`, no workspace file, no imports from `../frontend` or `../contracts`. Everything this package needs lives inside it.
- Deploy target: Railway (long-running Node process + Postgres plugin). `npm start` runs the compiled/tsx server; Railway provides `DATABASE_URL` and `PORT` automatically.
- **v1 wallet model:** plain Stellar Ed25519 keypair generated client-side by `frontend/`. This backend NEVER receives or stores a private key — only public keys and signed XDR blobs the frontend already signed. See spec `docs/superpowers/specs/2026-07-15-liber-architecture-design.md` §10.
- **Mainnet only.** Allbridge Core has no testnet route for Stellar↔Base, and IDRX is a production-only API. All Stellar/Allbridge/IDRX integration in this plan targets **Stellar mainnet** and **Base mainnet**. Use tiny real USDC amounts (a few dollars) when manually verifying against live services — never simulate these three externally-owned systems with fakes in a way that hides real integration risk; unit tests mock at the HTTP/SDK call boundary, but at least one manual end-to-end check with real (small) funds is required before demo (tracked in Task 10).
- Network constants (verify against `stellar.expert`/circle.com before first real submission — pin here once confirmed in Task 1):
  - `STELLAR_NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015"`
  - `HORIZON_URL = "https://horizon.stellar.org"`
  - `USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"` (Circle's mainnet USDC issuer on Stellar)
- No ORM, no test framework dependency, no CI config — matches the approved spec's testing approach (unit tests per module + one real integration check).

---

### Task 1: Project scaffold + health check

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/.env.example`
- Create: `backend/.gitignore`
- Create: `backend/src/server.ts`
- Test: `backend/src/server.test.ts`

**Interfaces:**
- Produces: an HTTP server exported as `createApp(): Hono` from `backend/src/app.ts`, and a `GET /health` route returning `{ status: "ok" }`. Later tasks mount their routes onto this same `Hono` instance.

- [ ] **Step 1: Write package.json**

```json
{
  "name": "liber-backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "test": "node --import tsx --test $(find src -name '*.test.ts')",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@allbridge/bridge-core-sdk": "^2.36.0",
    "@hono/node-server": "^1.13.0",
    "@stellar/stellar-sdk": "^13.0.0",
    "big.js": "^6.2.1",
    "hono": "^4.6.0",
    "pg": "^8.13.0"
  },
  "devDependencies": {
    "@types/big.js": "^6.2.2",
    "@types/node": "^22.0.0",
    "@types/pg": "^8.11.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write .env.example and .gitignore**

```bash
# backend/.env.example
DATABASE_URL=postgres://user:password@localhost:5432/liber
PORT=3001

STELLAR_NETWORK_PASSPHRASE=Public Global Stellar Network ; September 2015
HORIZON_URL=https://horizon.stellar.org
STELLAR_RPC_URL=https://mainnet.sorobanrpc.com
USDC_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
FUNDING_SECRET_KEY=

IDRX_BASE_URL=https://idrx.co
IDRX_API_KEY=
IDRX_API_SECRET=

COINGECKO_API_URL=https://api.coingecko.com/api/v3
```

```
# backend/.gitignore
node_modules/
dist/
.env
```

- [ ] **Step 4: Write the failing test**

```typescript
// backend/src/server.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";

test("GET /health returns ok", async () => {
  const app = createApp();
  const res = await app.request("/health");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd backend && npm install && npm test`
Expected: FAIL with "Cannot find module './app.js'"

- [ ] **Step 6: Write app.ts and server.ts**

```typescript
// backend/src/app.ts
import { Hono } from "hono";

export function createApp() {
  const app = new Hono();
  app.get("/health", (c) => c.json({ status: "ok" }));
  return app;
}
```

```typescript
// backend/src/server.ts
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`liber-backend listening on :${info.port}`);
});
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test`
Expected: PASS (1 test)

- [ ] **Step 8: Commit**

```bash
git add backend/
git commit -m "Scaffold backend: Hono server + health check"
```

---

### Task 2: Database schema + connection module

**Files:**
- Create: `backend/src/db/schema.sql`
- Create: `backend/src/db/pool.ts`
- Create: `backend/src/db/migrate.ts`
- Test: `backend/src/db/pool.test.ts`

**Interfaces:**
- Produces: `getPool(): pg.Pool` (singleton, reads `DATABASE_URL`), and the `users`/`orders` tables. Task 10's routes and Task 5's state machine persistence both depend on the exact column names below.

- [ ] **Step 1: Write schema.sql**

```sql
-- backend/src/db/schema.sql
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stellar_public_key TEXT NOT NULL UNIQUE,
  idrx_user_id INTEGER,
  idrx_api_key TEXT,
  idrx_api_secret TEXT,
  idrx_deposit_address TEXT,
  provider TEXT NOT NULL DEFAULT 'other',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  qr_content TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  merchant_city TEXT NOT NULL,
  amount_idr NUMERIC NOT NULL,
  amount_usdc NUMERIC,
  quote_rate NUMERIC,
  quote_expires_at TIMESTAMPTZ,
  state TEXT NOT NULL DEFAULT 'scanned',
  from_account_address TEXT NOT NULL,
  stellar_tx_hash TEXT,
  bridge_status TEXT,
  idrx_merchant_order_id TEXT,
  idrx_status TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_user_id_idx ON orders(user_id);
```

- [ ] **Step 2: Write pool.ts**

```typescript
// backend/src/db/pool.ts
import pg from "pg";

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}
```

- [ ] **Step 3: Write migrate.ts (run once on deploy)**

```typescript
// backend/src/db/migrate.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getPool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  const sql = readFileSync(join(__dirname, "schema.sql"), "utf-8");
  await getPool().query(sql);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await migrate();
  console.log("migration complete");
  process.exit(0);
}
```

Add to `package.json` scripts: `"migrate": "tsx src/db/migrate.ts"`.

- [ ] **Step 4: Write the failing test**

Requires a real Postgres reachable via `DATABASE_URL` (Railway Postgres, or local `postgres://localhost/liber` for dev). This is an integration test against a real (disposable) database, not mocked — schema correctness can't be verified against a fake.

```typescript
// backend/src/db/pool.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { getPool } from "./pool.js";
import { migrate } from "./migrate.js";

test("migrate creates users and orders tables", async () => {
  await migrate();
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('users', 'orders')`
  );
  assert.equal(rows.length, 2);
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `createdb liber && DATABASE_URL=postgres://localhost/liber npm test -- src/db/pool.test.ts`
Expected: FAIL (tables don't exist yet, or module missing) before Step 2/3 exist — run this after writing Steps 2-3 to confirm it currently fails only because `migrate()` hasn't run, then proceed.

- [ ] **Step 6: Run test to verify it passes**

Run: `DATABASE_URL=postgres://localhost/liber npm test -- src/db/pool.test.ts`
Expected: PASS (2 rows returned)

- [ ] **Step 7: Commit**

```bash
git add backend/src/db/
git commit -m "Add users/orders schema + pg connection pool"
```

---

### Task 3: QRIS parser module (ported from qris-dinamis, MIT licensed)

**Files:**
- Create: `backend/src/qris/types.ts`
- Create: `backend/src/qris/crc16.ts`
- Create: `backend/src/qris/parser.ts`
- Test: `backend/src/qris/parser.test.ts`

**Interfaces:**
- Produces: `parseQRIS(qrisString: string): QRISData` where `QRISData` has `merchantName: string`, `merchantCity: string`, `method: "static" | "dynamic"`, `amount?: string`, `currency: string`, `countryCode: string`. Task 10's order-creation route calls this directly on the raw scanned string.

- [ ] **Step 1: Write types.ts**

```typescript
// backend/src/qris/types.ts
export interface TLV {
  tag: string;
  length: number;
  value: string;
  children?: TLV[];
}

export interface QRISData {
  version: string;
  method: "static" | "dynamic";
  merchantCategoryCode: string;
  currency: string;
  amount?: string;
  countryCode: string;
  merchantName: string;
  merchantCity: string;
  crc: string;
  raw: TLV[];
}
```

- [ ] **Step 2: Write the failing CRC16 test**

CRC-16/CCITT-FALSE (poly `0x1021`, init `0xFFFF`, no reflection) has a well-known standard check value: the ASCII string `"123456789"` must hash to `0x29B1`.

```typescript
// backend/src/qris/crc16.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateCRC16 } from "./crc16.js";

test("matches the CRC-16/CCITT-FALSE standard check value", () => {
  assert.equal(calculateCRC16("123456789"), "29B1");
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/qris/crc16.test.ts`
Expected: FAIL with "Cannot find module './crc16.js'"

- [ ] **Step 4: Write crc16.ts**

```typescript
// backend/src/qris/crc16.ts
/**
 * CRC-16/CCITT-FALSE, as used by EMVCo QR payloads (tag 63).
 * Ported from https://github.com/verssache/qris-dinamis (MIT).
 */
export function calculateCRC16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/qris/crc16.test.ts`
Expected: PASS

- [ ] **Step 6: Write the failing parseQRIS test**

Build the payload with a local helper so the CRC is correct by construction (real QRIS generators do the same: CRC covers everything up to and including tag `6304`).

```typescript
// backend/src/qris/parser.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQRIS, parseTLV } from "./parser.js";
import { calculateCRC16 } from "./crc16.js";

function tlv(tag: string, value: string): string {
  return tag + value.length.toString().padStart(2, "0") + value;
}

function buildQris(fields: Array<[string, string]>): string {
  const body = fields.map(([tag, value]) => tlv(tag, value)).join("") + "6304";
  return body + calculateCRC16(body);
}

test("parseTLV parses a single tag", () => {
  const elements = parseTLV(tlv("00", "01"));
  assert.deepEqual(elements, [{ tag: "00", length: 2, value: "01" }]);
});

test("parseQRIS extracts merchant name, city, and static method", () => {
  const qris = buildQris([
    ["00", "01"],
    ["01", "11"],
    ["53", "360"],
    ["58", "ID"],
    ["59", "Warung Kopi Asa"],
    ["60", "Jakarta"],
  ]);

  const data = parseQRIS(qris);

  assert.equal(data.method, "static");
  assert.equal(data.merchantName, "Warung Kopi Asa");
  assert.equal(data.merchantCity, "Jakarta");
  assert.equal(data.currency, "360");
  assert.equal(data.countryCode, "ID");
  assert.equal(data.amount, undefined);
});

test("parseQRIS extracts amount for dynamic QRIS", () => {
  const qris = buildQris([
    ["00", "01"],
    ["01", "12"],
    ["53", "360"],
    ["54", "25000"],
    ["58", "ID"],
    ["59", "Warung Kopi Asa"],
    ["60", "Jakarta"],
  ]);

  const data = parseQRIS(qris);

  assert.equal(data.method, "dynamic");
  assert.equal(data.amount, "25000");
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- src/qris/parser.test.ts`
Expected: FAIL with "Cannot find module './parser.js'"

- [ ] **Step 8: Write parser.ts**

```typescript
// backend/src/qris/parser.ts
// Ported from https://github.com/verssache/qris-dinamis (MIT license).
import type { TLV, QRISData } from "./types.js";

const NESTED_TAGS = new Set([
  ...Array.from({ length: 26 }, (_, i) => String(i + 26).padStart(2, "0")),
  "62",
]);

export function parseTLV(data: string): TLV[] {
  const elements: TLV[] = [];
  let pos = 0;

  while (pos < data.length) {
    if (pos + 4 > data.length) break;
    const tag = data.substring(pos, pos + 2);
    const length = parseInt(data.substring(pos + 2, pos + 4), 10);
    if (isNaN(length) || pos + 4 + length > data.length) break;

    const value = data.substring(pos + 4, pos + 4 + length);
    const element: TLV = { tag, length, value };
    if (NESTED_TAGS.has(tag)) {
      element.children = parseTLV(value);
    }
    elements.push(element);
    pos += 4 + length;
  }

  return elements;
}

export function parseQRIS(qrisString: string): QRISData {
  const raw = parseTLV(qrisString);
  const findTag = (tag: string) => raw.find((t) => t.tag === tag);

  return {
    version: findTag("00")?.value ?? "01",
    method: findTag("01")?.value === "12" ? "dynamic" : "static",
    merchantCategoryCode: findTag("52")?.value ?? "",
    currency: findTag("53")?.value ?? "360",
    amount: findTag("54")?.value,
    countryCode: findTag("58")?.value ?? "ID",
    merchantName: findTag("59")?.value ?? "",
    merchantCity: findTag("60")?.value ?? "",
    crc: findTag("63")?.value ?? "",
    raw,
  };
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- src/qris/parser.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 10: Commit**

```bash
git add backend/src/qris/
git commit -m "Add EMVCo/QRIS TLV parser (ported from qris-dinamis, MIT)"
```

---

### Task 4: Quote engine (CoinGecko + spread)

**Files:**
- Create: `backend/src/quote/quote.ts`
- Test: `backend/src/quote/quote.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `getQuote(amountIdr: number, deps?: { fetchImpl?: typeof fetch; now?: () => Date }): Promise<Quote>` where `Quote = { amountUsdc: string; rateIdrPerUsdc: string; expiresAt: Date }`. Task 10's order-creation route calls this after parsing the QR.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/quote/quote.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { getQuote } from "./quote.js";

test("converts IDR amount to USDC using CoinGecko rate plus spread", async () => {
  const fakeFetch = async () =>
    new Response(JSON.stringify({ "usd-coin": { idr: 16000 } }), { status: 200 });

  const quote = await getQuote(32000, {
    fetchImpl: fakeFetch as typeof fetch,
    now: () => new Date("2026-07-15T00:00:00Z"),
  });

  // 32000 IDR / 16000 IDR-per-USDC = 2 USDC, + 1% spread = 2.02
  assert.equal(quote.amountUsdc, "2.02");
  assert.equal(quote.rateIdrPerUsdc, "16000");
  assert.equal(quote.expiresAt.toISOString(), "2026-07-15T00:00:30.000Z");
});

test("throws if CoinGecko response is missing the rate", async () => {
  const fakeFetch = async () => new Response(JSON.stringify({}), { status: 200 });

  await assert.rejects(() => getQuote(32000, { fetchImpl: fakeFetch as typeof fetch }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/quote/quote.test.ts`
Expected: FAIL with "Cannot find module './quote.js'"

- [ ] **Step 3: Write quote.ts**

```typescript
// backend/src/quote/quote.ts
const SPREAD = 0.01; // 1%
const QUOTE_TTL_MS = 30_000;

export interface Quote {
  amountUsdc: string;
  rateIdrPerUsdc: string;
  expiresAt: Date;
}

export async function getRateIdrPerUsdc(fetchImpl: typeof fetch = fetch): Promise<number> {
  const baseUrl = process.env.COINGECKO_API_URL ?? "https://api.coingecko.com/api/v3";
  const res = await fetchImpl(`${baseUrl}/simple/price?ids=usd-coin&vs_currencies=idr`);
  const body = (await res.json()) as { "usd-coin"?: { idr?: number } };
  const rate = body["usd-coin"]?.idr;

  if (!rate) {
    throw new Error("CoinGecko response missing usd-coin.idr rate");
  }
  return rate;
}

export async function getQuote(
  amountIdr: number,
  deps: { fetchImpl?: typeof fetch; now?: () => Date } = {}
): Promise<Quote> {
  const now = deps.now ?? (() => new Date());
  const rate = await getRateIdrPerUsdc(deps.fetchImpl);
  const amountUsdc = (amountIdr / rate) * (1 + SPREAD);

  return {
    amountUsdc: amountUsdc.toFixed(2),
    rateIdrPerUsdc: rate.toString(),
    expiresAt: new Date(now().getTime() + QUOTE_TTL_MS),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/quote/quote.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/quote/
git commit -m "Add CoinGecko-based quote engine with 1% spread and 30s TTL"
```

---

### Task 5: Order state machine

**Files:**
- Create: `backend/src/orders/state-machine.ts`
- Test: `backend/src/orders/state-machine.test.ts`

**Interfaces:**
- Produces: `type OrderState = "scanned" | "quoted" | "approved" | "bridging" | "redeeming" | "completed" | "failed"` and `transition(current: OrderState, event: OrderEvent): OrderState` (throws `InvalidTransitionError` on an illegal move). Task 10's routes call `transition` before persisting a new state — never write `state` directly.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/orders/state-machine.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { transition, InvalidTransitionError } from "./state-machine.js";

test("happy path: scanned -> quoted -> approved -> bridging -> redeeming -> completed", () => {
  assert.equal(transition("scanned", "quote_received"), "quoted");
  assert.equal(transition("quoted", "user_approved"), "approved");
  assert.equal(transition("approved", "bridge_submitted"), "bridging");
  assert.equal(transition("bridging", "bridge_confirmed"), "redeeming");
  assert.equal(transition("redeeming", "idrx_redeemed"), "completed");
});

test("any state can move to failed via a failure event", () => {
  assert.equal(transition("bridging", "failure"), "failed");
  assert.equal(transition("redeeming", "failure"), "failed");
});

test("rejects an out-of-order transition", () => {
  assert.throws(() => transition("scanned", "user_approved"), InvalidTransitionError);
});

test("rejects any transition out of a terminal state", () => {
  assert.throws(() => transition("completed", "user_approved"), InvalidTransitionError);
  assert.throws(() => transition("failed", "user_approved"), InvalidTransitionError);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/orders/state-machine.test.ts`
Expected: FAIL with "Cannot find module './state-machine.js'"

- [ ] **Step 3: Write state-machine.ts**

```typescript
// backend/src/orders/state-machine.ts
export type OrderState =
  | "scanned"
  | "quoted"
  | "approved"
  | "bridging"
  | "redeeming"
  | "completed"
  | "failed";

export type OrderEvent =
  | "quote_received"
  | "user_approved"
  | "bridge_submitted"
  | "bridge_confirmed"
  | "idrx_redeemed"
  | "failure";

export class InvalidTransitionError extends Error {
  constructor(state: OrderState, event: OrderEvent) {
    super(`Cannot apply event "${event}" to state "${state}"`);
    this.name = "InvalidTransitionError";
  }
}

const TRANSITIONS: Record<OrderState, Partial<Record<OrderEvent, OrderState>>> = {
  scanned: { quote_received: "quoted", failure: "failed" },
  quoted: { user_approved: "approved", failure: "failed" },
  approved: { bridge_submitted: "bridging", failure: "failed" },
  bridging: { bridge_confirmed: "redeeming", failure: "failed" },
  redeeming: { idrx_redeemed: "completed", failure: "failed" },
  completed: {},
  failed: {},
};

export function transition(current: OrderState, event: OrderEvent): OrderState {
  const next = TRANSITIONS[current][event];
  if (!next) {
    throw new InvalidTransitionError(current, event);
  }
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/orders/state-machine.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/orders/
git commit -m "Add pure order state machine with guarded transitions"
```

---

### Task 6: IDRX HMAC client

**Files:**
- Create: `backend/src/idrx/client.ts`
- Test: `backend/src/idrx/client.test.ts`

**Interfaces:**
- Produces:
  - `signRequest(secret: string, method: string, url: string, timestamp: string, body: string): string`
  - `onboardUser(config: IdrxConfig, data: OnboardingData): Promise<{ id: number; apiKey: string; apiSecret: string }>`
  - `addBankAccount(config: IdrxConfig, data: { bankAccountNumber: string; bankCode: string }): Promise<{ depositWalletAddress: string }>`
  - `getBankAccounts(config: IdrxConfig): Promise<Array<{ bankCode: string; depositWalletAddress: string }>>`
  - `getTransactionHistory(config: IdrxConfig, merchantOrderId: string): Promise<{ status: string } | null>`
  - `IdrxConfig = { baseUrl: string; apiKey: string; apiSecret: string }`
- Task 10/11 call these with the per-user `apiKey`/`apiSecret` returned by `onboardUser` (not the business master key) for all subsequent per-user calls, per spec §10.4.

- [ ] **Step 1: Write the failing signature test**

The verified scheme (spec §10.4): HMAC-SHA256 over `timestamp + method + url + body`, secret is base64-decoded before use, digest is base64url-encoded.

```typescript
// backend/src/idrx/client.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { signRequest } from "./client.js";

test("signRequest matches a manually computed HMAC-SHA256 base64url digest", () => {
  const secretBase64 = Buffer.from("test-secret").toString("base64");
  const method = "POST";
  const url = "/api/auth/add-bank-account";
  const timestamp = "1752537600000";
  const body = JSON.stringify({ bankAccountNumber: "123", bankCode: "GOPAY" });

  const expected = crypto
    .createHmac("sha256", Buffer.from(secretBase64, "base64"))
    .update(timestamp)
    .update(method)
    .update(url)
    .update(body)
    .digest("base64url");

  const actual = signRequest(secretBase64, method, url, timestamp, body);

  assert.equal(actual, expected);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/idrx/client.test.ts`
Expected: FAIL with "Cannot find module './client.js'"

- [ ] **Step 3: Write client.ts (signing + onboarding + bank account calls)**

```typescript
// backend/src/idrx/client.ts
import crypto from "node:crypto";

export interface IdrxConfig {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
}

export function signRequest(
  secretBase64: string,
  method: string,
  url: string,
  timestamp: string,
  body: string
): string {
  return crypto
    .createHmac("sha256", Buffer.from(secretBase64, "base64"))
    .update(timestamp)
    .update(method)
    .update(url)
    .update(body)
    .digest("base64url");
}

async function idrxRequest<T>(
  config: IdrxConfig,
  method: "GET" | "POST",
  path: string,
  body?: BodyInit,
  bodyStringForSignature = ""
): Promise<T> {
  const timestamp = Date.now().toString();
  const signature = signRequest(config.apiSecret, method, path, timestamp, bodyStringForSignature);

  const res = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers: {
      "idrx-api-key": config.apiKey,
      "idrx-api-sig": signature,
      "idrx-api-ts": timestamp,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`IDRX ${method} ${path} failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { data: T };
  return json.data;
}

export interface OnboardingData {
  email: string;
  fullname: string;
  address: string;
  idNumber: string;
  idFile: Blob;
}

export async function onboardUser(
  config: IdrxConfig,
  data: OnboardingData
): Promise<{ id: number; apiKey: string; apiSecret: string; fullname: string }> {
  const form = new FormData();
  form.set("email", data.email);
  form.set("fullname", data.fullname);
  form.set("address", data.address);
  form.set("idNumber", data.idNumber);
  form.set("idFile", data.idFile);

  // Multipart bodies are not part of the HMAC message per IDRX docs examples
  // (only JSON bodies are shown signed) — sign with an empty body string.
  return idrxRequest(config, "POST", "/api/auth/onboarding", form, "");
}

export async function addBankAccount(
  config: IdrxConfig,
  data: { bankAccountNumber: string; bankCode: string }
): Promise<{ depositWalletAddress: string }> {
  const bodyStr = JSON.stringify(data);
  const result = await idrxRequest<{ DepositWalletAddress: { walletAddress: string } }>(
    config,
    "POST",
    "/api/auth/add-bank-account",
    bodyStr,
    bodyStr
  );
  return { depositWalletAddress: result.DepositWalletAddress.walletAddress };
}

export async function getBankAccounts(
  config: IdrxConfig
): Promise<Array<{ bankCode: string; depositWalletAddress: string }>> {
  const rows = await idrxRequest<Array<{ bankCode: string; DepositWalletAddress: { walletAddress: string } }>>(
    config,
    "GET",
    "/api/auth/get-bank-accounts"
  );
  return rows.map((r) => ({ bankCode: r.bankCode, depositWalletAddress: r.DepositWalletAddress.walletAddress }));
}

export async function getTransactionHistory(
  config: IdrxConfig,
  merchantOrderId: string
): Promise<{ status: string } | null> {
  const rows = await idrxRequest<Array<{ merchantOrderId: string; adminMintStatus?: string; status?: string }>>(
    config,
    "GET",
    `/api/transaction/user-transaction-history?merchantOrderId=${encodeURIComponent(merchantOrderId)}`
  );
  const match = rows.find((r) => r.merchantOrderId === merchantOrderId);
  if (!match) return null;
  return { status: match.adminMintStatus ?? match.status ?? "UNKNOWN" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/idrx/client.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Manual verification note**

The `onboardUser`/`addBankAccount`/`getBankAccounts`/`getTransactionHistory` HTTP calls cannot be unit-tested meaningfully against a fake — they depend on IDRX's real response shapes, which are only fully knowable once the KYB-gated API key exists (spec §7, risk #2). Once the API key is live, run a manual smoke check: onboard one real test user, add one real bank/e-wallet account, confirm the returned `depositWalletAddress` looks like a valid `0x...` EVM address. Record the result in this task's commit message.

- [ ] **Step 6: Commit**

```bash
git add backend/src/idrx/
git commit -m "Add IDRX HMAC-signed API client (onboarding, bank accounts, tx history)"
```

---

### Task 7: Stellar account provisioning (create + trustline)

**Files:**
- Create: `backend/src/stellar/account.ts`
- Test: `backend/src/stellar/account.test.ts`

**Interfaces:**
- Produces: `buildOnboardingTx(params: { fundingSecret: string; newAccountPublicKey: string; startingBalanceXlm: string }): Promise<{ signedXdr: string }>` (funding account creates + funds the new user account, signed with the funding key — safe, since the funding key is backend-only and never controls the new account) and `buildTrustlineTx(params: { accountPublicKey: string }): Promise<{ unsignedXdr: string }>` (built for the NEW account, must be signed by the user's own key in `frontend/` — backend never signs this one).

**Design note:** building a real transaction needs the source account's current sequence number from the network (`Horizon.loadAccount`) — but a unit test shouldn't depend on a live Horizon call against a random, never-funded test keypair (it would 404). So each builder is split into two functions from the start: a pure `...FromAccount` function that takes an already-loaded `Account` object (what the test exercises, using a plain `new Account(publicKey, sequence)` fixture), and a thin async wrapper that does the real `loadAccount` call and delegates to it (what production code calls).

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/stellar/account.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { Account, Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
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
  assert.equal((op as any).startingBalance, "1.5");
  assert.equal(tx.source, funding.publicKey());
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

- [ ] **Step 2: Run test to verify it fails**

Run: `STELLAR_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015" USDC_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN npm test -- src/stellar/account.test.ts`
Expected: FAIL with "Cannot find module './account.js'"

- [ ] **Step 3: Write account.ts**

```typescript
// backend/src/stellar/account.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `STELLAR_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015" USDC_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN npm test -- src/stellar/account.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/stellar/
git commit -m "Add Stellar account provisioning (createAccount + USDC trustline builders)"
```

---

### Task 8: Allbridge bridge orchestration

**Files:**
- Create: `backend/src/bridge/allbridge.ts`
- Test: `backend/src/bridge/allbridge.test.ts`

**Interfaces:**
- Produces:
  - `buildBridgeTx(params: { fromAccountAddress: string; toAccountAddress: string; amountUsdc: string }): Promise<{ unsignedXdr: string }>` — built for the user's account; `frontend/` signs it with the user's key.
  - `submitBridgeTx(signedXdr: string, fromAccountAddress: string): Promise<{ hash: string }>`
  - `getBridgeStatus(hash: string): Promise<"pending" | "confirmed" | "failed">`
- Task 10's `/orders/:id/approve` route calls `buildBridgeTx` when creating the order and `submitBridgeTx`/`getBridgeStatus` after the frontend returns a signed XDR.

- [ ] **Step 1: Write the failing test**

The real SDK requires live network access even to build a transaction (it queries chain details). Test the wrapper's call sequence and parameter mapping using `node:test`'s built-in mocking against an injected SDK instance, rather than the real network.

```typescript
// backend/src/bridge/allbridge.test.ts
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { buildBridgeTx } from "./allbridge.js";

test("buildBridgeTx asks the SDK for SRB->BAS USDC with the right send params", async () => {
  const rawTxBuilderSend = mock.fn(async () => "FAKE_XDR");
  const fakeSdk = {
    chainDetailsMap: mock.fn(async () => ({
      SRB: { tokens: [{ symbol: "USDC", tokenAddress: "srb-usdc-addr" }] },
      BAS: { tokens: [{ symbol: "USDC", tokenAddress: "base-usdc-addr" }] },
    })),
    bridge: { rawTxBuilder: { send: rawTxBuilderSend } },
  };

  const result = await buildBridgeTx(
    { fromAccountAddress: "GFROM...", toAccountAddress: "0xTO...", amountUsdc: "5" },
    fakeSdk as any
  );

  assert.equal(result.unsignedXdr, "FAKE_XDR");
  assert.equal(rawTxBuilderSend.mock.calls.length, 1);
  const [sendParams] = rawTxBuilderSend.mock.calls[0].arguments;
  assert.equal(sendParams.fromAccountAddress, "GFROM...");
  assert.equal(sendParams.toAccountAddress, "0xTO...");
  assert.equal(sendParams.amount, "5");
  assert.equal(sendParams.sourceToken.tokenAddress, "srb-usdc-addr");
  assert.equal(sendParams.destinationToken.tokenAddress, "base-usdc-addr");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/bridge/allbridge.test.ts`
Expected: FAIL with "Cannot find module './allbridge.js'"

- [ ] **Step 3: Write allbridge.ts**

Adapted directly from Allbridge's own verified Stellar example (`srb-send-full-example.ts`), split so the SDK instance is injectable for testing.

```typescript
// backend/src/bridge/allbridge.ts
import {
  AllbridgeCoreSdk,
  AmountFormat,
  ChainSymbol,
  FeePaymentMethod,
  Messenger,
  nodeRpcUrlsDefault,
  type SendParams,
} from "@allbridge/bridge-core-sdk";
import { rpc as SorobanRpc, TransactionBuilder, Keypair } from "@stellar/stellar-sdk";

function defaultSdk() {
  return new AllbridgeCoreSdk(nodeRpcUrlsDefault);
}

function ensure<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

export async function buildBridgeTx(
  params: { fromAccountAddress: string; toAccountAddress: string; amountUsdc: string },
  sdk: AllbridgeCoreSdk = defaultSdk()
): Promise<{ unsignedXdr: string }> {
  const chainDetailsMap = await sdk.chainDetailsMap();
  const sourceToken = ensure(
    chainDetailsMap[ChainSymbol.SRB].tokens.find((t) => t.symbol === "USDC"),
    "USDC not found on Stellar in Allbridge chain details"
  );
  const destinationToken = ensure(
    chainDetailsMap[ChainSymbol.BAS].tokens.find((t) => t.symbol === "USDC"),
    "USDC not found on Base in Allbridge chain details"
  );

  const sendParams: SendParams = {
    amount: params.amountUsdc,
    fromAccountAddress: params.fromAccountAddress,
    toAccountAddress: params.toAccountAddress,
    sourceToken,
    destinationToken,
    messenger: Messenger.ALLBRIDGE,
    gasFeePaymentMethod: FeePaymentMethod.WITH_STABLECOIN,
  };

  const unsignedXdr = (await sdk.bridge.rawTxBuilder.send(sendParams)) as string;
  return { unsignedXdr };
}

export async function submitBridgeTx(
  signedXdr: string,
  fromAccountAddress: string,
  sdk: AllbridgeCoreSdk = defaultSdk()
): Promise<{ hash: string }> {
  const restoreXdr = await sdk.utils.srb.simulateAndCheckRestoreTxRequiredSoroban(signedXdr, fromAccountAddress);
  if (restoreXdr) {
    // Restore transactions need the same signer; caller is responsible for
    // re-signing if this branch triggers — surfaced as an error for v1 rather
    // than silently failing, since restore requires a round-trip to the
    // frontend for a second signature.
    throw new Error("RESTORE_REQUIRED: resubmit after a Soroban state restore + re-sign");
  }

  const sent = await sdk.utils.srb.sendTransactionSoroban(signedXdr);
  const confirm = await sdk.utils.srb.confirmTx(sent.hash);

  if (confirm.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
    throw new Error(`Bridge transaction failed on-chain: ${sent.hash}`);
  }

  return { hash: sent.hash };
}

export async function getBridgeStatus(
  hash: string,
  sdk: AllbridgeCoreSdk = defaultSdk()
): Promise<"pending" | "confirmed" | "failed"> {
  const confirm = await sdk.utils.srb.confirmTx(hash);
  if (confirm.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) return "confirmed";
  if (confirm.status === SorobanRpc.Api.GetTransactionStatus.FAILED) return "failed";
  return "pending";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/bridge/allbridge.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Manual verification note (risk #1 from spec §7)**

Before demo, run one real bridge with a few dollars of USDC from a real Stellar mainnet account to a real IDRX deposit address, and confirm IDRX auto-detects it (check `getTransactionHistory`). If it does NOT auto-detect within a reasonable window, the spec's fallback (an intermediate backend-held EVM wallet, forwarded automatically) becomes a required addition to this module — do not build that fallback speculatively before this check fails.

- [ ] **Step 6: Commit**

```bash
git add backend/src/bridge/
git commit -m "Add Allbridge Core SDK wrapper for Stellar->Base USDC bridging"
```

---

### Task 9: Deep-link / e-wallet handoff builder

**Files:**
- Create: `backend/src/deeplink/builder.ts`
- Test: `backend/src/deeplink/builder.test.ts`

**Interfaces:**
- Produces: `buildEwalletHandoff(provider: "gopay" | "dana" | "ovo" | "other", qrContent: string): { appLink: string | null; qrContent: string }`. Per spec §10.3, `appLink` is a best-effort bare app-open link; `qrContent` is always returned so `frontend/` can re-render the QR for manual re-scan (the actual payment mechanism).

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/deeplink/builder.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEwalletHandoff } from "./builder.js";

test("gopay returns a best-effort app link plus the original QR content", () => {
  const result = buildEwalletHandoff("gopay", "00020101...6304ABCD");
  assert.equal(result.appLink, "gojek://gopay");
  assert.equal(result.qrContent, "00020101...6304ABCD");
});

test("unknown/unsupported providers return null appLink but still return qrContent", () => {
  const result = buildEwalletHandoff("other", "00020101...6304ABCD");
  assert.equal(result.appLink, null);
  assert.equal(result.qrContent, "00020101...6304ABCD");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/deeplink/builder.test.ts`
Expected: FAIL with "Cannot find module './builder.js'"

- [ ] **Step 3: Write builder.ts**

```typescript
// backend/src/deeplink/builder.ts
// No e-wallet publicly supports "open scanner with this QR preloaded" — see
// spec 2026-07-15-liber-architecture-design.md §10.3. These are bare
// best-effort app-open links only; the user still re-scans qrContent
// themselves inside the app, which is the actual payment mechanism.
const APP_LINKS: Record<string, string | null> = {
  gopay: "gojek://gopay",
  dana: "dana://",
  ovo: "ovo://",
  other: null,
};

export function buildEwalletHandoff(
  provider: "gopay" | "dana" | "ovo" | "other",
  qrContent: string
): { appLink: string | null; qrContent: string } {
  return { appLink: APP_LINKS[provider] ?? null, qrContent };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/deeplink/builder.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/deeplink/
git commit -m "Add e-wallet handoff builder (best-effort app link + QR re-display)"
```

---

### Task 10: API routes — orders lifecycle

**Files:**
- Create: `backend/src/orders/repository.ts`
- Create: `backend/src/routes/orders.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/src/routes/orders.test.ts`

**Interfaces:**
- Consumes: `parseQRIS` (Task 3), `getQuote` (Task 4), `transition` (Task 5), `getBankAccounts` (Task 6), `buildBridgeTx`/`submitBridgeTx` (Task 8).
- Produces the HTTP contract `frontend/` builds against:
  - `POST /orders` `{ userId: string, qrContent: string }` → `201 { orderId, merchantName, merchantCity, amountIdr, amountUsdc, quoteExpiresAt, unsignedBridgeXdr }`
  - `POST /orders/:id/approve` `{ signedXdr: string }` → `200 { state: "bridging", stellarTxHash: string }`
  - `GET /orders/:id` → `200 { state, merchantName, amountIdr, amountUsdc, stellarTxHash, failureReason, ewalletHandoff: { appLink: string | null, qrContent: string } }` (uses Task 9's `buildEwalletHandoff` with the order owner's `provider`, so the e-wallet handoff logic lives in one place instead of being duplicated in `frontend/`)

- [ ] **Step 1: Write repository.ts (thin data-access layer)**

```typescript
// backend/src/orders/repository.ts
import { getPool } from "../db/pool.js";
import type { OrderState } from "./state-machine.js";

export interface OrderRow {
  id: string;
  user_id: string;
  qr_content: string;
  merchant_name: string;
  merchant_city: string;
  amount_idr: string;
  amount_usdc: string | null;
  quote_expires_at: Date | null;
  state: OrderState;
  from_account_address: string;
  stellar_tx_hash: string | null;
  failure_reason: string | null;
}

export async function insertOrder(params: {
  userId: string;
  qrContent: string;
  merchantName: string;
  merchantCity: string;
  amountIdr: string;
  amountUsdc: string;
  quoteExpiresAt: Date;
  fromAccountAddress: string;
}): Promise<OrderRow> {
  const { rows } = await getPool().query<OrderRow>(
    `INSERT INTO orders (user_id, qr_content, merchant_name, merchant_city, amount_idr, amount_usdc, quote_rate, quote_expires_at, from_account_address, state)
     VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, 'quoted')
     RETURNING *`,
    [params.userId, params.qrContent, params.merchantName, params.merchantCity, params.amountIdr, params.amountUsdc, params.quoteExpiresAt, params.fromAccountAddress]
  );
  return rows[0];
}

export async function getOrder(id: string): Promise<OrderRow | null> {
  const { rows } = await getPool().query<OrderRow>(`SELECT * FROM orders WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getOrderWithProvider(
  id: string
): Promise<(OrderRow & { provider: "gopay" | "dana" | "ovo" | "other" }) | null> {
  const { rows } = await getPool().query(
    `SELECT o.*, u.provider FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function updateOrderState(
  id: string,
  state: OrderState,
  extra: Partial<Pick<OrderRow, "stellar_tx_hash" | "failure_reason">> = {}
): Promise<void> {
  await getPool().query(
    `UPDATE orders SET state = $2, stellar_tx_hash = COALESCE($3, stellar_tx_hash), failure_reason = COALESCE($4, failure_reason), updated_at = now() WHERE id = $1`,
    [id, state, extra.stellar_tx_hash ?? null, extra.failure_reason ?? null]
  );
}
```

- [ ] **Step 2: Write the failing route test**

Requires the real DB from Task 2 (migrated) plus mocked bridge/IDRX calls at the module boundary using `node:test` mocking.

```typescript
// backend/src/routes/orders.test.ts
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app.js";
import { getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import * as bridge from "../bridge/allbridge.js";
import * as quote from "../quote/quote.js";

before(async () => {
  await migrate();
});

test("POST /orders parses QRIS, quotes it, and returns an unsigned bridge XDR", async () => {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO users (stellar_public_key, idrx_deposit_address) VALUES ($1, $2) RETURNING id`,
    ["GTESTUSER...", "0xDEPOSIT..."]
  );
  const userId = rows[0].id;

  mock.method(quote, "getQuote", async () => ({
    amountUsdc: "2.02",
    rateIdrPerUsdc: "16000",
    expiresAt: new Date(Date.now() + 30_000),
  }));
  mock.method(bridge, "buildBridgeTx", async () => ({ unsignedXdr: "FAKE_UNSIGNED_XDR" }));

  const qrContent =
    "0002010102530360580002ID59" + "15Warung Kopi Asa".length.toString().padStart(2, "0"); // placeholder, replaced below

  const app = createApp();
  const res = await app.request("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      qrContent:
        "00020101021253033605802ID59" + "0FWarung Kopi54052500063040000",
    }),
  });

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.unsignedBridgeXdr, "FAKE_UNSIGNED_XDR");
  assert.equal(body.amountUsdc, "2.02");
});
```

Note: hand-building a valid QRIS string inline is error-prone (see Task 3's `buildQris` helper) — replace the inline literal above with a small locally-imported test fixture using the same `buildQris` helper from `src/qris/parser.test.ts` (extract it into `src/qris/test-helpers.ts` shared by both test files) before running this test.

- [ ] **Step 3: Extract the QRIS test helper so both test files can use it**

```typescript
// backend/src/qris/test-helpers.ts
import { calculateCRC16 } from "./crc16.js";

export function tlv(tag: string, value: string): string {
  return tag + value.length.toString().padStart(2, "0") + value;
}

export function buildQris(fields: Array<[string, string]>): string {
  const body = fields.map(([tag, value]) => tlv(tag, value)).join("") + "6304";
  return body + calculateCRC16(body);
}
```

Update `backend/src/qris/parser.test.ts` to import `tlv`/`buildQris` from `./test-helpers.js` instead of defining them locally. Update the route test to import from `../qris/test-helpers.js` and build the fixture as:

```typescript
import { buildQris } from "../qris/test-helpers.js";

const qrContent = buildQris([
  ["00", "01"],
  ["01", "12"],
  ["53", "360"],
  ["54", "32000"],
  ["58", "ID"],
  ["59", "Warung Kopi Asa"],
  ["60", "Jakarta"],
]);
```

- [ ] **Step 4: Run test to verify it fails**

Run: `DATABASE_URL=postgres://localhost/liber npm test -- src/routes/orders.test.ts`
Expected: FAIL with "Cannot find module '../routes/orders.js'"

- [ ] **Step 5: Write routes/orders.ts**

```typescript
// backend/src/routes/orders.ts
import { Hono } from "hono";
import { parseQRIS } from "../qris/parser.js";
import { getQuote } from "../quote/quote.js";
import { transition } from "../orders/state-machine.js";
import { insertOrder, getOrder, getOrderWithProvider, updateOrderState } from "../orders/repository.js";
import { buildBridgeTx, submitBridgeTx } from "../bridge/allbridge.js";
import { buildEwalletHandoff } from "../deeplink/builder.js";
import { getPool } from "../db/pool.js";

export const ordersRoute = new Hono();

ordersRoute.post("/orders", async (c) => {
  const { userId, qrContent } = await c.req.json<{ userId: string; qrContent: string }>();

  const { rows } = await getPool().query(`SELECT idrx_deposit_address, stellar_public_key FROM users WHERE id = $1`, [userId]);
  const user = rows[0];
  if (!user) return c.json({ error: "user not found" }, 404);

  const parsed = parseQRIS(qrContent);
  if (!parsed.amount && !c.req.query("amountIdr")) {
    return c.json({ error: "static QRIS requires amountIdr query param" }, 400);
  }
  const amountIdr = Number(parsed.amount ?? c.req.query("amountIdr"));

  const quote = await getQuote(amountIdr);
  const order = await insertOrder({
    userId,
    qrContent,
    merchantName: parsed.merchantName,
    merchantCity: parsed.merchantCity,
    amountIdr: amountIdr.toString(),
    amountUsdc: quote.amountUsdc,
    quoteExpiresAt: quote.expiresAt,
    fromAccountAddress: user.stellar_public_key,
  });

  const { unsignedXdr } = await buildBridgeTx({
    fromAccountAddress: user.stellar_public_key,
    toAccountAddress: user.idrx_deposit_address,
    amountUsdc: quote.amountUsdc,
  });

  return c.json(
    {
      orderId: order.id,
      merchantName: order.merchant_name,
      merchantCity: order.merchant_city,
      amountIdr: order.amount_idr,
      amountUsdc: order.amount_usdc,
      quoteExpiresAt: quote.expiresAt,
      unsignedBridgeXdr: unsignedXdr,
    },
    201
  );
});

ordersRoute.post("/orders/:id/approve", async (c) => {
  const id = c.req.param("id");
  const { signedXdr } = await c.req.json<{ signedXdr: string }>();

  const order = await getOrder(id);
  if (!order) return c.json({ error: "order not found" }, 404);

  const approvedState = transition(order.state, "user_approved");
  await updateOrderState(id, approvedState);

  try {
    const { hash } = await submitBridgeTx(signedXdr, order.from_account_address);
    const bridgingState = transition(approvedState, "bridge_submitted");
    await updateOrderState(id, bridgingState, { stellar_tx_hash: hash });
    return c.json({ state: bridgingState, stellarTxHash: hash });
  } catch (err) {
    const failedState = transition(approvedState, "failure");
    await updateOrderState(id, failedState, { failure_reason: (err as Error).message });
    return c.json({ state: failedState, error: (err as Error).message }, 502);
  }
});

ordersRoute.get("/orders/:id", async (c) => {
  const order = await getOrderWithProvider(c.req.param("id"));
  if (!order) return c.json({ error: "order not found" }, 404);
  return c.json({
    state: order.state,
    merchantName: order.merchant_name,
    amountIdr: order.amount_idr,
    amountUsdc: order.amount_usdc,
    stellarTxHash: order.stellar_tx_hash,
    failureReason: order.failure_reason,
    ewalletHandoff: buildEwalletHandoff(order.provider, order.qr_content),
  });
});
```

- [ ] **Step 6: Mount the route in app.ts**

```typescript
// backend/src/app.ts (modify)
import { Hono } from "hono";
import { ordersRoute } from "./routes/orders.js";

export function createApp() {
  const app = new Hono();
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.route("/", ordersRoute);
  return app;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `DATABASE_URL=postgres://localhost/liber npm test -- src/routes/orders.test.ts`
Expected: PASS

- [ ] **Step 8: Run the full suite**

Run: `DATABASE_URL=postgres://localhost/liber STELLAR_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015" USDC_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN npm test`
Expected: PASS (all tests across all tasks)

- [ ] **Step 9: Commit**

```bash
git add backend/src/orders/repository.ts backend/src/routes/ backend/src/app.ts backend/src/qris/test-helpers.ts backend/src/qris/parser.test.ts
git commit -m "Wire orders API: create+quote+bridge-build, approve+submit, status polling"
```

---

### Task 11: IDRX webhook + reconciliation

**Files:**
- Create: `backend/src/routes/webhooks.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/src/routes/webhooks.test.ts`

**Interfaces:**
- Consumes: `getTransactionHistory` (Task 6), `transition` (Task 5), `updateOrderState`/`getOrder` (Task 10).
- Produces: `POST /webhooks/idrx` → always `200` immediately (per spec §10.4, the webhook is untrusted and unretried — respond fast, reconcile asynchronously against the real API).

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/routes/webhooks.test.ts
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app.js";
import { getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import * as idrx from "../idrx/client.js";

before(async () => {
  await migrate();
});

test("POST /webhooks/idrx re-verifies via getTransactionHistory before trusting the payload", async () => {
  const pool = getPool();
  const { rows: userRows } = await pool.query(
    `INSERT INTO users (stellar_public_key, idrx_api_key, idrx_api_secret) VALUES ($1, $2, $3) RETURNING id`,
    ["GWEBHOOKUSER...", "user-api-key", Buffer.from("user-secret").toString("base64")]
  );
  const { rows: orderRows } = await pool.query(
    `INSERT INTO orders (user_id, qr_content, merchant_name, merchant_city, amount_idr, from_account_address, state, idrx_merchant_order_id)
     VALUES ($1, 'qr', 'Merchant', 'Jakarta', 32000, 'GWEBHOOKUSER...', 'redeeming', 'ORDER123') RETURNING id`,
    [userRows[0].id]
  );
  const orderId = orderRows[0].id;

  mock.method(idrx, "getTransactionHistory", async () => ({ status: "MINTED" }));

  const app = createApp();
  const res = await app.request("/webhooks/idrx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ merchantOrderId: "ORDER123", adminMintStatus: "MINTED" }),
  });

  assert.equal(res.status, 200);

  const { rows } = await pool.query(`SELECT state FROM orders WHERE id = $1`, [orderId]);
  assert.equal(rows[0].state, "completed");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL=postgres://localhost/liber npm test -- src/routes/webhooks.test.ts`
Expected: FAIL with "Cannot find module '../routes/webhooks.js'"

- [ ] **Step 3: Write routes/webhooks.ts**

```typescript
// backend/src/routes/webhooks.ts
import { Hono } from "hono";
import { getPool } from "../db/pool.js";
import { getTransactionHistory } from "../idrx/client.js";
import { transition } from "../orders/state-machine.js";
import { updateOrderState } from "../orders/repository.js";

export const webhooksRoute = new Hono();

webhooksRoute.post("/webhooks/idrx", async (c) => {
  const payload = await c.req.json<{ merchantOrderId?: string }>().catch(() => ({}) as { merchantOrderId?: string });

  // Fire-and-forget reconciliation: respond fast (webhook has no retry and no
  // signature — spec §10.4), verify against the real API before trusting anything.
  if (payload.merchantOrderId) {
    reconcile(payload.merchantOrderId).catch((err) => console.error("reconcile failed", err));
  }

  return c.json({ received: true });
});

async function reconcile(merchantOrderId: string) {
  const { rows } = await getPool().query(
    `SELECT o.id, o.state, u.idrx_api_key, u.idrx_api_secret
     FROM orders o JOIN users u ON u.id = o.user_id
     WHERE o.idrx_merchant_order_id = $1`,
    [merchantOrderId]
  );
  const order = rows[0];
  if (!order) return;

  const history = await getTransactionHistory(
    { baseUrl: process.env.IDRX_BASE_URL!, apiKey: order.idrx_api_key, apiSecret: order.idrx_api_secret },
    merchantOrderId
  );

  if (history?.status === "MINTED") {
    const nextState = transition(order.state, "idrx_redeemed");
    await updateOrderState(order.id, nextState);
  }
}
```

- [ ] **Step 4: Mount the route**

```typescript
// backend/src/app.ts (modify)
import { webhooksRoute } from "./routes/webhooks.js";
// ...
app.route("/", webhooksRoute);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `DATABASE_URL=postgres://localhost/liber npm test -- src/routes/webhooks.test.ts`
Expected: PASS

- [ ] **Step 6: Run the full suite one more time**

Run: `DATABASE_URL=postgres://localhost/liber STELLAR_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015" USDC_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN npm test`
Expected: PASS (all tests, all tasks)

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/webhooks.ts backend/src/app.ts
git commit -m "Add IDRX webhook receiver with reconcile-by-polling (webhook is untrusted)"
```

---

### Task 12: User onboarding route

**Files:**
- Create: `backend/src/routes/users.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/src/routes/users.test.ts`

**Interfaces:**
- Consumes: `onboardUser`/`addBankAccount` (Task 6), `buildOnboardingTx`/`buildTrustlineTx` (Task 7).
- Produces the HTTP contract `frontend/` calls right after generating a keypair:
  - `POST /users` `{ stellarPublicKey, email, fullname, address, idNumber, idFileBase64, bankAccountNumber, bankCode, provider }` (`provider` is one of `"gopay" | "dana" | "ovo" | "other"`, chosen by the user in the onboarding form — it selects which deep-link style Task 10's `GET /orders/:id` returns later) → `201 { userId, unsignedTrustlineXdr }` (the funding+createAccount tx is submitted server-side immediately since only the backend's funding key signs it; the trustline tx needs the user's own signature, so it comes back unsigned).
  - `POST /users/:id/confirm-trustline` `{ signedXdr }` → `200 { ready: true }`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/routes/users.test.ts
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app.js";
import { migrate } from "../db/migrate.js";
import * as idrx from "../idrx/client.js";
import * as account from "../stellar/account.js";

before(async () => {
  await migrate();
});

test("POST /users onboards with IDRX, funds the account, and returns an unsigned trustline tx", async () => {
  mock.method(idrx, "onboardUser", async () => ({
    id: 1011,
    apiKey: "user-api-key",
    apiSecret: Buffer.from("user-secret").toString("base64"),
    fullname: "Test User",
  }));
  mock.method(idrx, "addBankAccount", async () => ({ depositWalletAddress: "0xDEPOSIT..." }));
  mock.method(account, "buildOnboardingTx", async () => ({ signedXdr: "FAKE_FUNDING_XDR" }));
  mock.method(account, "buildTrustlineTx", async () => ({ unsignedXdr: "FAKE_TRUSTLINE_XDR" }));

  const app = createApp();
  const res = await app.request("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stellarPublicKey: "GNEWUSER...",
      email: "user@example.com",
      fullname: "Test User",
      address: "Jakarta",
      idNumber: "1234567890",
      idFileBase64: Buffer.from("fake-image-bytes").toString("base64"),
      bankAccountNumber: "081234567890",
      bankCode: "GOPAY",
      provider: "gopay",
    }),
  });

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.unsignedTrustlineXdr, "FAKE_TRUSTLINE_XDR");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL=postgres://localhost/liber npm test -- src/routes/users.test.ts`
Expected: FAIL with "Cannot find module '../routes/users.js'"

- [ ] **Step 3: Write routes/users.ts**

```typescript
// backend/src/routes/users.ts
import { Hono } from "hono";
import { getPool } from "../db/pool.js";
import { onboardUser, addBankAccount } from "../idrx/client.js";
import { buildOnboardingTx, buildTrustlineTx } from "../stellar/account.js";

export const usersRoute = new Hono();

const STARTING_BALANCE_XLM = "1.5"; // covers base reserve (~1 XLM) + USDC trustline reserve (~0.5 XLM)

usersRoute.post("/users", async (c) => {
  const body = await c.req.json<{
    stellarPublicKey: string;
    email: string;
    fullname: string;
    address: string;
    idNumber: string;
    idFileBase64: string;
    bankAccountNumber: string;
    bankCode: string;
    provider: "gopay" | "dana" | "ovo" | "other";
  }>();

  const businessConfig = {
    baseUrl: process.env.IDRX_BASE_URL!,
    apiKey: process.env.IDRX_API_KEY!,
    apiSecret: process.env.IDRX_API_SECRET!,
  };

  const idFile = new Blob([Buffer.from(body.idFileBase64, "base64")], { type: "image/jpeg" });
  const onboarded = await onboardUser(businessConfig, {
    email: body.email,
    fullname: body.fullname,
    address: body.address,
    idNumber: body.idNumber,
    idFile,
  });

  const userConfig = { baseUrl: businessConfig.baseUrl, apiKey: onboarded.apiKey, apiSecret: onboarded.apiSecret };
  const { depositWalletAddress } = await addBankAccount(userConfig, {
    bankAccountNumber: body.bankAccountNumber,
    bankCode: body.bankCode,
  });

  const { signedXdr: fundingXdr } = await buildOnboardingTx({
    fundingSecret: process.env.FUNDING_SECRET_KEY!,
    newAccountPublicKey: body.stellarPublicKey,
    startingBalanceXlm: STARTING_BALANCE_XLM,
  });
  // The funding tx is signed only by the backend's own funding key (the source
  // account), so it can be submitted immediately without any user signature.
  await submitStellarTx(fundingXdr);

  const { unsignedXdr: unsignedTrustlineXdr } = await buildTrustlineTx({
    accountPublicKey: body.stellarPublicKey,
  });

  const { rows } = await getPool().query(
    `INSERT INTO users (stellar_public_key, idrx_user_id, idrx_api_key, idrx_api_secret, idrx_deposit_address, provider)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [body.stellarPublicKey, onboarded.id, onboarded.apiKey, onboarded.apiSecret, depositWalletAddress, body.provider]
  );

  return c.json({ userId: rows[0].id, unsignedTrustlineXdr }, 201);
});

usersRoute.post("/users/:id/confirm-trustline", async (c) => {
  const { signedXdr } = await c.req.json<{ signedXdr: string }>();
  await submitStellarTx(signedXdr);
  return c.json({ ready: true });
});

async function submitStellarTx(signedXdr: string): Promise<void> {
  const { Horizon, TransactionBuilder } = await import("@stellar/stellar-sdk");
  const server = new Horizon.Server(process.env.HORIZON_URL ?? "https://horizon.stellar.org");
  const tx = TransactionBuilder.fromXDR(signedXdr, process.env.STELLAR_NETWORK_PASSPHRASE!);
  await server.submitTransaction(tx);
}
```

- [ ] **Step 4: Mount the route**

```typescript
// backend/src/app.ts (modify)
import { usersRoute } from "./routes/users.js";
// ...
app.route("/", usersRoute);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `DATABASE_URL=postgres://localhost/liber npm test -- src/routes/users.test.ts`
Expected: PASS

- [ ] **Step 6: Run the full suite one final time**

Run: `DATABASE_URL=postgres://localhost/liber STELLAR_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015" USDC_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN npm test`
Expected: PASS (all tests, all tasks)

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/users.ts backend/src/app.ts
git commit -m "Add user onboarding route: IDRX onboarding + bank account + Stellar account funding"
```

---

### Task 13: Balance route

**Files:**
- Create: `backend/src/routes/balance.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/src/routes/balance.test.ts`

**Interfaces:**
- Consumes: `getRateIdrPerUsdc` (Task 4).
- Produces: `GET /users/:id/balance` → `200 { usdcBalance: string, idrEstimate: string }`. This is the only place `frontend/` learns the user's balance — per the boundary rule, it never queries Horizon directly.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/routes/balance.test.ts
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app.js";
import { getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import * as quote from "../quote/quote.js";
import * as horizon from "./balance.js";

before(async () => {
  await migrate();
});

test("GET /users/:id/balance returns USDC balance and an IDR estimate", async () => {
  const { rows } = await getPool().query(
    `INSERT INTO users (stellar_public_key) VALUES ($1) RETURNING id`,
    ["GBALANCEUSER..."]
  );
  const userId = rows[0].id;

  mock.method(horizon, "loadUsdcBalance", async () => "12.5");
  mock.method(quote, "getRateIdrPerUsdc", async () => 16000);

  const app = createApp();
  const res = await app.request(`/users/${userId}/balance`);

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { usdcBalance: "12.5", idrEstimate: "200000" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL=postgres://localhost/liber npm test -- src/routes/balance.test.ts`
Expected: FAIL with "Cannot find module './balance.js'"

- [ ] **Step 3: Write routes/balance.ts**

```typescript
// backend/src/routes/balance.ts
import { Hono } from "hono";
import { Horizon } from "@stellar/stellar-sdk";
import { getPool } from "../db/pool.js";
import { getRateIdrPerUsdc } from "../quote/quote.js";

export const balanceRoute = new Hono();

export async function loadUsdcBalance(stellarPublicKey: string): Promise<string> {
  const server = new Horizon.Server(process.env.HORIZON_URL ?? "https://horizon.stellar.org");
  const account = await server.loadAccount(stellarPublicKey);
  const usdcLine = account.balances.find(
    (b): b is Horizon.HorizonApi.BalanceLineAsset =>
      "asset_code" in b && b.asset_code === "USDC" && b.asset_issuer === process.env.USDC_ISSUER
  );
  return usdcLine?.balance ?? "0";
}

balanceRoute.get("/users/:id/balance", async (c) => {
  const { rows } = await getPool().query(`SELECT stellar_public_key FROM users WHERE id = $1`, [c.req.param("id")]);
  const user = rows[0];
  if (!user) return c.json({ error: "user not found" }, 404);

  const [usdcBalance, rate] = await Promise.all([
    loadUsdcBalance(user.stellar_public_key),
    getRateIdrPerUsdc(),
  ]);

  return c.json({
    usdcBalance,
    idrEstimate: Math.round(Number(usdcBalance) * rate).toString(),
  });
});
```

- [ ] **Step 4: Mount the route**

```typescript
// backend/src/app.ts (modify)
import { balanceRoute } from "./routes/balance.js";
// ...
app.route("/", balanceRoute);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `DATABASE_URL=postgres://localhost/liber npm test -- src/routes/balance.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/balance.ts backend/src/app.ts
git commit -m "Add balance route (USDC balance + IDR estimate via CoinGecko rate)"
```

---

### Task 14: Order history route

**Files:**
- Create: `backend/src/routes/history.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/src/routes/history.test.ts`

**Interfaces:**
- Produces: `GET /users/:id/orders` → `200 { orders: Array<{ orderId, merchantName, merchantCity, amountIdr, amountUsdc, state, stellarTxHash, createdAt }> }`, newest first. Covers the "riwayat transaksi" MVP feature (`LIBER-CONCEPT.md` §4 item 4) that Task 10 (frontend history page) depends on.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/routes/history.test.ts
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app.js";
import { getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";

before(async () => {
  await migrate();
});

test("GET /users/:id/orders returns past orders newest first", async () => {
  const pool = getPool();
  const { rows: userRows } = await pool.query(
    `INSERT INTO users (stellar_public_key) VALUES ($1) RETURNING id`,
    ["GHISTORYUSER..."]
  );
  const userId = userRows[0].id;

  await pool.query(
    `INSERT INTO orders (user_id, qr_content, merchant_name, merchant_city, amount_idr, amount_usdc, from_account_address, state, stellar_tx_hash, created_at)
     VALUES ($1, 'qr1', 'Warung A', 'Jakarta', 10000, '0.62', 'G...', 'completed', 'hash1', now() - interval '1 hour'),
            ($1, 'qr2', 'Warung B', 'Bandung', 20000, '1.25', 'G...', 'completed', 'hash2', now())`,
    [userId]
  );

  const app = createApp();
  const res = await app.request(`/users/${userId}/orders`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.orders.length, 2);
  assert.equal(body.orders[0].merchantName, "Warung B"); // newest first
  assert.equal(body.orders[1].merchantName, "Warung A");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL=postgres://localhost/liber npm test -- src/routes/history.test.ts`
Expected: FAIL with "Cannot find module './history.js'"

- [ ] **Step 3: Write routes/history.ts**

```typescript
// backend/src/routes/history.ts
import { Hono } from "hono";
import { getPool } from "../db/pool.js";

export const historyRoute = new Hono();

historyRoute.get("/users/:id/orders", async (c) => {
  const { rows } = await getPool().query(
    `SELECT id, merchant_name, merchant_city, amount_idr, amount_usdc, state, stellar_tx_hash, created_at
     FROM orders WHERE user_id = $1 ORDER BY created_at DESC`,
    [c.req.param("id")]
  );

  return c.json({
    orders: rows.map((r) => ({
      orderId: r.id,
      merchantName: r.merchant_name,
      merchantCity: r.merchant_city,
      amountIdr: r.amount_idr,
      amountUsdc: r.amount_usdc,
      state: r.state,
      stellarTxHash: r.stellar_tx_hash,
      createdAt: r.created_at,
    })),
  });
});
```

- [ ] **Step 4: Mount the route**

```typescript
// backend/src/app.ts (modify)
import { historyRoute } from "./routes/history.js";
// ...
app.route("/", historyRoute);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `DATABASE_URL=postgres://localhost/liber npm test -- src/routes/history.test.ts`
Expected: PASS

- [ ] **Step 6: Run the full suite one final time**

Run: `DATABASE_URL=postgres://localhost/liber STELLAR_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015" USDC_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN npm test`
Expected: PASS (all tests, all tasks)

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/history.ts backend/src/app.ts
git commit -m "Add order history route (closes MVP riwayat transaksi gap)"
```

---

## Deployment (Railway)

After Task 11 is green:

```bash
cd backend
railway init          # if not already linked
railway add --database postgres
railway variables --set "STELLAR_NETWORK_PASSPHRASE=Public Global Stellar Network ; September 2015" \
                   --set "HORIZON_URL=https://horizon.stellar.org" \
                   --set "USDC_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" \
                   --set "IDRX_BASE_URL=https://idrx.co"
# set FUNDING_SECRET_KEY, IDRX_API_KEY, IDRX_API_SECRET, STELLAR_RPC_URL via `railway variables --set` individually (secrets, don't paste in shell history/logs)
railway run npm run migrate
railway up
```
