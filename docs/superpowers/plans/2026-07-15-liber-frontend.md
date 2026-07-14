# Liber Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `frontend/` Next.js PWA — onboarding, QR scan, quote, approve/sign, status tracking, e-wallet handoff, balance and history — that drives the Liber payment flow entirely through the `backend/` HTTP API defined in `docs/superpowers/plans/2026-07-15-liber-backend.md`.

**Architecture:** Next.js App Router PWA. A thin `lib/` layer holds all non-UI logic (wallet keypair + signing, QRIS parsing, the backend API client) so it's unit-testable without a browser. Pages are thin — they call `lib/` functions and render state. The wallet's secret key never leaves the browser and is never sent to `backend/`; only signed XDR strings are.

**Tech Stack:** Next.js (App Router, TypeScript), `@stellar/stellar-sdk` (client-side keypair + signing), `html5-qrcode` (camera scanning), `qrcode` (re-rendering a QR image for the e-wallet handoff step). Test runner for `lib/` logic: Node's built-in `node:test` (same choice as `backend/`, for the same reason — nothing here needs more than that). Pages are verified with a manual checklist per the approved spec (`docs/superpowers/specs/2026-07-15-liber-architecture-design.md` §8: no e2e framework for MVP — camera QR scanning needs real hardware anyway).

## Global Constraints

- This is `frontend/` — a fully standalone project. No root `package.json`, no workspace file, no imports from `../backend` or `../contracts`. Any logic shared in spirit with `backend/` (e.g. the QRIS parser) is duplicated here as its own copy, per the approved "fully isolated" repo decision.
- Deploy target: Vercel (`vercel deploy`, project root = `frontend/`).
- **v1 wallet model (spec §10.1):** a plain Stellar Ed25519 keypair generated in the browser via `Keypair.random()`. The secret key is stored in `window.localStorage` (a simplification from the spec's IndexedDB mention — same security posture, same "backend never sees it" boundary, just a synchronous API instead of IndexedDB's async transactions; not worth the extra complexity for one string value in a hackathon MVP). This is a `ponytail:`-flagged shortcut — upgrade path is Passkey Kit once its mainnet deployment ships (spec §10.1).
- Boundary rule (spec §5): this app never calls Horizon, Allbridge, or IDRX directly — only `backend/`'s HTTP API (`NEXT_PUBLIC_BACKEND_URL`).
- No e2e test framework added. Pure logic in `lib/` gets `node:test` coverage; pages get a manual checklist (concrete steps, run on a real phone for camera access).

---

### Task 1: Scaffold Next.js PWA

**Files:**
- Create: `frontend/` (via `create-next-app`)
- Create: `frontend/public/manifest.json`
- Modify: `frontend/src/app/layout.tsx`

**Interfaces:**
- Produces: a running Next.js dev server with a health-check-equivalent home page, and `NEXT_PUBLIC_BACKEND_URL` wired through `.env.local`.

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

- [ ] **Step 3: Add a minimal PWA manifest**

```json
// frontend/public/manifest.json
{
  "name": "Liber",
  "short_name": "Liber",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#0f172a",
  "icons": []
}
```

Link it in `frontend/src/app/layout.tsx` by adding `<link rel="manifest" href="/manifest.json" />` inside the existing `<head>` (via Next's `metadata` export: `export const metadata = { manifest: "/manifest.json" }`). Full offline service-worker caching is skipped — `ponytail: manifest only, add a service worker if the demo actually needs offline access` (it doesn't: the whole flow requires network to backend/Stellar anyway).

- [ ] **Step 4: Verify the dev server runs**

Run: `npm run dev` (inside `frontend/`)
Expected: server starts on `http://localhost:3000`, default Next.js page loads in browser.

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "Scaffold frontend: Next.js App Router PWA"
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
- Task 5 (onboarding page) and Task 6/7 (sign order transactions) both depend on these exact names.

