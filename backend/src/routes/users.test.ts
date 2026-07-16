// backend/src/routes/users.test.ts
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";
import { getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { createUsersRoute } from "./users.js";

before(async () => {
  await migrate();
});

test("POST /users returns the existing user without checking Stellar when a row already exists", async () => {
  const stellarPublicKey = Keypair.random().publicKey();
  await getPool().query(`INSERT INTO users (stellar_public_key) VALUES ($1)`, [stellarPublicKey]);

  let getNativeBalanceCalled = false;
  const app = createUsersRoute({
    buildTrustlineTx: async () => ({ unsignedXdr: "FAKE_TRUSTLINE_XDR" }),
    getNativeBalance: async () => {
      getNativeBalanceCalled = true;
      return "0";
    },
  });

  const res = await app.request("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stellarPublicKey }),
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.unsignedTrustlineXdr, "FAKE_TRUSTLINE_XDR");
  assert.ok(body.userId);
  assert.equal(getNativeBalanceCalled, false);
});

test("POST /users returns awaiting_funding (202) when the account isn't funded yet", async () => {
  const stellarPublicKey = Keypair.random().publicKey();

  const app = createUsersRoute({
    getNativeBalance: async () => null,
  });

  const res = await app.request("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stellarPublicKey }),
  });

  assert.equal(res.status, 202);
  const body = await res.json();
  assert.equal(body.status, "awaiting_funding");

  const { rows } = await getPool().query(`SELECT id FROM users WHERE stellar_public_key = $1`, [stellarPublicKey]);
  assert.equal(rows.length, 0);
});

test("POST /users returns awaiting_funding (202) when the account exists but hasn't reached the activation balance", async () => {
  const stellarPublicKey = Keypair.random().publicKey();

  const app = createUsersRoute({
    getNativeBalance: async () => "1.50",
  });

  const res = await app.request("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stellarPublicKey }),
  });

  assert.equal(res.status, 202);
  const body = await res.json();
  assert.equal(body.status, "awaiting_funding");
});

test("POST /users creates the user once the account has reached the activation balance", async () => {
  const stellarPublicKey = Keypair.random().publicKey();

  const app = createUsersRoute({
    getNativeBalance: async () => "2.0000000",
    buildTrustlineTx: async () => ({ unsignedXdr: "FAKE_TRUSTLINE_XDR" }),
  });

  const res = await app.request("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stellarPublicKey }),
  });

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.unsignedTrustlineXdr, "FAKE_TRUSTLINE_XDR");
  assert.ok(body.userId);

  const { rows } = await getPool().query(`SELECT id FROM users WHERE stellar_public_key = $1`, [stellarPublicKey]);
  assert.equal(rows.length, 1);
});

test("POST /users returns a clear error response (not an unhandled crash) when a Stellar step throws", async () => {
  const stellarPublicKey = Keypair.random().publicKey();

  const app = createUsersRoute({
    getNativeBalance: async () => "2.0000000",
    buildTrustlineTx: async () => {
      throw new Error("Horizon: could not build trustline tx (simulated failure)");
    },
  });

  const res = await app.request("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stellarPublicKey }),
  });

  assert.equal(res.status, 502);
  const body = await res.json();
  assert.match(body.error, /simulated failure/);

  const { rows } = await getPool().query(`SELECT id FROM users WHERE stellar_public_key = $1`, [stellarPublicKey]);
  assert.equal(rows.length, 0);
});

test("POST /users/:id/confirm-trustline submits the signed trustline tx and returns ready", async () => {
  const pool = getPool();
  const { rows } = await pool.query(`INSERT INTO users (stellar_public_key) VALUES ($1) RETURNING id`, [
    `GCONFIRMUSER${Math.random().toString(36).slice(2)}`,
  ]);
  const userId = rows[0].id;

  const submittedXdrs: string[] = [];
  const app = createUsersRoute({
    submitStellarTx: async (signedXdr: string) => {
      submittedXdrs.push(signedXdr);
      return { hash: "FAKE_HASH" };
    },
  });

  const res = await app.request(`/users/${userId}/confirm-trustline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedXdr: "SIGNED_TRUSTLINE_XDR" }),
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { ready: true });
  assert.deepEqual(submittedXdrs, ["SIGNED_TRUSTLINE_XDR"]);
});

test("POST /users/:id/confirm-trustline returns 404 for an unknown user id", async () => {
  const app = createUsersRoute({
    submitStellarTx: async () => ({ hash: "SHOULD_NOT_BE_CALLED" }),
  });

  const res = await app.request(`/users/${crypto.randomUUID()}/confirm-trustline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedXdr: "irrelevant" }),
  });

  assert.equal(res.status, 404);
});

