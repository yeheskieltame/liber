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