- [ ] **Step 1: Write the failing keypair test**

```typescript
// frontend/src/lib/wallet/keypair.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, TransactionBuilder, Account, Operation } from "@stellar/stellar-sdk";
import { generateKeypair, signXdr } from "./keypair.js";

const NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";

test("generateKeypair returns a valid Stellar keypair", () => {
  const { publicKey, secretKey } = generateKeypair();
  assert.match(publicKey, /^G[A-Z0-9]{55}$/);
  assert.match(secretKey, /^S[A-Z0-9]{55}$/);
  // round-trips through stellar-sdk
  assert.equal(Keypair.fromSecret(secretKey).publicKey(), publicKey);
});

test("signXdr signs a transaction with the given secret key", () => {
  const kp = Keypair.random();
  const account = new Account(kp.publicKey(), "1");
  const tx = new TransactionBuilder(account, { fee: "10000", networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.payment({ destination: kp.publicKey(), asset: Operation as any, amount: "1" }))
    .setTimeout(30)
    .build();

  const signedXdr = signXdr(kp.secret(), tx.toXDR(), NETWORK_PASSPHRASE);
  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

  assert.equal(signedTx.signatures.length, 1);
});
```

Note: the payment operation's `asset` field in the test fixture is only there to build a syntactically valid transaction for signing — replace `Operation as any` with a real `Asset.native()` import from `@stellar/stellar-sdk` before running.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --import tsx --test src/lib/wallet/keypair.test.ts` (add `tsx` as a devDependency: `npm install -D tsx`, and a `"test": "node --import tsx --test src/**/*.test.ts"` script to `package.json`)
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
- Produces: `parseQRIS(qrisString: string): QRISData` with `merchantName`, `merchantCity`, `method: "static" | "dynamic"`, `amount?`. Task 6 (scan page) calls this immediately after a camera scan for instant UI feedback, before the raw string is sent to `backend/`'s `POST /orders` (which parses it again server-side as the authoritative source — this duplication is intentional per the isolation boundary, not a shared-code shortcut).

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

### Task 5: Onboarding page

**Files:**
- Create: `frontend/src/app/onboarding/page.tsx`
- Create: `frontend/src/components/OnboardingForm.tsx`

**Interfaces:**
- Consumes: `getOrCreateWallet`/`LocalStorageWalletStorage` (Task 2), `signXdr` (Task 2), `createUser`/`confirmTrustline` (Task 4).
- Produces: on success, persists `userId` in `localStorage` under key `liber:userId` and redirects to `/`. Task 6 reads this key to know a user is onboarded.

- [ ] **Step 1: Write OnboardingForm.tsx**

```tsx
// frontend/src/components/OnboardingForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getOrCreateWallet, LocalStorageWalletStorage } from "@/lib/wallet/storage";
import { signXdr } from "@/lib/wallet/keypair";
import { createUser, confirmTrustline } from "@/lib/api";

const NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const USER_ID_KEY = "liber:userId";

export function OnboardingForm() {
  const router = useRouter();
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
        provider: form.get("provider") as "gopay" | "dana" | "ovo" | "other",
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 max-w-md mx-auto">
      <input name="email" type="email" placeholder="Email" required className="border p-2 rounded" />
      <input name="fullname" placeholder="Nama lengkap" required className="border p-2 rounded" />
      <input name="address" placeholder="Alamat" required className="border p-2 rounded" />
      <input name="idNumber" placeholder="NIK" required className="border p-2 rounded" />
      <input name="idFile" type="file" accept="image/*" required className="border p-2 rounded" />
      <select name="provider" required className="border p-2 rounded">
        <option value="gopay">GoPay</option>
        <option value="dana">DANA</option>
        <option value="ovo">OVO</option>
        <option value="other">Bank lain</option>
      </select>
      <input name="bankAccountNumber" placeholder="Nomor rekening/HP" required className="border p-2 rounded" />
      <input name="bankCode" placeholder="Kode bank (mis. GOPAY)" required className="border p-2 rounded" />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button type="submit" disabled={submitting} className="bg-slate-900 text-white p-2 rounded disabled:opacity-50">
        {submitting ? "Memproses..." : "Buat akun"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Write page.tsx**

```tsx
// frontend/src/app/onboarding/page.tsx
import { OnboardingForm } from "@/components/OnboardingForm";

