import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, TransactionBuilder, Account, Operation, Asset } from "@stellar/stellar-sdk";
import { generateKeypair, signXdr } from "./keypair.js";

const NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";

test("generateKeypair returns a valid Stellar keypair", () => {
  const { publicKey, secretKey } = generateKeypair();
  assert.match(publicKey, /^G[A-Z0-9]{55}$/);
  assert.match(secretKey, /^S[A-Z0-9]{55}$/);
  assert.equal(Keypair.fromSecret(secretKey).publicKey(), publicKey);
});

test("signXdr signs a transaction with the given secret key", () => {
  const kp = Keypair.random();
  const account = new Account(kp.publicKey(), "1");
  const tx = new TransactionBuilder(account, { fee: "10000", networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.payment({ destination: kp.publicKey(), asset: Asset.native(), amount: "1" }))
    .setTimeout(30)
    .build();

  const signedXdr = signXdr(kp.secret(), tx.toXDR(), NETWORK_PASSPHRASE);
  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

  assert.equal(signedTx.signatures.length, 1);
});
