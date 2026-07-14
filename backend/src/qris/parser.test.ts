// backend/src/qris/parser.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQRIS, parseTLV } from "./parser.js";
import { tlv, buildQris } from "./test-helpers.js";

test("parseTLV parses a single tag", () => {
  const elements = parseTLV(tlv("00", "01"));
  assert.deepEqual(elements, [{ tag: "00", length: 2, value: "01" }]);
});

test("parseQRIS extracts merchant name, city, and static method", () => {
  const qris = buildQris([
    ["00", "01"],
    ["01", "11"],
    ["53", "360"],
    ["58", "ID"],
    ["59", "Warung Kopi Asa"],
    ["60", "Jakarta"],
  ]);

  const data = parseQRIS(qris);

  assert.equal(data.method, "static");
  assert.equal(data.merchantName, "Warung Kopi Asa");
  assert.equal(data.merchantCity, "Jakarta");
  assert.equal(data.currency, "360");
  assert.equal(data.countryCode, "ID");
  assert.equal(data.amount, undefined);
});

test("parseQRIS extracts amount for dynamic QRIS", () => {
  const qris = buildQris([
    ["00", "01"],
    ["01", "12"],
    ["53", "360"],
    ["54", "25000"],
    ["58", "ID"],
    ["59", "Warung Kopi Asa"],
    ["60", "Jakarta"],
  ]);

  const data = parseQRIS(qris);

  assert.equal(data.method, "dynamic");
  assert.equal(data.amount, "25000");
});