export default function OnboardingPage() {
  return (
    <main>
      <h1 className="text-xl font-semibold text-center mt-8">Buat akun Liber</h1>
      <OnboardingForm />
    </main>
  );
}
```

- [ ] **Step 3: Manual verification checklist**

Run `npm run dev`, open `http://localhost:3000/onboarding` on a phone or desktop browser with `backend/` running locally with a real `DATABASE_URL` and (for a real IDRX onboarding response) a valid `IDRX_API_KEY`/`IDRX_API_SECRET`:

1. Fill every field, submit a real ID photo.
2. Confirm no console error; confirm `localStorage.getItem("liber:userId")` is set (browser devtools).
3. Confirm `backend/`'s Postgres `users` table has a new row with a non-null `idrx_deposit_address`.
4. Confirm the Stellar account (`stellar_public_key`) is visible and funded on `stellar.expert` (mainnet) shortly after submission.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/onboarding/ frontend/src/components/OnboardingForm.tsx
git commit -m "Add onboarding page: wallet generation, KYC form, trustline signing"
```

---

### Task 6: Scan + quote page

**Files:**
- Create: `frontend/src/app/pay/page.tsx`
- Create: `frontend/src/components/QrScanner.tsx`
- Create: `frontend/src/components/QuoteCard.tsx`

**Interfaces:**
- Consumes: `parseQRIS` (Task 3), `createOrder` (Task 4).
- Produces: on a successful quote, navigates to `/pay/[orderId]` (Task 7) carrying `unsignedBridgeXdr` via a client-side store (`sessionStorage`, key `liber:pendingBridgeXdr:{orderId}` — simplest way to hand a large string to the next page without a global state library).

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

  return <div id={containerId} className="w-full max-w-sm mx-auto" />;
}
```

- [ ] **Step 2: Write QuoteCard.tsx**

```tsx
// frontend/src/components/QuoteCard.tsx
"use client";

import { useEffect, useState } from "react";
import type { OrderQuote } from "@/lib/api";

export function QuoteCard({ quote, onApprove }: { quote: OrderQuote; onApprove: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(30);

  useEffect(() => {
    const expiresAt = new Date(quote.quoteExpiresAt).getTime();
    const interval = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
    }, 500);
    return () => clearInterval(interval);
  }, [quote.quoteExpiresAt]);

  return (
    <div className="p-6 max-w-sm mx-auto border rounded-lg">
      <p className="text-sm text-slate-500">{quote.merchantName}, {quote.merchantCity}</p>
      <p className="text-2xl font-bold">Rp {Number(quote.amountIdr).toLocaleString("id-ID")}</p>
      <p className="text-slate-600">= {quote.amountUsdc} USDC</p>
      <p className="text-xs text-slate-400 mt-2">Quote berlaku {secondsLeft} detik lagi</p>
      <button
        onClick={onApprove}
        disabled={secondsLeft <= 0}
        className="mt-4 w-full bg-slate-900 text-white p-2 rounded disabled:opacity-50"
      >
        Bayar sekarang
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Write pay/page.tsx**

```tsx
// frontend/src/app/pay/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
      if (!userId) throw new Error("Belum onboarding — buka /onboarding dulu");

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
    <main className="p-4">
      {!quote && <QrScanner onScan={handleScan} />}
      {error && <p className="text-red-600 text-center mt-4">{error}</p>}
      {quote && <QuoteCard quote={quote} onApprove={() => router.push(`/pay/${quote.orderId}`)} />}
    </main>
  );
}
```

- [ ] **Step 4: Manual verification checklist**

On a real phone (camera access requires HTTPS or `localhost`):

1. Open `/pay`, grant camera permission, scan a real static QRIS (e.g. print one from `qris-dinamis`'s demo or any real merchant QRIS with a known small amount).
2. Confirm merchant name/city appear correctly.
3. For a static QRIS, confirm the nominal prompt appears and the resulting quote reflects it.
4. Confirm the 30-second countdown ticks down and disables the button at 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pay/page.tsx frontend/src/components/QrScanner.tsx frontend/src/components/QuoteCard.tsx
git commit -m "Add scan + quote page (camera QRIS scan, EMVCo parse, backend quote)"
```

