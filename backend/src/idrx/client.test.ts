import { test } from "node:test";
import assert from "node:assert/strict";
import { signRequest, getRedeemByTransferTxHash } from "./client.js";

test("signRequest matches an independently pre-computed HMAC-SHA256 base64url digest", () => {
  const secretBase64 = Buffer.from("test-secret").toString("base64"); // "dGVzdC1zZWNyZXQ="
  const method = "POST";
  const url = "/api/auth/add-bank-account";
  const timestamp = "1752537600000";
  const body = JSON.stringify({ bankAccountNumber: "123", bankCode: "GOPAY" });

  const actual = signRequest(secretBase64, method, url, timestamp, body);

  assert.equal(actual, "BS_SiVaaLIUyvoYmDQx05NMy2cgltWrcgTxawCIQiUs");
});

test("getRedeemByTransferTxHash queries by transferTxHash and normalizes the matching row", async (t) => {
  const transferTxHash = "0xTRANSFERHASH1";
  let requestedUrl: string | undefined;

  t.mock.method(globalThis, "fetch", async (url: string | URL) => {
    requestedUrl = url.toString();
    return new Response(
      JSON.stringify({
        data: [
          { address: "0xOTHER", status: "PENDING", amountFrom: "1", transferTxHash: "0xTRANSFERHASH0" },
          { address: "0xDEPOSIT", status: "SUCCESS", amountFrom: "32000", transferTxHash },
        ],
      }),
      { status: 200 }
    );
  });

  const record = await getRedeemByTransferTxHash(
    { baseUrl: "https://idrx.test", apiKey: "key", apiSecret: Buffer.from("secret").toString("base64") },
    transferTxHash
  );

  assert.equal(
    requestedUrl,
    `https://idrx.test/api/transaction/user-transaction-history?transferTxHash=${transferTxHash}`
  );
  assert.deepEqual(record, {
    address: "0xDEPOSIT",
    status: "SUCCESS",
    amountFrom: "32000",
    transferTxHash,
  });
});

test("getRedeemByTransferTxHash returns null when no row matches the requested hash", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({ data: [{ address: "0xOTHER", status: "SUCCESS", amountFrom: "1", transferTxHash: "0xDIFFERENT" }] }),
        { status: 200 }
      )
  );

  const record = await getRedeemByTransferTxHash(
    { baseUrl: "https://idrx.test", apiKey: "key", apiSecret: Buffer.from("secret").toString("base64") },
    "0xMISSING"
  );

  assert.equal(record, null);
});
