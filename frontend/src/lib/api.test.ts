import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createOrder } from "./api.js";

test("createOrder posts to /orders and returns the parsed quote", async () => {
  const fakeFetch = mock.fn(async (url: string, init: RequestInit) => {
    assert.equal(url, "http://backend.test/orders");
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body as string), { userId: "u1", qrContent: "0002..." });
    return new Response(
      JSON.stringify({
        orderId: "o1",
        merchantName: "Warung Kopi Asa",
        merchantCity: "Jakarta",
        amountIdr: "25000",
        amountUsdc: "1.58",
        quoteExpiresAt: "2026-07-15T00:00:30.000Z",
        unsignedBridgeXdr: "FAKE_XDR",
      }),
      { status: 201 }
    );
  });

  const result = await createOrder({ userId: "u1", qrContent: "0002..." }, fakeFetch as typeof fetch, "http://backend.test");

  assert.equal(result.orderId, "o1");
  assert.equal(result.unsignedBridgeXdr, "FAKE_XDR");
});

test("createOrder includes amountIdr as query parameter for static QRIS", async () => {
  const fakeFetch = mock.fn(async (url: string, init: RequestInit) => {
    assert.equal(url, "http://backend.test/orders?amountIdr=25000");
    assert.equal(init.method, "POST");
    const body = JSON.parse(init.body as string);
    assert.equal(body.userId, "u1");
    assert.equal(body.qrContent, "0002...");
    assert.equal(body.amountIdr, 25000);
    return new Response(
      JSON.stringify({
        orderId: "o2",
        merchantName: "Warung Kopi Asa",
        merchantCity: "Jakarta",
        amountIdr: "25000",
        amountUsdc: "1.58",
        quoteExpiresAt: "2026-07-15T00:00:30.000Z",
        unsignedBridgeXdr: "FAKE_XDR_2",
      }),
      { status: 201 }
    );
  });

  const result = await createOrder(
    { userId: "u1", qrContent: "0002...", amountIdr: 25000 },
    fakeFetch as typeof fetch,
    "http://backend.test"
  );

  assert.equal(result.orderId, "o2");
  assert.equal(result.unsignedBridgeXdr, "FAKE_XDR_2");
});
