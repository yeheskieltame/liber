// backend/src/qris/types.ts
export interface TLV {
  tag: string;
  length: number;
  value: string;
  children?: TLV[];
}

export interface QRISData {
  version: string;
  method: "static" | "dynamic";
  merchantCategoryCode: string;
  currency: string;
  amount?: string;
  countryCode: string;
  merchantName: string;
  merchantCity: string;
  crc: string;
  raw: TLV[];
}
