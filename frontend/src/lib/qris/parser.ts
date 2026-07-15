// Ported from https://github.com/verssache/qris-dinamis (MIT license).
import type { TLV, QRISData } from "./types.js";

const NESTED_TAGS = new Set([
  ...Array.from({ length: 26 }, (_, i) => String(i + 26).padStart(2, "0")),
  "62",
]);

export function parseTLV(data: string): TLV[] {
  const elements: TLV[] = [];
  let pos = 0;

  while (pos < data.length) {
    if (pos + 4 > data.length) break;
    const tag = data.substring(pos, pos + 2);
    const length = parseInt(data.substring(pos + 2, pos + 4), 10);
    if (isNaN(length) || pos + 4 + length > data.length) break;

    const value = data.substring(pos + 4, pos + 4 + length);
    const element: TLV = { tag, length, value };
    if (NESTED_TAGS.has(tag)) {
      element.children = parseTLV(value);
    }
    elements.push(element);
    pos += 4 + length;
  }

  return elements;
}

export function parseQRIS(qrisString: string): QRISData {
  const raw = parseTLV(qrisString);
  const findTag = (tag: string) => raw.find((t) => t.tag === tag);

  return {
    version: findTag("00")?.value ?? "01",
    method: findTag("01")?.value === "12" ? "dynamic" : "static",
    merchantCategoryCode: findTag("52")?.value ?? "",
    currency: findTag("53")?.value ?? "360",
    amount: findTag("54")?.value,
    countryCode: findTag("58")?.value ?? "ID",
    merchantName: findTag("59")?.value ?? "",
    merchantCity: findTag("60")?.value ?? "",
    crc: findTag("63")?.value ?? "",
    raw,
  };
}
