# Liber Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `frontend/` Next.js PWA — onboarding, QR scan, quote, approve/sign, status tracking, e-wallet handoff, balance and history — that drives the Liber payment flow entirely through the `backend/` HTTP API defined in `docs/superpowers/plans/2026-07-15-liber-backend.md`, with a distinctive, premium "mobile bank" visual identity (see §Design System below).

**Architecture:** Next.js App Router PWA. A thin `lib/` layer holds all non-UI logic (wallet keypair + signing, QRIS parsing, the backend API client) so it's unit-testable without a browser. Pages compose from a shared `components/ui/` design-system layer (Task 5) so the visual language stays consistent across all six screens instead of each page inventing its own styling. The wallet's secret key never leaves the browser and is never sent to `backend/`; only signed XDR strings are.

**Tech Stack:** Next.js (App Router, TypeScript, Tailwind v4 CSS-first theme), `@stellar/stellar-sdk` (client-side keypair + signing), `html5-qrcode` (camera scanning), `qrcode` (re-rendering a QR image for the e-wallet handoff step). Test runner for `lib/` logic: Node's built-in `node:test`. Pages are verified with a manual checklist AND a real browser screenshot (per the design intent below) — no e2e framework for MVP, camera QR scanning needs real hardware anyway.

## Global Constraints

- This is `frontend/` — a fully standalone project. No root `package.json`, no workspace file, no imports from `../backend` or `../contracts`. Any logic shared in spirit with `backend/` (e.g. the QRIS parser) is duplicated here as its own copy, per the approved "fully isolated" repo decision.
- Deploy target: Vercel (`vercel deploy`, project root = `frontend/`).
- **v1 wallet model (spec §10.1):** a plain Stellar Ed25519 keypair generated in the browser via `Keypair.random()`. The secret key is stored in `window.localStorage` (a simplification from the spec's IndexedDB mention — same security posture, same "backend never sees it" boundary, just a synchronous API instead of IndexedDB's async transactions). This is a `ponytail:`-flagged shortcut — upgrade path is Passkey Kit once its mainnet deployment ships (spec §10.1).
- Boundary rule (spec §5): this app never calls Horizon, Allbridge, or IDRX directly — only `backend/`'s HTTP API (`NEXT_PUBLIC_BACKEND_URL`).
- No e2e test framework added. Pure logic in `lib/` gets `node:test` coverage; pages get a manual checklist plus a real screenshot review (visual quality can't be judged from a diff alone).

## Design System

Liber is a crypto-to-QRIS payment wallet for Indonesian freelancers paid in USDC — it needs to feel like a real, trustworthy neobank app (GoPay/Jenius-grade), not a dApp, and not another generic blue-purple-gradient fintech template. The identity leans into the brand's own meaning (*Liber* = freedom of movement) with an emerald-and-gold palette instead of the generic blue/purple pairing, and a serif-italic-in-headline technique paired with a characterful grotesque — deliberately avoiding the most overused AI-generated defaults (Inter, Space Grotesk, purple gradients, warm-cream-plus-terracotta).

**Color tokens** (defined once in `globals.css`, consumed everywhere as Tailwind utilities — `bg-emerald`, `text-ink`, etc.):

| Token | Hex | Use |
|---|---|---|
| `--color-ink` | `#101E1A` | Primary text, deep green-black |
| `--color-paper` | `#F5F7F1` | Page background, sage-tinted off-white |
| `--color-emerald` | `#0B6B4E` | Primary brand color |
| `--color-emerald-bright` | `#2FD98A` | Positive/active accents, gradients |
| `--color-emerald-deep` | `#063D2C` | Gradient anchor, dark surfaces |
| `--color-gold` | `#E7A33A` | Primary CTA, highlights, currency cue |
| `--color-rose` | `#D6533F` | Errors/failed states only, used sparingly |

**Typography:** Display/accent — **Newsreader** (italic, for emphasis words and money amounts in headlines, e.g. *"bebas berpindah"*). Body/UI — **Bricolage Grotesque** (labels, buttons, running text, tabular numerals for balances). Both via `next/font/google`. Never Inter, never Arial/system-ui as the primary face.

**Layout motif:** Mobile-first, single column, max content width 430px centered (reads correctly as a "phone app" even on a wider viewport during review). A soft multi-color gradient mesh sits fixed behind the content (the "liquid movement" cue). The signature recurring element is the **gradient balance card** — a large rounded emerald-gradient card styled like a premium debit card, anchoring the home screen and echoed (smaller) wherever a monetary amount needs emphasis. Buttons are full-width pills, primary actions always reach the bottom of the screen (thumb zone). Cards are `rounded-3xl` white surfaces with soft emerald-tinted shadows, never a plain grey border.

**Copy rule:** No em-dashes anywhere in UI copy (headlines, buttons, labels, error messages) — use a period, comma, or restructure the sentence instead.

---

### Task 1: Scaffold Next.js PWA + design system tokens

**Files:**
- Create: `frontend/` (via `create-next-app`)
- Create: `frontend/public/manifest.json`
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/app/globals.css`

**Interfaces:**
- Produces: a running Next.js dev server with a health-check-equivalent home page, `NEXT_PUBLIC_BACKEND_URL` wired through `.env.local`, and the color/font tokens from the Design System section above available as Tailwind utilities (`bg-emerald`, `text-gold`, `font-display`, `font-body`) to every later task.

- [ ] **Step 1: Scaffold the project**

Run (from the repo root, `stellar-apac/`):

```bash
npx create-next-app@latest frontend --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack
cd frontend
npm install @stellar/stellar-sdk html5-qrcode qrcode
npm install -D @types/qrcode
```

- [ ] **Step 2: Add .env.local.example**

```bash
# frontend/.env.local.example
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

- [ ] **Step 3: Set up fonts and design tokens**

```typescript
// frontend/src/app/fonts.ts
import { Newsreader, Bricolage_Grotesque } from "next/font/google";

export const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["italic", "normal"],
  weight: ["400", "500", "600"],
  variable: "--font-newsreader",
});

export const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-bricolage",
});
```

Replace the generated `frontend/src/app/globals.css` content with:

```css
@import "tailwindcss";

@theme inline {
  --color-ink: #101e1a;
  --color-paper: #f5f7f1;
  --color-emerald: #0b6b4e;
  --color-emerald-bright: #2fd98a;
  --color-emerald-deep: #063d2c;
  --color-gold: #e7a33a;
  --color-rose: #d6533f;
  --font-display: var(--font-newsreader);
  --font-body: var(--font-bricolage);
}

body {
  background: var(--color-paper);
  color: var(--color-ink);
}

.liber-mesh {
  position: absolute;
  inset: -20% -15% auto -15%;
  height: 65vh;
  background:
    radial-gradient(circle at 18% 22%, color-mix(in srgb, var(--color-emerald-bright) 38%, transparent) 0%, transparent 55%),
    radial-gradient(circle at 85% 8%, color-mix(in srgb, var(--color-gold) 28%, transparent) 0%, transparent 50%),
    radial-gradient(circle at 50% 48%, color-mix(in srgb, var(--color-emerald) 22%, transparent) 0%, transparent 60%);
  filter: blur(48px);
  pointer-events: none;
}
```

Wire the fonts into `frontend/src/app/layout.tsx`'s root `<html>`/`<body>`:

```tsx
import { newsreader, bricolage } from "./fonts";
// ...
<html lang="id" className={`${newsreader.variable} ${bricolage.variable}`}>
  <body className="font-body antialiased">{children}</body>
</html>
```

- [ ] **Step 4: Add a minimal PWA manifest**

```json
// frontend/public/manifest.json
{
  "name": "Liber",
  "short_name": "Liber",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#063D2C",
  "theme_color": "#0B6B4E",
  "icons": []
}
```

Link it via Next's `metadata` export in `layout.tsx`: `export const metadata = { title: "Liber", manifest: "/manifest.json" }`. Full offline service-worker caching is skipped — `ponytail: manifest only, add a service worker if the demo actually needs offline access` (it doesn't: the whole flow requires network to backend/Stellar anyway).

