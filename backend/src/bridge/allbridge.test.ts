import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { buildBridgeTx } from "./allbridge.js";

test("buildBridgeTx asks the SDK for SRB->BAS USDC with the right send params", async () => {
  const rawTxBuilderSend = mock.fn(async () => "FAKE_XDR");
  const fakeSdk = {
    chainDetailsMap: mock.fn(async () => ({
      SRB: { tokens: [{ symbol: "USDC", tokenAddress: "srb-usdc-addr" }] },
      BAS: { tokens: [{ symbol: "USDC", tokenAddress: "base-usdc-addr" }] },
    })),
    bridge: { rawTxBuilder: { send: rawTxBuilderSend } },
  };

  const result = await buildBridgeTx(
    { fromAccountAddress: "GFROM...", toAccountAddress: "0xTO...", amountUsdc: "5" },
    fakeSdk as any
  );

  assert.equal(result.unsignedXdr, "FAKE_XDR");
  assert.equal(rawTxBuilderSend.mock.calls.length, 1);
  const [sendParams] = rawTxBuilderSend.mock.calls[0].arguments;
  assert.equal(sendParams.fromAccountAddress, "GFROM...");
  assert.equal(sendParams.toAccountAddress, "0xTO...");
  assert.equal(sendParams.amount, "5");
  assert.equal(sendParams.sourceToken.tokenAddress, "srb-usdc-addr");
  assert.equal(sendParams.destinationToken.tokenAddress, "base-usdc-addr");
});