---

### Task 7: Approve + status page

**Files:**
- Create: `frontend/src/app/pay/[orderId]/page.tsx`
- Create: `frontend/src/components/OrderStatus.tsx`

**Interfaces:**
- Consumes: `signXdr` + `LocalStorageWalletStorage`/`getOrCreateWallet` (Task 2), `approveOrder`/`getOrder` (Task 4).
- Produces: polls until `state` is `"completed"` or `"failed"`, then renders the handoff (Task 8's UI, inlined here since it's the terminal state of the same page rather than a separate route).

- [ ] **Step 1: Write OrderStatus.tsx**

```tsx
// frontend/src/components/OrderStatus.tsx
"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { getOrder, type OrderStatus as OrderStatusData } from "@/lib/api";

const STATE_LABELS: Record<string, string> = {
  bridging: "Mengirim USDC lintas rantai...",
  redeeming: "Mencairkan ke Rupiah...",
  completed: "Selesai — bayar merchant sekarang",
  failed: "Gagal",
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

  if (!status) return <p className="text-center mt-8">Memuat status...</p>;

  return (
    <div className="p-6 max-w-sm mx-auto text-center">
      <p className="text-lg font-semibold">{STATE_LABELS[status.state] ?? status.state}</p>
      {status.state === "failed" && <p className="text-red-600 mt-2">{status.failureReason}</p>}

      {status.state === "completed" && (
        <>
          <p className="mt-4 text-sm text-slate-500">
            Saldo {status.merchantName} sudah masuk ke e-wallet kamu. Scan ulang QRIS ini dari aplikasi e-wallet untuk membayar merchant:
          </p>
          {qrDataUrl && <Image src={qrDataUrl} alt="QRIS" width={220} height={220} className="mx-auto mt-4" />}
          {status.ewalletHandoff.appLink && (
            <a href={status.ewalletHandoff.appLink} className="block mt-4 bg-slate-900 text-white p-2 rounded">
              Buka e-wallet
            </a>
          )}
          {status.stellarTxHash && (
            <p className="text-xs text-slate-400 mt-4 break-all">Tx: {status.stellarTxHash}</p>
          )}
        </>
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
        if (!unsignedXdr) throw new Error("Sesi kadaluarsa, scan ulang QRIS-nya");

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

  if (error) return <p className="text-red-600 text-center mt-8">{error}</p>;
  if (!approved) return <p className="text-center mt-8">Menandatangani transaksi...</p>;

  return <OrderStatus orderId={orderId} />;
}
```

- [ ] **Step 3: Manual verification checklist**

With `backend/` pointed at real mainnet config and a small real USDC balance in the test wallet:

