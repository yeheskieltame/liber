import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createOrder, getOrder } from "./api.js";

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
        unsignedPaymentXdr: "FAKE_XDR",
      }),
      { status: 201 }
    );
  });

  const result = await createOrder({ userId: "u1", qrContent: "0002..." }, fakeFetch as typeof fetch, "http://backend.test");

  assert.equal(result.orderId, "o1");
  assert.equal(result.unsignedPaymentXdr, "FAKE_XDR");
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
        unsignedPaymentXdr: "FAKE_XDR_2",
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
  assert.equal(result.unsignedPaymentXdr, "FAKE_XDR_2");
});

test("createOrder surfaces the backend's error message on a non-OK response", async () => {
  const fakeFetch = mock.fn(async () => {
    return new Response(JSON.stringify({ error: "an order is already in progress for this user" }), {
      status: 409,
    });
  });

  await assert.rejects(
    createOrder({ userId: "u1", qrContent: "0002..." }, fakeFetch as typeof fetch, "http://backend.test"),
    (err: Error) => {
      assert.equal(err.message, "an order is already in progress for this user");
      return true;
    }
  );
});

test("createOrder falls back to a generic message when the error body isn't JSON", async () => {
  const fakeFetch = mock.fn(async () => {
    return new Response("Internal Server Error", { status: 500 });
  });

  await assert.rejects(
    createOrder({ userId: "u1", qrContent: "0002..." }, fakeFetch as typeof fetch, "http://backend.test"),
    (err: Error) => {
      assert.equal(err.message, "/orders failed: 500");
      return true;
    }
  );
});

test("getOrder surfaces the backend's error message on a non-OK response", async () => {
  const fakeFetch = mock.fn(async () => {
    return new Response(JSON.stringify({ error: "order not found" }), { status: 404 });
  });

  await assert.rejects(getOrder("o1", fakeFetch as typeof fetch, "http://backend.test"), (err: Error) => {
    assert.equal(err.message, "order not found");
    return true;
  });
});