- [ ] **Step 5: Verify the dev server runs**

Run: `npm run dev` (inside `frontend/`)
Expected: server starts on `http://localhost:3000`, page loads with the `paper` background color visible (confirms the `@theme` tokens resolved).

- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "Scaffold frontend: Next.js App Router PWA + emerald/gold design tokens"
```

---

### Task 2: Wallet module (client-side keypair + signing + storage)

**Files:**
- Create: `frontend/src/lib/wallet/keypair.ts`
- Create: `frontend/src/lib/wallet/storage.ts`
- Test: `frontend/src/lib/wallet/keypair.test.ts`
- Test: `frontend/src/lib/wallet/storage.test.ts`

**Interfaces:**
- Produces:
  - `generateKeypair(): { publicKey: string; secretKey: string }`
  - `signXdr(secretKey: string, xdr: string, networkPassphrase: string): string`
  - `WalletStorage` interface with `get(key): Promise<string | null>` / `set(key, value): Promise<void>`
  - `MemoryWalletStorage` (tests) and `LocalStorageWalletStorage` (production, wraps `window.localStorage`)
  - `getOrCreateWallet(storage: WalletStorage): Promise<{ publicKey: string; secretKey: string }>` — loads an existing wallet or generates+persists a new one.
- Task 6 (onboarding page) and Task 8 (approve+status page) both depend on these exact names.

- [ ] **Step 1: Write the failing keypair test**

```typescript
// frontend/src/lib/wallet/keypair.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, TransactionBuilder, Account, Operation, Asset } from "@stellar/stellar-sdk";
import { generateKeypair, signXdr } from "./keypair.js";

const NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";

test("generateKeypair returns a valid Stellar keypair", () => {
  const { publicKey, secretKey } = generateKeypair();
  assert.match(publicKey, /^G[A-Z0-9]{55}$/);
  assert.match(secretKey, /^S[A-Z0-9]{55}$/);
  assert.equal(Keypair.fromSecret(secretKey).publicKey(), publicKey);
});

