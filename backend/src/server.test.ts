import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";

test("GET /health returns ok", async () => {
  const app = createApp();
  const res = await app.request("/health");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
});
