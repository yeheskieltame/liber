// backend/src/qris/crc16.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateCRC16 } from "./crc16.js";

test("matches the CRC-16/CCITT-FALSE standard check value", () => {
  assert.equal(calculateCRC16("123456789"), "29B1");
});
