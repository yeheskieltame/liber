import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEwalletHandoff } from "./builder.js";

test("gopay returns a best-effort app link plus the original QR content", () => {
  const result = buildEwalletHandoff("gopay", "00020101...6304ABCD");
  assert.equal(result.appLink, "gojek://gopay");
  assert.equal(result.qrContent, "00020101...6304ABCD");
});

test("unknown/unsupported providers return null appLink but still return qrContent", () => {
  const result = buildEwalletHandoff("other", "00020101...6304ABCD");
  assert.equal(result.appLink, null);
  assert.equal(result.qrContent, "00020101...6304ABCD");
});
