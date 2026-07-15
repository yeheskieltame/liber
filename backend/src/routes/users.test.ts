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

test("POST /users funds the account and returns an unsigned trustline tx", async () => {
  const stellarPublicKey = `GNEWUSER${Math.random().toString(36).slice(2)}`;
  const submittedXdrs: string[] = [];

  const app = createUsersRoute({
    buildOnboardingTx: async () => ({ signedXdr: "FAKE_FUNDING_XDR" }),
    buildTrustlineTx: async () => ({ unsignedXdr: "FAKE_TRUSTLINE_XDR" }),
    submitStellarTx: async (signedXdr: string) => {
      submittedXdrs.push(signedXdr);
      return { hash: "FAKE_HASH" };
    },
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
  assert.deepEqual(submittedXdrs, ["FAKE_FUNDING_XDR"]);

  const pool = getPool();
  const { rows } = await pool.query(`SELECT stellar_public_key FROM users WHERE id = $1`, [body.userId]);
  assert.equal(rows[0].stellar_public_key, stellarPublicKey);
});

test("POST /users returns a clear error response (not an unhandled crash) when a Stellar step throws", async () => {
  const stellarPublicKey = `GNEWUSER${Math.random().toString(36).slice(2)}`;

  const app = createUsersRoute({
    buildOnboardingTx: async () => {
      throw new Error("Horizon: could not build funding tx (simulated failure)");
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

  const pool = getPool();
  const { rows } = await pool.query(`SELECT id FROM users WHERE stellar_public_key = $1`, [stellarPublicKey]);
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
