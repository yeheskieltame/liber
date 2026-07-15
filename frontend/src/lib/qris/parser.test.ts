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
