import { test } from "node:test";
import assert from "node:assert/strict";
import { Account, Keypair, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { buildTopUpTx } from "./topup.js";

const NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

test("buildTopUpTx produces an unsigned USDC payment to the destination", () => {
  const source = Keypair.random();
  const destination = Keypair.random();
  const sourceAccount = new Account(source.publicKey(), "100");

  const { unsignedXdr } = buildTopUpTx(sourceAccount, {
    destinationPublicKey: destination.publicKey(),
    amountUsdc: "5.00",
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  const tx = TransactionBuilder.fromXDR(unsignedXdr, NETWORK_PASSPHRASE);
  assert.equal(tx.operations.length, 1);
  const op = tx.operations[0] as any;
  assert.equal(op.type, "payment");
  assert.equal(op.destination, destination.publicKey());
  assert.equal(op.asset.code, "USDC");
  assert.equal(op.asset.issuer, USDC_ISSUER);
  assert.equal(op.amount, "5.0000000");
  assert.equal(tx.signatures.length, 0);
});

test("buildTopUpTx attaches a MEMO_ID when memoId is provided", () => {
  const source = Keypair.random();
  const destination = Keypair.random();
  const sourceAccount = new Account(source.publicKey(), "100");

  const { unsignedXdr } = buildTopUpTx(sourceAccount, {
    destinationPublicKey: destination.publicKey(),
    amountUsdc: "5.00",
    networkPassphrase: NETWORK_PASSPHRASE,
    memoId: "123456",
  });

  const tx = TransactionBuilder.fromXDR(unsignedXdr, NETWORK_PASSPHRASE) as Transaction;
  assert.equal(tx.memo.type, "id");
  assert.equal(tx.memo.value, "123456");
});

test("buildTopUpTx omits the memo when memoId is not provided", () => {
  const source = Keypair.random();
  const destination = Keypair.random();
  const sourceAccount = new Account(source.publicKey(), "100");

  const { unsignedXdr } = buildTopUpTx(sourceAccount, {
    destinationPublicKey: destination.publicKey(),
    amountUsdc: "5.00",
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  const tx = TransactionBuilder.fromXDR(unsignedXdr, NETWORK_PASSPHRASE) as Transaction;
  assert.equal(tx.memo.type, "none");
});