test("signXdr signs a transaction with the given secret key", () => {
  const kp = Keypair.random();
  const account = new Account(kp.publicKey(), "1");
  const tx = new TransactionBuilder(account, { fee: "10000", networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.payment({ destination: kp.publicKey(), asset: Asset.native(), amount: "1" }))
    .setTimeout(30)
    .build();

  const signedXdr = signXdr(kp.secret(), tx.toXDR(), NETWORK_PASSPHRASE);
  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

  assert.equal(signedTx.signatures.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm install -D tsx` then add `"test": "node --import tsx --test $(find src -name '*.test.ts')"` to `package.json`'s scripts, then `npm test -- src/lib/wallet/keypair.test.ts`
Expected: FAIL with "Cannot find module './keypair.js'"

- [ ] **Step 3: Write keypair.ts**

```typescript
// frontend/src/lib/wallet/keypair.ts
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";

export function generateKeypair(): { publicKey: string; secretKey: string } {
  const kp = Keypair.random();
  return { publicKey: kp.publicKey(), secretKey: kp.secret() };
}

export function signXdr(secretKey: string, xdr: string, networkPassphrase: string): string {
  const kp = Keypair.fromSecret(secretKey);
  const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
  tx.sign(kp);
  return tx.toXDR();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/wallet/keypair.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing storage test**

```typescript
// frontend/src/lib/wallet/storage.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryWalletStorage, getOrCreateWallet } from "./storage.js";

test("getOrCreateWallet generates and persists a wallet on first call", async () => {
  const storage = new MemoryWalletStorage();
  const wallet = await getOrCreateWallet(storage);

  assert.match(wallet.publicKey, /^G[A-Z0-9]{55}$/);
  assert.match(wallet.secretKey, /^S[A-Z0-9]{55}$/);
});

test("getOrCreateWallet returns the same wallet on subsequent calls", async () => {
  const storage = new MemoryWalletStorage();
  const first = await getOrCreateWallet(storage);
  const second = await getOrCreateWallet(storage);

  assert.equal(second.publicKey, first.publicKey);
  assert.equal(second.secretKey, first.secretKey);
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- src/lib/wallet/storage.test.ts`
Expected: FAIL with "Cannot find module './storage.js'"

- [ ] **Step 7: Write storage.ts**

```typescript
// frontend/src/lib/wallet/storage.ts
import { generateKeypair } from "./keypair.js";

export interface WalletStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export class MemoryWalletStorage implements WalletStorage {
  private map = new Map<string, string>();
  async get(key: string) {
    return this.map.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.map.set(key, value);
  }
}

export class LocalStorageWalletStorage implements WalletStorage {
  async get(key: string) {
    return window.localStorage.getItem(key);
  }
  async set(key: string, value: string) {
    window.localStorage.setItem(key, value);
  }
}

const SECRET_KEY = "liber:wallet:secretKey";
const PUBLIC_KEY = "liber:wallet:publicKey";

export async function getOrCreateWallet(
  storage: WalletStorage
): Promise<{ publicKey: string; secretKey: string }> {
  const existingSecret = await storage.get(SECRET_KEY);
  const existingPublic = await storage.get(PUBLIC_KEY);
  if (existingSecret && existingPublic) {
    return { publicKey: existingPublic, secretKey: existingSecret };
  }

  const wallet = generateKeypair();
  await storage.set(SECRET_KEY, wallet.secretKey);
  await storage.set(PUBLIC_KEY, wallet.publicKey);
  return wallet;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- src/lib/wallet/storage.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/wallet/ frontend/package.json
git commit -m "Add client-side wallet: keypair generation, XDR signing, pluggable storage"
```

---

### Task 3: QRIS parser (own copy, ported from qris-dinamis MIT)

**Files:**
- Create: `frontend/src/lib/qris/types.ts`
- Create: `frontend/src/lib/qris/crc16.ts`
- Create: `frontend/src/lib/qris/parser.ts`
- Test: `frontend/src/lib/qris/parser.test.ts`

**Interfaces:**
- Produces: `parseQRIS(qrisString: string): QRISData` with `merchantName`, `merchantCity`, `method: "static" | "dynamic"`, `amount?`. Task 7 (scan page) calls this immediately after a camera scan for instant UI feedback, before the raw string is sent to `backend/`'s `POST /orders` (which parses it again server-side as the authoritative source — this duplication is intentional per the isolation boundary, not a shared-code shortcut).

This module is byte-identical in behavior to `backend/src/qris/*` (same plan, Task 3) — write it the same way:

- [ ] **Step 1: Write types.ts**

```typescript
// frontend/src/lib/qris/types.ts
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

- [ ] **Step 2: Write crc16.ts**

```typescript
// frontend/src/lib/qris/crc16.ts
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

- [ ] **Step 3: Write parser.ts**

```typescript
// frontend/src/lib/qris/parser.ts
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

- [ ] **Step 4: Write the failing test, then verify it passes**

```typescript
// frontend/src/lib/qris/parser.test.ts
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
  assert.deepEqual(parseTLV(tlv("00", "01")), [{ tag: "00", length: 2, value: "01" }]);
});

test("parseQRIS extracts merchant name, city, and dynamic amount", () => {
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
  assert.equal(data.merchantName, "Warung Kopi Asa");
  assert.equal(data.amount, "25000");
});
```

Run: `npm test -- src/lib/qris/parser.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/qris/
git commit -m "Add EMVCo/QRIS parser (own copy, ported from qris-dinamis MIT)"
```

---

### Task 4: Backend API client

**Files:**
- Create: `frontend/src/lib/api.ts`
- Test: `frontend/src/lib/api.test.ts`

**Interfaces:**
- Produces the typed client every page uses to talk to `backend/`:
  - `createUser(req: CreateUserRequest): Promise<{ userId: string; unsignedTrustlineXdr: string }>`
  - `confirmTrustline(userId: string, signedXdr: string): Promise<{ ready: boolean }>`
  - `createOrder(req: { userId: string; qrContent: string; amountIdr?: number }): Promise<OrderQuote>`
  - `approveOrder(orderId: string, signedXdr: string): Promise<{ state: string; stellarTxHash: string }>`
  - `getOrder(orderId: string): Promise<OrderStatus>`
  - `getBalance(userId: string): Promise<{ usdcBalance: string; idrEstimate: string }>`
  - `getOrderHistory(userId: string): Promise<HistoryEntry[]>`
- These names and shapes match `backend/`'s routes exactly (see `docs/superpowers/plans/2026-07-15-liber-backend.md` Tasks 10-14).

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/lib/api.test.ts
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createOrder } from "./api.js";

test("createOrder posts to /orders and returns the parsed quote", async () => {
  const fakeFetch = mock.fn(async (url: string, init: RequestInit) => {
    assert.equal(url, "http://backend.test/orders");
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body as string), { userId: "u1", qrContent: "0002..." });
    return new Response(
      JSON.stringify({
        orderId: "o1",
        merchantName: "Warung Kopi Asa",
        merchantCity: "Jakarta",
        amountIdr: "25000",
        amountUsdc: "1.58",
        quoteExpiresAt: "2026-07-15T00:00:30.000Z",
        unsignedBridgeXdr: "FAKE_XDR",
      }),
      { status: 201 }
    );
  });

  const result = await createOrder({ userId: "u1", qrContent: "0002..." }, fakeFetch as typeof fetch, "http://backend.test");

  assert.equal(result.orderId, "o1");
  assert.equal(result.unsignedBridgeXdr, "FAKE_XDR");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/api.test.ts`
Expected: FAIL with "Cannot find module './api.js'"

- [ ] **Step 3: Write api.ts**

```typescript
// frontend/src/lib/api.ts
export interface CreateUserRequest {
  stellarPublicKey: string;
  email: string;
  fullname: string;
  address: string;
  idNumber: string;
  idFileBase64: string;
  bankAccountNumber: string;
  bankCode: string;
  provider: "gopay" | "dana" | "ovo" | "other";
}

export interface OrderQuote {
  orderId: string;
  merchantName: string;
  merchantCity: string;
  amountIdr: string;
  amountUsdc: string;
  quoteExpiresAt: string;
  unsignedBridgeXdr: string;
}

export interface OrderStatus {
  state: string;
  merchantName: string;
  amountIdr: string;
  amountUsdc: string;
  stellarTxHash: string | null;
  failureReason: string | null;
  ewalletHandoff: { appLink: string | null; qrContent: string };
}

function baseUrl(override?: string): string {
  return override ?? process.env.NEXT_PUBLIC_BACKEND_URL!;
}

async function postJson<T>(path: string, body: unknown, fetchImpl: typeof fetch, base: string): Promise<T> {
  const res = await fetchImpl(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
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

export async function createOrder(
  req: { userId: string; qrContent: string; amountIdr?: number },
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<OrderQuote> {
  return postJson("/orders", req, fetchImpl, base);
}

export async function approveOrder(
  orderId: string,
  signedXdr: string,
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<{ state: string; stellarTxHash: string }> {
  return postJson(`/orders/${orderId}/approve`, { signedXdr }, fetchImpl, base);
}

export async function getOrder(
  orderId: string,
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<OrderStatus> {
  const res = await fetchImpl(`${base}/orders/${orderId}`);
  if (!res.ok) throw new Error(`getOrder failed: ${res.status}`);
  return res.json();
}

export async function getBalance(
  userId: string,
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<{ usdcBalance: string; idrEstimate: string }> {
  const res = await fetchImpl(`${base}/users/${userId}/balance`);
  if (!res.ok) throw new Error(`getBalance failed: ${res.status}`);
  return res.json();
}

export interface HistoryEntry {
  orderId: string;
  merchantName: string;
  merchantCity: string;
  amountIdr: string;
  amountUsdc: string;
  state: string;
  stellarTxHash: string | null;
  createdAt: string;
}

export async function getOrderHistory(
  userId: string,
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<HistoryEntry[]> {
  const res = await fetchImpl(`${base}/users/${userId}/orders`);
  if (!res.ok) throw new Error(`getOrderHistory failed: ${res.status}`);
  const body = (await res.json()) as { orders: HistoryEntry[] };
  return body.orders;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "Add typed backend API client"
```

---

### Task 5: Design system primitives

**Files:**
- Create: `frontend/src/components/ui/PageShell.tsx`
- Create: `frontend/src/components/ui/Card.tsx`
- Create: `frontend/src/components/ui/Button.tsx`
- Create: `frontend/src/components/ui/GradientBalanceCard.tsx`
- Create: `frontend/src/components/ui/StatusPill.tsx`

**Interfaces:**
- Produces the shared visual vocabulary every page (Tasks 6-11) composes from — no page should hand-roll its own button/card styling. This is what makes six independently-built screens read as one coherent app.
- No tests — these are pure presentational components with no business logic; correctness is verified visually (Task 6+'s manual checklists include a screenshot review).

- [ ] **Step 1: Write PageShell.tsx**

```tsx
// frontend/src/components/ui/PageShell.tsx
import type { ReactNode } from "react";

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-paper text-ink">
      <div className="liber-mesh" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-5 pb-28 pt-8">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write Card.tsx**

```tsx
// frontend/src/components/ui/Card.tsx
import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl bg-white/90 p-5 shadow-[0_20px_45px_-25px_rgba(11,107,78,0.45)] ${className}`}>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Write Button.tsx**

```tsx
// frontend/src/components/ui/Button.tsx
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-gold text-ink shadow-[0_12px_30px_-12px_rgba(231,163,58,0.65)]",
  secondary: "bg-emerald text-white shadow-[0_12px_30px_-12px_rgba(11,107,78,0.6)]",
  ghost: "border border-ink/15 bg-transparent text-ink",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`w-full rounded-full px-6 py-4 text-base font-semibold transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
```

- [ ] **Step 4: Write GradientBalanceCard.tsx**

```tsx
// frontend/src/components/ui/GradientBalanceCard.tsx
export function GradientBalanceCard({
  usdcBalance,
  idrEstimate,
}: {
  usdcBalance: string;
  idrEstimate: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-emerald-deep via-emerald to-emerald-bright p-6 text-white shadow-[0_25px_50px_-20px_rgba(6,61,44,0.55)]">
      <div className="absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
      <p className="font-display text-sm italic text-white/70">Saldo kamu</p>
      <p className="mt-2 font-body text-4xl font-semibold tabular-nums">
        {usdcBalance} <span className="text-lg font-normal text-white/70">USDC</span>
      </p>
      <p className="mt-1 text-sm text-white/70 tabular-nums">≈ Rp {Number(idrEstimate).toLocaleString("id-ID")}</p>
    </div>
  );
}
```

- [ ] **Step 5: Write StatusPill.tsx**

```tsx
// frontend/src/components/ui/StatusPill.tsx
const STYLES: Record<string, string> = {
  scanned: "bg-ink/5 text-ink/60",
  quoted: "bg-ink/5 text-ink/60",
  approved: "bg-gold/15 text-[#8a5c14]",
  bridging: "bg-gold/15 text-[#8a5c14]",
  redeeming: "bg-gold/15 text-[#8a5c14]",
  completed: "bg-emerald/15 text-emerald-deep",
  failed: "bg-rose/15 text-rose",
};

export function StatusPill({ state, label }: { state: string; label: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${STYLES[state] ?? STYLES.scanned}`}>
      {label}
    </span>
  );
}
```

- [ ] **Step 6: Verify visually**

Run `npm run dev`, temporarily render `<PageShell><Card>Test</Card><Button>Test</Button></PageShell>` on the home route, confirm in a browser: the mesh gradient is visible behind the content, the card has a soft emerald-tinted shadow (not a flat grey border), and the button is a full-width gold pill. Remove the temporary render before moving on.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ui/
git commit -m "Add design system primitives: PageShell, Card, Button, GradientBalanceCard, StatusPill"
```

---

### Task 6: Onboarding page

**Files:**
- Create: `frontend/src/app/onboarding/page.tsx`
- Create: `frontend/src/components/OnboardingForm.tsx`

**Interfaces:**
- Consumes: `getOrCreateWallet`/`LocalStorageWalletStorage` (Task 2), `signXdr` (Task 2), `createUser`/`confirmTrustline` (Task 4), `PageShell`/`Card`/`Button` (Task 5).
- Produces: on success, persists `userId` in `localStorage` under key `liber:userId` and redirects to `/`. Task 7 reads this key to know a user is onboarded.

**Visual intent:** the first thing a new user sees, so it carries the brand thesis. A `font-display italic` headline ("Uangmu, bebas berpindah.") above a short one-line subhead, then the form inside a `Card`. Provider selection (GoPay/DANA/OVO/lainnya) as a row of tappable pill chips rather than a plain `<select>` — this is the one place the "which e-wallet" choice deserves to feel tactile, not administrative. Inputs are full-width, `rounded-2xl`, a light `bg-paper` fill with no visible border until focused (focus ring in `emerald`). Submit button is the primary gold `Button`, sticky-ish at the natural bottom of the form (not fixed, this page scrolls).

- [ ] **Step 1: Write OnboardingForm.tsx**

```tsx
// frontend/src/components/OnboardingForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getOrCreateWallet, LocalStorageWalletStorage } from "@/lib/wallet/storage";
import { signXdr } from "@/lib/wallet/keypair";
import { createUser, confirmTrustline } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const USER_ID_KEY = "liber:userId";

const PROVIDERS = [
  { value: "gopay", label: "GoPay" },
  { value: "dana", label: "DANA" },
  { value: "ovo", label: "OVO" },
  { value: "other", label: "Bank lain" },
] as const;

const inputClass =
  "w-full rounded-2xl bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink/40 outline-none ring-1 ring-transparent focus:ring-emerald";

export function OnboardingForm() {
  const router = useRouter();
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]["value"]>("gopay");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const form = new FormData(e.currentTarget);
      const idFile = form.get("idFile") as File;
      const idFileBase64 = Buffer.from(await idFile.arrayBuffer()).toString("base64");

      const wallet = await getOrCreateWallet(new LocalStorageWalletStorage());

      const { userId, unsignedTrustlineXdr } = await createUser({
        stellarPublicKey: wallet.publicKey,
        email: String(form.get("email")),
        fullname: String(form.get("fullname")),
        address: String(form.get("address")),
        idNumber: String(form.get("idNumber")),
        idFileBase64,
        bankAccountNumber: String(form.get("bankAccountNumber")),
        bankCode: String(form.get("bankCode")),
        provider,
      });

      const signedXdr = signXdr(wallet.secretKey, unsignedTrustlineXdr, NETWORK_PASSPHRASE);
      await confirmTrustline(userId, signedXdr);

      window.localStorage.setItem(USER_ID_KEY, userId);
      router.push("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <input name="email" type="email" placeholder="Email" required className={inputClass} />
        <input name="fullname" placeholder="Nama lengkap" required className={inputClass} />
        <input name="address" placeholder="Alamat" required className={inputClass} />
        <input name="idNumber" placeholder="NIK" required className={inputClass} />
        <label className="text-xs text-ink/60">
          Foto KTP
          <input name="idFile" type="file" accept="image/*" required className={`${inputClass} mt-1`} />
        </label>

        <div>
          <p className="mb-2 text-xs font-medium text-ink/60">Terima Rupiah lewat</p>
          <div className="flex flex-wrap gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setProvider(p.value)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  provider === p.value ? "bg-emerald text-white" : "bg-paper text-ink/70"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <input name="bankAccountNumber" placeholder="Nomor rekening/HP" required className={inputClass} />
        <input name="bankCode" placeholder="Kode bank (mis. GOPAY)" required className={inputClass} />
      </Card>

      {error && <p className="text-sm text-rose">{error}</p>}

      <Button type="submit" disabled={submitting}>
        {submitting ? "Memproses..." : "Buat akun"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Write page.tsx**

```tsx
// frontend/src/app/onboarding/page.tsx
import { PageShell } from "@/components/ui/PageShell";
import { OnboardingForm } from "@/components/OnboardingForm";

export default function OnboardingPage() {
  return (
    <PageShell>
      <h1 className="font-display text-3xl leading-tight text-ink">
        Uangmu, <span className="italic text-emerald">bebas berpindah.</span>
      </h1>
      <p className="mt-2 text-sm text-ink/60">
        Terima gaji dari mana saja, bayar QRIS apa saja di Indonesia. Buat akun dalam satu langkah.
      </p>
      <div className="mt-6">
        <OnboardingForm />
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 3: Manual verification checklist**

Run `npm run dev`, open `http://localhost:3000/onboarding` on a phone or desktop browser with `backend/` running locally with a real `DATABASE_URL` and (for a real IDRX onboarding response) a valid `IDRX_API_KEY`/`IDRX_API_SECRET`:

1. Take a screenshot of the page before filling anything in. Confirm: the italic emerald headline word is visible, the provider chips are tappable pills (not a dropdown), the mesh gradient is visible behind the card.
2. Fill every field, submit a real ID photo, tap a provider chip and confirm it visually highlights.
3. Confirm no console error; confirm `localStorage.getItem("liber:userId")` is set (browser devtools).
4. Confirm `backend/`'s Postgres `users` table has a new row with a non-null `idrx_deposit_address`.
5. Confirm the Stellar account (`stellar_public_key`) is visible and funded on `stellar.expert` (mainnet) shortly after submission.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/onboarding/ frontend/src/components/OnboardingForm.tsx
git commit -m "Add onboarding page: wallet generation, KYC form, trustline signing"
```

---

### Task 7: Scan + quote page

**Files:**
- Create: `frontend/src/app/pay/page.tsx`
- Create: `frontend/src/components/QrScanner.tsx`
- Create: `frontend/src/components/QuoteCard.tsx`

**Interfaces:**
- Consumes: `parseQRIS` (Task 3), `createOrder` (Task 4), `PageShell`/`Card`/`Button` (Task 5).
- Produces: on a successful quote, navigates to `/pay/[orderId]` (Task 8) carrying `unsignedBridgeXdr` via a client-side store (`sessionStorage`, key `liber:pendingBridgeXdr:{orderId}` — simplest way to hand a large string to the next page without a global state library).

**Visual intent:** the camera view sits inside a rounded "viewfinder" frame with four corner brackets (a real scanner cue, not a bare video rectangle) so it reads as a deliberate scan tool, not a webcam demo. Once quoted, `QuoteCard` looks like a receipt: merchant name as an eyebrow label, the Rupiah amount as the dominant `font-display italic` numeral (this is the moment the "money" personality of the type pairing should show up most), the USDC equivalent smaller beneath it, and a slim countdown progress bar (not just text) ticking down under the amount.

- [ ] **Step 1: Write QrScanner.tsx**

```tsx
// frontend/src/components/QrScanner.tsx
"use client";

import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

export function QrScanner({ onScan }: { onScan: (text: string) => void }) {
  const containerId = "qr-reader";
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;
    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
          onScan(decodedText);
          scanner.stop().catch(() => {});
        },
        () => {}
      )
      .catch((err) => console.error("camera start failed", err));

    return () => {
      scannerRef.current?.stop().catch(() => {});
    };
  }, [onScan]);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-[28px] bg-ink">
      <div id={containerId} className="h-full w-full [&_video]:!h-full [&_video]:!w-full [&_video]:object-cover" />
      {(["top-4 left-4 border-l-2 border-t-2", "top-4 right-4 border-r-2 border-t-2", "bottom-4 left-4 border-l-2 border-b-2", "bottom-4 right-4 border-r-2 border-b-2"] as const).map(
        (pos) => (
          <div key={pos} className={`pointer-events-none absolute h-8 w-8 rounded-sm border-emerald-bright ${pos}`} />
        )
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write QuoteCard.tsx**

```tsx
// frontend/src/components/QuoteCard.tsx
"use client";

import { useEffect, useState } from "react";
import type { OrderQuote } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const QUOTE_WINDOW_SECONDS = 30;

export function QuoteCard({ quote, onApprove }: { quote: OrderQuote; onApprove: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(QUOTE_WINDOW_SECONDS);

  useEffect(() => {
    const expiresAt = new Date(quote.quoteExpiresAt).getTime();
    const interval = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
    }, 500);
    return () => clearInterval(interval);
  }, [quote.quoteExpiresAt]);

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-ink/50">
          {quote.merchantName} &middot; {quote.merchantCity}
        </p>
        <p className="mt-2 font-display text-4xl italic text-ink tabular-nums">
          Rp {Number(quote.amountIdr).toLocaleString("id-ID")}
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
        <p className="mt-1 text-xs text-ink/40">Kuotasi berlaku {secondsLeft} detik lagi</p>
      </div>

      <Button onClick={onApprove} disabled={secondsLeft <= 0}>
        Bayar sekarang
      </Button>
    </Card>
  );
}
```

- [ ] **Step 3: Write pay/page.tsx**

```tsx
// frontend/src/app/pay/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/ui/PageShell";
import { QrScanner } from "@/components/QrScanner";
import { QuoteCard } from "@/components/QuoteCard";
import { parseQRIS } from "@/lib/qris/parser";
import { createOrder, type OrderQuote } from "@/lib/api";

export default function PayPage() {
  const router = useRouter();
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleScan(qrContent: string) {
    try {
      const parsed = parseQRIS(qrContent);
      const userId = window.localStorage.getItem("liber:userId");
      if (!userId) throw new Error("Belum onboarding. Buka /onboarding dulu.");

      let amountIdr: number | undefined;
      if (!parsed.amount) {
        const input = window.prompt(`Nominal untuk ${parsed.merchantName} (Rp)`);
        if (!input) return;
        amountIdr = Number(input);
      }

      const result = await createOrder({ userId, qrContent, amountIdr });
      window.sessionStorage.setItem(`liber:pendingBridgeXdr:${result.orderId}`, result.unsignedBridgeXdr);
      setQuote(result);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <PageShell>
      <h1 className="font-display text-2xl italic text-ink">Scan QRIS</h1>
      <div className="mt-6">
        {!quote && <QrScanner onScan={handleScan} />}
        {error && <p className="mt-4 text-center text-sm text-rose">{error}</p>}
        {quote && <QuoteCard quote={quote} onApprove={() => router.push(`/pay/${quote.orderId}`)} />}
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 4: Manual verification checklist**

On a real phone (camera access requires HTTPS or `localhost`):

1. Open `/pay`, grant camera permission, confirm the corner-bracket viewfinder frame renders around the camera feed.
2. Scan a real static QRIS (e.g. print one from `qris-dinamis`'s demo or any real merchant QRIS with a known small amount).
3. Confirm merchant name/city appear correctly, and the Rupiah amount renders large in the italic display font.
4. For a static QRIS, confirm the nominal prompt appears and the resulting quote reflects it.
5. Confirm the countdown progress bar visibly shrinks over 30 seconds and the button disables at 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pay/page.tsx frontend/src/components/QrScanner.tsx frontend/src/components/QuoteCard.tsx
git commit -m "Add scan + quote page (camera QRIS scan, EMVCo parse, backend quote)"
```

---

### Task 8: Approve + status page

**Files:**
- Create: `frontend/src/app/pay/[orderId]/page.tsx`
- Create: `frontend/src/components/OrderStatus.tsx`

**Interfaces:**
- Consumes: `signXdr` + `LocalStorageWalletStorage`/`getOrCreateWallet` (Task 2), `approveOrder`/`getOrder` (Task 4), `PageShell`/`Card`/`Button`/`StatusPill` (Task 5).
- Produces: polls until `state` is `"completed"` or `"failed"`, then renders the handoff (the terminal state of the same page, not a separate route).

**Visual intent:** this page is live for minutes (the bridge takes real time per spec §7), so it needs to feel like progress, not a stuck spinner. A vertical stepper (Approve, Bridging, Redeeming, Selesai) with a `StatusPill` marking the current step and a thin connecting line that fills in emerald as steps complete. On completion, the re-displayed QR sits in a bordered card that visually echoes the scan viewfinder from Task 7 (same rounded-corner treatment) so it reads as "the same QR, now for your own e-wallet."

- [ ] **Step 1: Write OrderStatus.tsx**

```tsx
// frontend/src/components/OrderStatus.tsx
"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { getOrder, type OrderStatus as OrderStatusData } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";

const STEPS = [
  { key: "approved", label: "Disetujui" },
  { key: "bridging", label: "Mengirim USDC lintas rantai" },
  { key: "redeeming", label: "Mencairkan ke Rupiah" },
  { key: "completed", label: "Selesai" },
] as const;

const STEP_INDEX: Record<string, number> = {
  approved: 0,
  bridging: 1,
  redeeming: 2,
  completed: 3,
  failed: 3,
};

export function OrderStatus({ orderId }: { orderId: string }) {
  const [status, setStatus] = useState<OrderStatusData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  useEffect(() => {
    const interval = setInterval(async () => {
      const result = await getOrder(orderId);
      setStatus(result);
      if (result.state === "completed" || result.state === "failed") {
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [orderId]);

  useEffect(() => {
    if (status?.state === "completed") {
      QRCode.toDataURL(status.ewalletHandoff.qrContent).then(setQrDataUrl);
    }
  }, [status]);

  if (!status) {
    return <p className="mt-8 text-center text-sm text-ink/60">Memuat status...</p>;
  }

  const currentIndex = STEP_INDEX[status.state] ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <ol className="flex flex-col gap-4">
          {STEPS.map((step, i) => (
            <li key={step.key} className="flex items-center gap-3">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  i <= currentIndex ? "bg-emerald" : "bg-ink/15"
                }`}
              />
              <span className={`text-sm ${i <= currentIndex ? "text-ink" : "text-ink/40"}`}>{step.label}</span>
            </li>
          ))}
        </ol>
        {status.state === "failed" && (
          <div className="mt-4">
            <StatusPill state="failed" label="Gagal" />
            <p className="mt-2 text-sm text-rose">{status.failureReason}</p>
          </div>
        )}
      </Card>

      {status.state === "completed" && (
        <Card className="flex flex-col items-center gap-4 text-center">
          <StatusPill state="completed" label="Siap dibayar" />
          <p className="text-sm text-ink/60">
            Saldo di e-wallet kamu sudah bertambah. Scan ulang QRIS {status.merchantName} ini dari aplikasi e-wallet untuk membayar merchant.
          </p>
          {qrDataUrl && (
            <div className="rounded-3xl bg-ink p-4">
              <img src={qrDataUrl} alt="QRIS" width={200} height={200} />
            </div>
          )}
          {status.ewalletHandoff.appLink && (
            <a href={status.ewalletHandoff.appLink} className="w-full">
              <Button variant="secondary">Buka e-wallet</Button>
            </a>
          )}
          {status.stellarTxHash && (
            <p className="break-all text-xs text-ink/40">Tx: {status.stellarTxHash}</p>
          )}
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write pay/[orderId]/page.tsx**

```tsx
// frontend/src/app/pay/[orderId]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageShell } from "@/components/ui/PageShell";
import { getOrCreateWallet, LocalStorageWalletStorage } from "@/lib/wallet/storage";
import { signXdr } from "@/lib/wallet/keypair";
import { approveOrder } from "@/lib/api";
import { OrderStatus } from "@/components/OrderStatus";

const NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";

export default function OrderPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function approve() {
      try {
        const unsignedXdr = window.sessionStorage.getItem(`liber:pendingBridgeXdr:${orderId}`);
        if (!unsignedXdr) throw new Error("Sesi kadaluarsa, scan ulang QRIS-nya.");

        const wallet = await getOrCreateWallet(new LocalStorageWalletStorage());
        const signedXdr = signXdr(wallet.secretKey, unsignedXdr, NETWORK_PASSPHRASE);
        await approveOrder(orderId, signedXdr);
        setApproved(true);
      } catch (err) {
        setError((err as Error).message);
      }
    }
    approve();
  }, [orderId]);

  return (
    <PageShell>
      <h1 className="font-display text-2xl italic text-ink">Status pembayaran</h1>
      <div className="mt-6">
        {error && <p className="text-center text-sm text-rose">{error}</p>}
        {!error && !approved && <p className="text-center text-sm text-ink/60">Menandatangani transaksi...</p>}
        {!error && approved && <OrderStatus orderId={orderId} />}
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 3: Manual verification checklist**

With `backend/` pointed at real mainnet config and a small real USDC balance in the test wallet:

1. Complete a scan+quote (Task 7), land on `/pay/[orderId]`.
2. Confirm the transaction signs without error and the stepper shows "Disetujui" then advances to "Mengirim USDC lintas rantai" with the emerald dot progression.
3. Wait for the Allbridge bridge to confirm (per spec, ~minutes) — confirm the stepper advances to "Mencairkan ke Rupiah" then "Selesai".
4. Confirm the QR image renders in the dark card and matches the originally scanned QRIS (open both side by side).
5. Confirm tapping "Buka e-wallet" attempts to open the app (or no-ops harmlessly if the scheme isn't registered on the test device — this is expected per spec §10.3, the QR re-scan is the real mechanism).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/pay/[orderId]/ frontend/src/components/OrderStatus.tsx
git commit -m "Add approve + status page: sign bridge tx, poll status, e-wallet handoff"
```

---

### Task 9: Balance + home page

**Files:**
- Create: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: `getBalance` (Task 4), `PageShell`/`GradientBalanceCard`/`Button` (Task 5).
- Produces: the app's landing page — redirects to `/onboarding` if no `liber:userId` is set, otherwise shows balance + navigation to scan/receive/history.

**Visual intent:** this is the screen a returning user sees every day, so it's where `GradientBalanceCard` gets its full hero treatment at the top. Below it, two large action tiles side by side (Scan QRIS as the gold primary action since it's the core feature, Terima USDC as a secondary outline tile), then a quiet text link to history beneath, not competing for attention.

- [ ] **Step 1: Write page.tsx**

```tsx
// frontend/src/app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/ui/PageShell";
import { GradientBalanceCard } from "@/components/ui/GradientBalanceCard";
import { getBalance } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [balance, setBalance] = useState<{ usdcBalance: string; idrEstimate: string } | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("liber:userId");
    if (!stored) {
      router.push("/onboarding");
      return;
    }
    setUserId(stored);
    getBalance(stored).then(setBalance).catch(() => setBalance({ usdcBalance: "0.00", idrEstimate: "0" }));
  }, [router]);

  if (!userId) return null;

  return (
    <PageShell>
      <p className="font-display text-lg italic text-ink/70">Halo,</p>
      <h1 className="font-display text-2xl text-ink">selamat datang kembali.</h1>

      <div className="mt-6">
        {balance ? (
          <GradientBalanceCard usdcBalance={balance.usdcBalance} idrEstimate={balance.idrEstimate} />
        ) : (
          <div className="h-40 animate-pulse rounded-[28px] bg-ink/5" />
        )}
      </div>

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
    </PageShell>
  );
}
```

- [ ] **Step 2: Manual verification checklist**

1. Clear `localStorage`, open `/` — confirm redirect to `/onboarding`.
2. Complete onboarding, land back on `/` — confirm the `GradientBalanceCard` renders (0 USDC / Rp 0 for a freshly funded account with no USDC yet), and take a screenshot to confirm the emerald gradient, italic label, and tabular-nums balance figure all render as designed.
3. Send a small amount of real USDC to the displayed account (manually, via any Stellar wallet) and refresh — confirm the balance updates.
4. Tap "Scan QRIS" and "Terima USDC" tiles — confirm both navigate correctly.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "Add home page: gradient balance card + navigation"
```

---

### Task 10: Receive page (own address + QR)

**Files:**
- Create: `frontend/src/app/receive/page.tsx`

**Interfaces:**
- Consumes: `getOrCreateWallet`/`LocalStorageWalletStorage` (Task 2), `PageShell`/`Card`/`Button` (Task 5). Covers the "Terima USDC" MVP feature (`LIBER-CONCEPT.md` §4 item 2) — a way for the user to receive USDC/salary transfers into their Liber wallet from outside the app.

**Visual intent:** mirrors the scan viewfinder's dark rounded frame (Task 7) but displaying a QR to show, not a camera to scan, visually pairing the two "QR moments" in the app. The address sits below in a monospace pill with a one-tap copy affordance.

- [ ] **Step 1: Write receive/page.tsx**

```tsx
// frontend/src/app/receive/page.tsx
"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { PageShell } from "@/components/ui/PageShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { getOrCreateWallet, LocalStorageWalletStorage } from "@/lib/wallet/storage";

export default function ReceivePage() {
  const [address, setAddress] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getOrCreateWallet(new LocalStorageWalletStorage()).then(async (wallet) => {
      setAddress(wallet.publicKey);
      setQrDataUrl(await QRCode.toDataURL(wallet.publicKey));
    });
  }, []);

  if (!address) return <p className="mt-8 text-center text-sm text-ink/60">Memuat alamat...</p>;

  return (
    <PageShell>
      <h1 className="font-display text-2xl italic text-ink">Terima USDC</h1>
      <Card className="mt-6 flex flex-col items-center gap-4 text-center">
        <div className="rounded-3xl bg-ink p-4">
          {qrDataUrl && <img src={qrDataUrl} alt="Alamat Stellar" width={200} height={200} />}
        </div>
        <p className="break-all rounded-2xl bg-paper px-4 py-3 font-mono text-xs text-ink/70">{address}</p>
        <Button
          variant="secondary"
          onClick={() => {
            navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Tersalin." : "Salin alamat"}
        </Button>
        <p className="text-xs text-ink/40">
          Kirim USDC (Stellar) ke alamat ini. Saldo muncul di halaman utama setelah transaksi selesai.
        </p>
      </Card>
    </PageShell>
  );
}
```

- [ ] **Step 2: Manual verification checklist**

1. Open `/receive`, confirm the QR renders inside the dark card and the address text matches `localStorage`'s `liber:wallet:publicKey`.
2. Scan the QR with a separate Stellar wallet app — confirm it reads as a valid `G...` address.
3. Send a small amount of real USDC to it from another wallet, then check `/` — confirm the balance updates.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/receive/
git commit -m "Add receive page: show wallet address as QR for incoming USDC"
```

---

### Task 11: Transaction history page

**Files:**
- Create: `frontend/src/app/history/page.tsx`

**Interfaces:**
- Consumes: `getOrderHistory` (Task 4), `PageShell`/`Card`/`StatusPill` (Task 5). Covers the "Riwayat transaksi" MVP feature (`LIBER-CONCEPT.md` §4 item 4) — a receipt list with merchant name and tx hash as on-chain proof.

**Visual intent:** each entry reads like a receipt stub, not a table row: merchant name prominent, a `StatusPill` for state (color-coded per Task 5's palette), Rupiah amount in tabular numerals, and the tx hash truncated (`0x1234...abcd` style) rather than wrapped across lines.

- [ ] **Step 1: Write history/page.tsx**

```tsx
// frontend/src/app/history/page.tsx
"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { getOrderHistory, type HistoryEntry } from "@/lib/api";

const STATE_LABELS: Record<string, string> = {
  scanned: "Diproses",
  quoted: "Diproses",
  approved: "Diproses",
  bridging: "Diproses",
  redeeming: "Diproses",
  completed: "Selesai",
  failed: "Gagal",
};

function truncateHash(hash: string): string {
  return hash.length > 14 ? `${hash.slice(0, 8)}...${hash.slice(-6)}` : hash;
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    const userId = window.localStorage.getItem("liber:userId");
    if (userId) getOrderHistory(userId).then(setEntries);
  }, []);

  return (
    <PageShell>
      <h1 className="font-display text-2xl italic text-ink">Riwayat transaksi</h1>

      {!entries && <p className="mt-8 text-center text-sm text-ink/60">Memuat riwayat...</p>}
      {entries?.length === 0 && <p className="mt-8 text-center text-sm text-ink/40">Belum ada transaksi.</p>}

      <ul className="mt-6 flex flex-col gap-3">
        {entries?.map((entry) => (
          <li key={entry.orderId}>
            <Card className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-ink">{entry.merchantName}</span>
                <StatusPill state={entry.state} label={STATE_LABELS[entry.state] ?? entry.state} />
              </div>
              <p className="text-xs text-ink/50">{entry.merchantCity}</p>
              <p className="text-sm tabular-nums text-ink/80">
                Rp {Number(entry.amountIdr).toLocaleString("id-ID")} &middot; {entry.amountUsdc} USDC
              </p>
              {entry.stellarTxHash && (
                <p className="font-mono text-xs text-ink/40">Tx: {truncateHash(entry.stellarTxHash)}</p>
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

- [ ] **Step 2: Manual verification checklist**

1. Complete at least one full scan-to-pay flow (Tasks 7-8).
2. Open `/history`, confirm the completed order appears with a `StatusPill` and correct merchant name, amount, and truncated tx hash.
3. Confirm the tx hash (expand it in devtools or hover) matches what's visible on `stellar.expert` for that account.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/history/
git commit -m "Add transaction history page (receipts with StatusPill + tx hash)"
```

---

## Deployment (Vercel)

After Task 11 is verified:

```bash
cd frontend
vercel link      # if not already linked
vercel env add NEXT_PUBLIC_BACKEND_URL production   # https://<railway-backend-url>
vercel deploy --prod
```