1. Complete a scan+quote (Task 6), land on `/pay/[orderId]`.
2. Confirm the transaction signs without error and the page transitions to "Mengirim USDC lintas rantai...".
3. Wait for the Allbridge bridge to confirm (per spec, ~minutes) — confirm the label changes to "Mencairkan ke Rupiah..." then "Selesai".
4. Confirm the QR image renders and matches the originally scanned QRIS (open both side by side).
5. Confirm tapping "Buka e-wallet" attempts to open the app (or no-ops harmlessly if the scheme isn't registered on the test device — this is expected per spec §10.3, the QR re-scan is the real mechanism).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/pay/[orderId]/ frontend/src/components/OrderStatus.tsx
git commit -m "Add approve + status page: sign bridge tx, poll status, e-wallet handoff"
```

---

### Task 8: Balance + home page

**Files:**
- Create: `frontend/src/app/page.tsx`
- Create: `frontend/src/components/BalanceCard.tsx`

**Interfaces:**
- Consumes: `getBalance` (Task 4).
- Produces: the app's landing page — redirects to `/onboarding` if no `liber:userId` is set, otherwise shows balance + a link to `/pay`.

- [ ] **Step 1: Write BalanceCard.tsx**

```tsx
// frontend/src/components/BalanceCard.tsx
"use client";

import { useEffect, useState } from "react";
import { getBalance } from "@/lib/api";

export function BalanceCard({ userId }: { userId: string }) {
  const [balance, setBalance] = useState<{ usdcBalance: string; idrEstimate: string } | null>(null);

  useEffect(() => {
    getBalance(userId).then(setBalance).catch(() => setBalance(null));
  }, [userId]);

  if (!balance) return <p className="text-center mt-8">Memuat saldo...</p>;

  return (
    <div className="p-6 max-w-sm mx-auto text-center">
      <p className="text-3xl font-bold">{balance.usdcBalance} USDC</p>
      <p className="text-slate-500">≈ Rp {Number(balance.idrEstimate).toLocaleString("id-ID")}</p>
    </div>
  );
}
```

- [ ] **Step 2: Write page.tsx**

```tsx
// frontend/src/app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BalanceCard } from "@/components/BalanceCard";

export default function HomePage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("liber:userId");
    if (!stored) {
      router.push("/onboarding");
    } else {
      setUserId(stored);
    }
  }, [router]);

  if (!userId) return null;

  return (
    <main>
      <BalanceCard userId={userId} />
      <Link href="/pay" className="block mt-6 mx-auto max-w-sm bg-slate-900 text-white p-3 rounded text-center">
        Scan QRIS
      </Link>
    </main>
  );
}
```

- [ ] **Step 3: Manual verification checklist**

1. Clear `localStorage`, open `/` — confirm redirect to `/onboarding`.
2. Complete onboarding, land back on `/` — confirm balance loads (0 USDC / Rp 0 for a freshly funded account with no USDC yet).
3. Send a small amount of real USDC to the displayed account (manually, via any Stellar wallet) and refresh — confirm the balance updates.
4. Tap "Scan QRIS" — confirm navigation to `/pay`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/page.tsx frontend/src/components/BalanceCard.tsx
git commit -m "Add home page: balance display + onboarding redirect"
```

---

### Task 9: Receive page (own address + QR)

**Files:**
- Create: `frontend/src/app/receive/page.tsx`

**Interfaces:**
- Consumes: `getOrCreateWallet`/`LocalStorageWalletStorage` (Task 2). Covers the "Terima USDC" MVP feature (`LIBER-CONCEPT.md` §4 item 2) — a way for the user to receive USDC/salary transfers into their Liber wallet from outside the app.

- [ ] **Step 1: Write receive/page.tsx**

```tsx
// frontend/src/app/receive/page.tsx
"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
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

  if (!address) return <p className="text-center mt-8">Memuat alamat...</p>;

  return (
    <main className="p-6 max-w-sm mx-auto text-center">
      <h1 className="text-lg font-semibold mb-4">Terima USDC</h1>
      <img src={qrDataUrl} alt="Alamat Stellar" width={220} height={220} className="mx-auto" />
      <p className="text-xs break-all mt-4 font-mono">{address}</p>
      <button
        onClick={() => {
          navigator.clipboard.writeText(address);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="mt-4 bg-slate-900 text-white p-2 rounded w-full"
      >
        {copied ? "Tersalin!" : "Salin alamat"}
      </button>
      <p className="text-xs text-slate-400 mt-4">
        Kirim USDC (Stellar) ke alamat ini. Saldo akan muncul di halaman utama setelah transaksi selesai.
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Add a link from the home page**

```tsx
// frontend/src/app/page.tsx (modify — add alongside the existing "Scan QRIS" link)
<Link href="/receive" className="block mt-3 mx-auto max-w-sm border border-slate-900 text-slate-900 p-3 rounded text-center">
  Terima USDC
