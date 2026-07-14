import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { signRequest } from "./client.js";

test("signRequest matches a manually computed HMAC-SHA256 base64url digest", () => {
  const secretBase64 = Buffer.from("test-secret").toString("base64");
  const method = "POST";
  const url = "/api/auth/add-bank-account";
  const timestamp = "1752537600000";
  const body = JSON.stringify({ bankAccountNumber: "123", bankCode: "GOPAY" });

  const expected = crypto
    .createHmac("sha256", Buffer.from(secretBase64, "base64"))
    .update(timestamp)
    .update(method)
    .update(url)
    .update(body)
    .digest("base64url");

  const actual = signRequest(secretBase64, method, url, timestamp, body);

  assert.equal(actual, expected);
});
