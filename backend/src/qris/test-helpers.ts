// backend/src/qris/test-helpers.ts
import { calculateCRC16 } from "./crc16.js";

export function tlv(tag: string, value: string): string {
  return tag + value.length.toString().padStart(2, "0") + value;
}

export function buildQris(fields: Array<[string, string]>): string {
  const body = fields.map(([tag, value]) => tlv(tag, value)).join("") + "6304";
  return body + calculateCRC16(body);
}
