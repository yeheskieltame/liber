import { test } from "node:test";
import assert from "node:assert/strict";
import { Account, Keypair, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import {
  buildOnboardingTxFromAccount,
  buildTrustlineTxFromAccount,
  assertSufficientFundingBalance,
  InsufficientFundingBalanceError,
  accountExistsOnStellar,
} from "./account.js";

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

test("assertSufficientFundingBalance throws InsufficientFundingBalanceError when the funding account can't cover the starting balance plus its own reserve", () => {
  assert.throws(
    () => assertSufficientFundingBalance("2.00", "2"),
    (err: Error) => {
      assert.ok(err instanceof InsufficientFundingBalanceError);
      assert.match(err.message, /2\.00/);
      assert.match(err.message, /operator needs to top up/i);
      return true;
    }
  );
});

test("assertSufficientFundingBalance does not throw when the funding account has enough", () => {
  assert.doesNotThrow(() => assertSufficientFundingBalance("5.00", "2"));
});

test("accountExistsOnStellar returns true when the account loads successfully", async () => {
  const result = await accountExistsOnStellar("GTEST", async () => ({ id: "GTEST" }));
  assert.equal(result, true);
});

test("accountExistsOnStellar returns false when the account lookup 404s", async () => {
  const notFound = Object.assign(new Error("Not Found"), { response: { status: 404 } });
  const result = await accountExistsOnStellar("GTEST", async () => {
    throw notFound;
  });
  assert.equal(result, false);
});

test("accountExistsOnStellar rethrows non-404 errors", async () => {
  await assert.rejects(
    accountExistsOnStellar("GTEST", async () => {
      throw new Error("network blip");
    }),
    /network blip/
  );
});
