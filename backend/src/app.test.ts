import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontendOrigins, didFallBackToLocalhost } from "./app.js";

test("parseFrontendOrigins splits, trims, and drops trailing slashes", () => {
  const result = parseFrontendOrigins(" https://a.com/ , https://b.com ,http://localhost:3000");
  assert.deepEqual(result, ["https://a.com", "https://b.com", "http://localhost:3000"]);
});

test("parseFrontendOrigins falls back to localhost when the input is empty or whitespace-only", () => {
  assert.deepEqual(parseFrontendOrigins(""), ["http://localhost:3000"]);
  assert.deepEqual(parseFrontendOrigins("   "), ["http://localhost:3000"]);
  assert.deepEqual(parseFrontendOrigins(undefined), ["http://localhost:3000"]);
});

test("parseFrontendOrigins drops empty entries from stray commas", () => {
  assert.deepEqual(parseFrontendOrigins("https://a.com,,https://b.com,"), ["https://a.com", "https://b.com"]);
});

test("didFallBackToLocalhost is false when localhost was set explicitly, even with formatting quirks", () => {
  assert.equal(didFallBackToLocalhost("http://localhost:3000"), false);
  assert.equal(didFallBackToLocalhost("http://localhost:3000/"), false);
  assert.equal(didFallBackToLocalhost(" http://localhost:3000 "), false);
});

test("didFallBackToLocalhost is true only when parsing yields zero entries", () => {
  assert.equal(didFallBackToLocalhost(""), true);
  assert.equal(didFallBackToLocalhost("   "), true);
  assert.equal(didFallBackToLocalhost(undefined), true);
  assert.equal(didFallBackToLocalhost(",,,"), true);
});

test("didFallBackToLocalhost is false when other real origins are configured", () => {
  assert.equal(didFallBackToLocalhost("https://example.com"), false);
});
