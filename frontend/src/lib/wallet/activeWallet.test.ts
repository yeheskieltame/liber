import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Keypair, TransactionBuilder, Account, Operation, Asset } from "@stellar/stellar-sdk";
import { MemoryWalletStorage, getOrCreateWallet } from "./storage.js";
import {
  getActiveWallet,
  signActiveWallet,
  getWalletMode,
  setExternalWalletMode,
  setLocalWalletMode,
} from "./activeWallet.js";

const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

// getWalletMode/setExternalWalletMode/setLocalWalletMode read/write window.localStorage directly;
// node:test runs in Node, which doesn't have `window`, so stub a minimal one for these tests.
beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as any).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  };
});

test("getWalletMode defaults to local when never set", () => {
  assert.equal(getWalletMode(), "local");
});

test("setExternalWalletMode / setLocalWalletMode toggle the stored mode", () => {
  setExternalWalletMode();
  assert.equal(getWalletMode(), "external");
  setLocalWalletMode();
  assert.equal(getWalletMode(), "local");
});

test("getActiveWallet returns a local wallet when mode is local", async () => {
  setLocalWalletMode();
  const storage = new MemoryWalletStorage();
  const expected = await getOrCreateWallet(storage);

  const wallet = await getActiveWallet(storage, async () => null);

  assert.deepEqual(wallet, { mode: "local", publicKey: expected.publicKey, secretKey: expected.secretKey });
});

test("getActiveWallet returns an external wallet when mode is external and a wallet is connected", async () => {
  setExternalWalletMode();
  const storage = new MemoryWalletStorage();

  const wallet = await getActiveWallet(storage, async () => "GEXTERNALADDRESS");

  assert.deepEqual(wallet, { mode: "external", publicKey: "GEXTERNALADDRESS" });
});

test("getActiveWallet falls back to local when mode is external but nothing is actually connected", async () => {
  setExternalWalletMode();
  const storage = new MemoryWalletStorage();
  const expected = await getOrCreateWallet(storage);

  const wallet = await getActiveWallet(storage, async () => null);

  assert.deepEqual(wallet, { mode: "local", publicKey: expected.publicKey, secretKey: expected.secretKey });
});

test("signActiveWallet signs locally for a local wallet", async () => {
  const kp = Keypair.random();
  const wallet = { mode: "local" as const, publicKey: kp.publicKey(), secretKey: kp.secret() };

  const account = new Account(kp.publicKey(), "1");
  const tx = new TransactionBuilder(account, { fee: "10000", networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.payment({ destination: kp.publicKey(), asset: Asset.native(), amount: "1" }))
    .setTimeout(30)
    .build();

  let externalCalled = false;
  const result = await signActiveWallet(wallet, tx.toXDR(), NETWORK_PASSPHRASE, async () => {
    externalCalled = true;
    return "SHOULD_NOT_BE_CALLED";
  });

  assert.equal(externalCalled, false);
  const signedTx = TransactionBuilder.fromXDR(result, NETWORK_PASSPHRASE);
  assert.equal(signedTx.signatures.length, 1);
});

test("signActiveWallet delegates to the external signer for an external wallet", async () => {
  const wallet = { mode: "external" as const, publicKey: "GEXTERNAL" };

  const result = await signActiveWallet(
    wallet,
    "FAKE_XDR",
    "Test SDF Network ; September 2015",
    async (xdr, address, networkPassphrase) => {
      assert.equal(xdr, "FAKE_XDR");
      assert.equal(address, "GEXTERNAL");
      assert.equal(networkPassphrase, "Test SDF Network ; September 2015");
      return "EXTERNALLY_SIGNED_XDR";
    }
  );

  assert.equal(result, "EXTERNALLY_SIGNED_XDR");
});
