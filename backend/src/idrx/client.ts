import crypto from "node:crypto";

export interface IdrxConfig {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
}

export function signRequest(
  secretBase64: string,
  method: string,
  url: string,
  timestamp: string,
  body: string
): string {
  return crypto
    .createHmac("sha256", Buffer.from(secretBase64, "base64"))
    .update(timestamp)
    .update(method)
    .update(url)
    .update(body)
    .digest("base64url");
}

async function idrxRequest<T>(
  config: IdrxConfig,
  method: "GET" | "POST",
  path: string,
  body?: BodyInit,
  bodyStringForSignature = ""
): Promise<T> {
  const timestamp = Date.now().toString();
  const signature = signRequest(config.apiSecret, method, path, timestamp, bodyStringForSignature);

  const headers: Record<string, string> = {
    "idrx-api-key": config.apiKey,
    "idrx-api-sig": signature,
    "idrx-api-ts": timestamp,
  };
  if (typeof body === "string") {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers,
    body,
  });

  if (!res.ok) {
    throw new Error(`IDRX ${method} ${path} failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { data: T };
  return json.data;
}

export interface OnboardingData {
  email: string;
  fullname: string;
  address: string;
  idNumber: string;
  idFile: Blob;
}

export async function onboardUser(
  config: IdrxConfig,
  data: OnboardingData
): Promise<{ id: number; apiKey: string; apiSecret: string; fullname: string }> {
  const form = new FormData();
  form.set("email", data.email);
  form.set("fullname", data.fullname);
  form.set("address", data.address);
  form.set("idNumber", data.idNumber);
  form.set("idFile", data.idFile);

  // Multipart bodies are not part of the HMAC message per IDRX docs examples
  // (only JSON bodies are shown signed) — sign with an empty body string.
  return idrxRequest(config, "POST", "/api/auth/onboarding", form, "");
}

export async function addBankAccount(
  config: IdrxConfig,
  data: { bankAccountNumber: string; bankCode: string }
): Promise<{ depositWalletAddress: string }> {
  const bodyStr = JSON.stringify(data);
  const result = await idrxRequest<{ DepositWalletAddress: { walletAddress: string } }>(
    config,
    "POST",
    "/api/auth/add-bank-account",
    bodyStr,
    bodyStr
  );
  return { depositWalletAddress: result.DepositWalletAddress.walletAddress };
}

export async function getBankAccounts(
  config: IdrxConfig
): Promise<Array<{ bankCode: string; depositWalletAddress: string }>> {
  const rows = await idrxRequest<Array<{ bankCode: string; DepositWalletAddress: { walletAddress: string } }>>(
    config,
    "GET",
    "/api/auth/get-bank-accounts"
  );
  return rows.map((r) => ({ bankCode: r.bankCode, depositWalletAddress: r.DepositWalletAddress.walletAddress }));
}

export interface RedeemRecord {
  address: string;
  status: string;
  amountFrom: string;
  transferTxHash: string;
}

export async function getRedeemByTransferTxHash(
  config: IdrxConfig,
  transferTxHash: string
): Promise<RedeemRecord | null> {
  const rows = await idrxRequest<Array<{ address: string; status: string; amountFrom: string; transferTxHash: string }>>(
    config,
    "GET",
    `/api/transaction/user-transaction-history?transferTxHash=${encodeURIComponent(transferTxHash)}`
  );
  const match = rows.find((r) => r.transferTxHash === transferTxHash);
  return match ? { address: match.address, status: match.status, amountFrom: match.amountFrom, transferTxHash: match.transferTxHash } : null;
}
