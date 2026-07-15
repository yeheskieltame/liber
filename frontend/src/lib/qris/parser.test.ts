import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQRIS, parseTLV } from "./parser.js";
import { calculateCRC16 } from "./crc16.js";

function tlv(tag: string, value: string): string {
  return tag + value.length.toString().padStart(2, "0") + value;
}
function buildQris(fields: Array<[string, string]>): string {
  const body = fields.map(([tag, value]) => tlv(tag, value)).join("") + "6304";
  return body + calculateCRC16(body);
}

test("parseTLV parses a single tag", () => {
  assert.deepEqual(parseTLV(tlv("00", "01")), [{ tag: "00", length: 2, value: "01" }]);
});

test("parseQRIS extracts merchant name, city, and dynamic amount", () => {
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
  assert.equal(data.merchantName, "Warung Kopi Asa");
  assert.equal(data.amount, "25000");
});

test("calculateCRC16 matches the CRC-16/CCITT-FALSE standard check value", () => {
  assert.equal(calculateCRC16("123456789"), "29B1");
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

test("parseTLV parses nested tags", () => {
  // Tag 26 (0x1A) is a nested tag. Build a payload with tag 26 containing sub-tag 00
  const nestedPayload = tlv("00", "01") + tlv("26", tlv("00", "test"));
  const elements = parseTLV(nestedPayload);

  assert.equal(elements.length, 2);
  assert.equal(elements[0].tag, "00");
  assert.equal(elements[0].value, "01");
  assert.equal(elements[1].tag, "26");
  assert.ok(elements[1].children);
  assert.equal(elements[1].children?.length, 1);
  assert.equal(elements[1].children?.[0].tag, "00");
  assert.equal(elements[1].children?.[0].value, "test");
});
