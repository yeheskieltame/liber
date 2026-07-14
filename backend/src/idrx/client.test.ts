import { test } from "node:test";
import assert from "node:assert/strict";
import { signRequest } from "./client.js";

test("signRequest matches an independently pre-computed HMAC-SHA256 base64url digest", () => {
  const secretBase64 = Buffer.from("test-secret").toString("base64"); // "dGVzdC1zZWNyZXQ="
  const method = "POST";
  const url = "/api/auth/add-bank-account";
  const timestamp = "1752537600000";
  const body = JSON.stringify({ bankAccountNumber: "123", bankCode: "GOPAY" });

  const actual = signRequest(secretBase64, method, url, timestamp, body);

  assert.equal(actual, "BS_SiVaaLIUyvoYmDQx05NMy2cgltWrcgTxawCIQiUs");
});
