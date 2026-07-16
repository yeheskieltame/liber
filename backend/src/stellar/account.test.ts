import { test } from "node:test";
import assert from "node:assert/strict";
import { Account, Keypair, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import {
  buildOnboardingTxFromAccount,
  buildTrustlineTxFromAccount,
  assertSufficientFundingBalance,
  InsufficientFundingBalanceError,
  accountExistsOnStellar,
  withFundingLock,
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

test("assertSufficientFundingBalance accounts for the funding account's own subentries and fee buffer", () => {
  // 0 subentries: needs starting(2) + reserve(2*0.5=1) + fee buffer(0.01) = 3.01
  assert.throws(
    () => assertSufficientFundingBalance("3.00", "2", 0),
    (err: Error) => {
      assert.ok(err instanceof InsufficientFundingBalanceError);
      return true;
    }
  );
  assert.doesNotThrow(() => assertSufficientFundingBalance("3.02", "2", 0));
});

test("assertSufficientFundingBalance requires more balance when the funding account itself holds a trustline (1 subentry)", () => {
  // 1 subentry: needs starting(2) + reserve((2+1)*0.5=1.5) + fee buffer(0.01) = 3.51
  assert.throws(
    () => assertSufficientFundingBalance("3.50", "2", 1),
    (err: Error) => {
      assert.ok(err instanceof InsufficientFundingBalanceError);
      return true;
    }
  );
  assert.doesNotThrow(() => assertSufficientFundingBalance("3.52", "2", 1));
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

test("withFundingLock runs concurrent calls one at a time, in submission order", async () => {
  const order: number[] = [];
  const running: boolean[] = [];

  function makeTask(id: number, delayMs: number) {
    return withFundingLock(async () => {
      running.push(true);
      assert.equal(running.filter(Boolean).length, 1, "no overlap allowed");
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      order.push(id);
      running.pop();
    });
  }

  await Promise.all([makeTask(1, 20), makeTask(2, 5), makeTask(3, 10)]);

  assert.deepEqual(order, [1, 2, 3]);
});