</Link>
```

- [ ] **Step 3: Manual verification checklist**

1. Open `/receive`, confirm the QR renders and the address text matches `localStorage`'s `liber:wallet:publicKey`.
2. Scan the QR with a separate Stellar wallet app — confirm it reads as a valid `G...` address.
3. Send a small amount of real USDC to it from another wallet, then check `/` — confirm the balance updates.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/receive/ frontend/src/app/page.tsx
git commit -m "Add receive page: show wallet address as QR for incoming USDC"
```

---

### Task 10: Transaction history page

**Files:**
- Create: `frontend/src/app/history/page.tsx`

**Interfaces:**
- Consumes: `getOrderHistory` (Task 4). Covers the "Riwayat transaksi" MVP feature (`LIBER-CONCEPT.md` §4 item 4) — a receipt list with merchant name and tx hash as on-chain proof.

- [ ] **Step 1: Write history/page.tsx**

```tsx
// frontend/src/app/history/page.tsx
"use client";

import { useEffect, useState } from "react";
import { getOrderHistory, type HistoryEntry } from "@/lib/api";

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    const userId = window.localStorage.getItem("liber:userId");
    if (userId) getOrderHistory(userId).then(setEntries);
  }, []);

  if (!entries) return <p className="text-center mt-8">Memuat riwayat...</p>;
  if (entries.length === 0) return <p className="text-center mt-8 text-slate-500">Belum ada transaksi</p>;

  return (
    <main className="p-4 max-w-sm mx-auto">
      <h1 className="text-lg font-semibold mb-4 text-center">Riwayat transaksi</h1>
      <ul className="flex flex-col gap-3">
        {entries.map((entry) => (
          <li key={entry.orderId} className="border rounded-lg p-4">
            <div className="flex justify-between">
              <span className="font-medium">{entry.merchantName}</span>
              <span className={entry.state === "completed" ? "text-green-600" : "text-slate-500"}>
                {entry.state}
              </span>
            </div>
            <p className="text-sm text-slate-500">{entry.merchantCity}</p>
            <p className="text-sm">
              Rp {Number(entry.amountIdr).toLocaleString("id-ID")} ({entry.amountUsdc} USDC)
            </p>
            {entry.stellarTxHash && (
              <p className="text-xs text-slate-400 mt-1 break-all">Tx: {entry.stellarTxHash}</p>
            )}
            <p className="text-xs text-slate-400">{new Date(entry.createdAt).toLocaleString("id-ID")}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Add a link from the home page**

```tsx
// frontend/src/app/page.tsx (modify — add alongside the "Scan QRIS"/"Terima USDC" links)
<Link href="/history" className="block mt-3 mx-auto max-w-sm text-slate-500 text-center underline">
  Riwayat transaksi
</Link>
```

- [ ] **Step 3: Manual verification checklist**

1. Complete at least one full scan-to-pay flow (Tasks 6-7).
2. Open `/history`, confirm the completed order appears with correct merchant name, amount, and tx hash.
3. Confirm the tx hash matches what's visible on `stellar.expert` for that account.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/history/ frontend/src/app/page.tsx
git commit -m "Add transaction history page (receipts with merchant name + tx hash)"
```

---

## Deployment (Vercel)

After Task 8 is verified:

```bash
cd frontend
vercel link      # if not already linked
vercel env add NEXT_PUBLIC_BACKEND_URL production   # https://<railway-backend-url>
vercel deploy --prod
```
