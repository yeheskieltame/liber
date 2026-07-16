import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontendOrigins } from "./app.js";

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