test("POST /users/:id/confirm-trustline returns a friendly 502 (not an unhandled crash) when submission fails", async () => {
  const stellarPublicKey = Keypair.random().publicKey();
  const inserted = await getPool().query(`INSERT INTO users (stellar_public_key) VALUES ($1) RETURNING id`, [
    stellarPublicKey,
  ]);
  const userId = inserted.rows[0].id;

  const app = createUsersRoute({
    submitStellarTx: async () => {
      throw new Error("tx_bad_auth (simulated)");
    },
  });

  const res = await app.request(`/users/${userId}/confirm-trustline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedXdr: "irrelevant" }),
  });

  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.error, "Couldn't finish setting up your wallet. Please try again.");
});

test("POST /users/:id/confirm-trustline returns 400 for a malformed body", async () => {
  const stellarPublicKey = Keypair.random().publicKey();
  const inserted = await getPool().query(`INSERT INTO users (stellar_public_key) VALUES ($1) RETURNING id`, [
    stellarPublicKey,
  ]);
  const userId = inserted.rows[0].id;

  const app = createUsersRoute();

  const res = await app.request(`/users/${userId}/confirm-trustline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not json",
  });

  assert.equal(res.status, 400);
});

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

test("POST /users/:id/kolo-address saves a numeric koloMemo alongside the address", async () => {
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
    body: JSON.stringify({ koloStellarAddress: koloAddress, koloMemo: "123456" }),
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.koloMemo, "123456");

  const { rows: check } = await pool.query(`SELECT kolo_memo FROM users WHERE id = $1`, [userId]);
  assert.equal(check[0].kolo_memo, "123456");
});

test("POST /users/:id/kolo-address rejects a non-numeric koloMemo", async () => {
  const pool = getPool();
  const { rows } = await pool.query(`INSERT INTO users (stellar_public_key) VALUES ($1) RETURNING id`, [
    `GKOLOUSER${Math.random().toString(36).slice(2)}`,
  ]);
  const userId = rows[0].id;

  const app = createUsersRoute();
  const res = await app.request(`/users/${userId}/kolo-address`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ koloStellarAddress: Keypair.random().publicKey(), koloMemo: "not-a-number" }),
  });

  assert.equal(res.status, 400);
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

test("GET /users/by-key/:stellarPublicKey returns the matching userId", async () => {
  const pool = getPool();
  const stellarPublicKey = Keypair.random().publicKey();
  const { rows } = await pool.query(`INSERT INTO users (stellar_public_key) VALUES ($1) RETURNING id`, [
    stellarPublicKey,
  ]);
  const userId = rows[0].id;

  const app = createUsersRoute();
  const res = await app.request(`/users/by-key/${stellarPublicKey}`);

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.userId, userId);
  assert.equal(body.koloStellarAddress, null);
  assert.equal(body.koloMemo, null);
});

test("GET /users/by-key/:stellarPublicKey returns the saved Kolo address and memo", async () => {
  const pool = getPool();
  const stellarPublicKey = Keypair.random().publicKey();
  const koloAddress = Keypair.random().publicKey();
  const { rows } = await pool.query(
    `INSERT INTO users (stellar_public_key, kolo_stellar_address, kolo_memo) VALUES ($1, $2, $3) RETURNING id`,
    [stellarPublicKey, koloAddress, "555555"]
  );
  const userId = rows[0].id;

  const app = createUsersRoute();
  const res = await app.request(`/users/by-key/${stellarPublicKey}`);

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.userId, userId);
  assert.equal(body.koloStellarAddress, koloAddress);
  assert.equal(body.koloMemo, "555555");
});

test("GET /users/by-key/:stellarPublicKey returns 404 when no user has that key", async () => {
  const app = createUsersRoute();
  const res = await app.request(`/users/by-key/${Keypair.random().publicKey()}`);

  assert.equal(res.status, 404);
});

test("GET /users/by-key/:stellarPublicKey rejects a malformed key", async () => {
  const app = createUsersRoute();
  const res = await app.request("/users/by-key/not-a-real-address");

  assert.equal(res.status, 400);
});
