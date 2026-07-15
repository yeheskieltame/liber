import { test } from "node:test";
import assert from "node:assert/strict";
import { encrypt, decrypt, DecryptionError } from "./crypto.js";

test("encrypt then decrypt returns the original plaintext", async () => {
  const payload = await encrypt("SECRETKEYVALUE", "correct horse battery staple");
  const result = await decrypt(payload, "correct horse battery staple");
  assert.equal(result, "SECRETKEYVALUE");
});

test("decrypt throws DecryptionError with the wrong passphrase", async () => {
  const payload = await encrypt("SECRETKEYVALUE", "correct-passphrase");
  await assert.rejects(decrypt(payload, "wrong-passphrase"), (err: Error) => {
    assert.ok(err instanceof DecryptionError);
    assert.equal(err.message, "Incorrect passphrase or corrupted backup.");
    return true;
  });
});

test("encrypting the same plaintext twice produces a different salt, iv, and ciphertext", async () => {
  const first = await encrypt("SECRETKEYVALUE", "same-passphrase");
  const second = await encrypt("SECRETKEYVALUE", "same-passphrase");
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
});
