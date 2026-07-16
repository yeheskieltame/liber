// backend/src/routes/users.test.ts
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";
import { getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { createUsersRoute } from "./users.js";
import { InsufficientFundingBalanceError } from "../stellar/account.js";

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
    accountExistsOnStellar: async () => false,
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
    accountExistsOnStellar: async () => false,
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

test("POST /users returns a friendly 503 (not a raw Horizon error) when the funding account balance is too low", async () => {
  const stellarPublicKey = `GNEWUSER${Math.random().toString(36).slice(2)}`;

  const app = createUsersRoute({
    buildOnboardingTx: async () => {
      throw new InsufficientFundingBalanceError("2.00", "3.00");
    },
    accountExistsOnStellar: async () => false,
  });

  const res = await app.request("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stellarPublicKey }),
  });

  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error, "New wallet signups are temporarily unavailable. Please try again shortly.");

  const pool = getPool();
  const { rows } = await pool.query(`SELECT id FROM users WHERE stellar_public_key = $1`, [stellarPublicKey]);
  assert.equal(rows.length, 0);
});

test("POST /users returns a friendly 503 when Horizon reports a transient tx_bad_seq failure", async () => {
  const stellarPublicKey = Keypair.random().publicKey();

  const app = createUsersRoute({
    accountExistsOnStellar: async () => false,
    buildOnboardingTx: async () => {
      const err = new Error("Request failed with status code 400") as Error & {
        response?: { data?: { extras?: { result_codes: { transaction: string } } } };
      };
      err.response = { data: { extras: { result_codes: { transaction: "tx_bad_seq" } } } };
      throw err;
    },
  });

  const res = await app.request("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stellarPublicKey }),
  });

  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error, "New wallet signups are temporarily unavailable. Please try again shortly.");
});

test("POST /users returns the existing user without re-funding when a row already exists for that key", async () => {
  const stellarPublicKey = Keypair.random().publicKey();
  await getPool().query(`INSERT INTO users (stellar_public_key) VALUES ($1)`, [stellarPublicKey]);

  let fundingCalled = false;
  const app = createUsersRoute({
    buildOnboardingTx: async () => {
      fundingCalled = true;
      return { signedXdr: "SHOULD_NOT_BE_CALLED" };
    },
    buildTrustlineTx: async () => ({ unsignedXdr: "FAKE_TRUSTLINE_XDR" }),
    accountExistsOnStellar: async () => true,
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
  assert.equal(fundingCalled, false);
});

test("POST /users skips funding but still creates the DB row when the Stellar account already exists but no user row does", async () => {
  const stellarPublicKey = Keypair.random().publicKey();
  let fundingCalled = false;
  let submitCalled = false;

  const app = createUsersRoute({
    buildOnboardingTx: async () => {
      fundingCalled = true;
      return { signedXdr: "SHOULD_NOT_BE_CALLED" };
    },
    buildTrustlineTx: async () => ({ unsignedXdr: "FAKE_TRUSTLINE_XDR" }),
    submitStellarTx: async (xdr: string) => {
      submitCalled = true;
      return { hash: "FAKE_HASH" };
    },
    accountExistsOnStellar: async () => true,
  });

  const res = await app.request("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stellarPublicKey }),
  });

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.ok(body.userId);
  assert.equal(fundingCalled, false);
  assert.equal(submitCalled, false);

  const { rows } = await getPool().query(`SELECT id FROM users WHERE stellar_public_key = $1`, [stellarPublicKey]);
  assert.equal(rows.length, 1);
});

test("POST /users funds and creates normally when neither the row nor the account exists", async () => {
  const stellarPublicKey = Keypair.random().publicKey();
  let fundingCalled = false;

  const app = createUsersRoute({
    buildOnboardingTx: async () => {
      fundingCalled = true;
      return { signedXdr: "FAKE_FUNDING_XDR" };
    },
    buildTrustlineTx: async () => ({ unsignedXdr: "FAKE_TRUSTLINE_XDR" }),
    submitStellarTx: async () => ({ hash: "FAKE_HASH" }),
    accountExistsOnStellar: async () => false,
  });

  const res = await app.request("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stellarPublicKey }),
  });

  assert.equal(res.status, 201);
  assert.equal(fundingCalled, true);
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
