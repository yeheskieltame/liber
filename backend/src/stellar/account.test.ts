import { test } from "node:test";
import assert from "node:assert/strict";
import { Account, Keypair, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { buildTrustlineTxFromAccount, getNativeBalance, isActivated, ACTIVATION_BALANCE_XLM } from "./account.js";

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

test("getNativeBalance returns the native balance when the account exists", async () => {
  const result = await getNativeBalance("GTEST", async () => ({
    balances: [{ asset_type: "native", balance: "5.0000000" }],
  }));
  assert.equal(result, "5.0000000");
});

test("getNativeBalance returns null when the account lookup 404s", async () => {
  const notFound = Object.assign(new Error("Not Found"), { response: { status: 404 } });
  const result = await getNativeBalance("GTEST", async () => {
    throw notFound;
  });
  assert.equal(result, null);
});

test("getNativeBalance rethrows non-404 errors", async () => {
  await assert.rejects(
    getNativeBalance("GTEST", async () => {
      throw new Error("network blip");
    }),
    /network blip/
  );
});

test("ACTIVATION_BALANCE_XLM is 2", () => {
  assert.equal(ACTIVATION_BALANCE_XLM, 2);
});

test("isActivated is false when the account doesn't exist", () => {
  assert.equal(isActivated(null), false);
});

test("isActivated is false when the balance is below the activation threshold", () => {
  assert.equal(isActivated("1.9999999"), false);
});

test("isActivated is true when the balance meets or exceeds the activation threshold", () => {
  assert.equal(isActivated("2.0000000"), true);
  assert.equal(isActivated("5.0000000"), true);
});
