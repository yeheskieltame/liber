export interface CreateUserRequest {
  stellarPublicKey: string;
}

export interface Quote {
  amountUsdc: string;
  rateIdrPerUsdc: string;
  expiresAt: string;
}

export interface HistoryEntry {
  type: "scan" | "topup";
  id: string;
  createdAt: string;
  merchantName?: string;
  merchantCity?: string;
  amountIdr?: string;
  amountUsdc?: string;
  stellarTxHash?: string;
}

function baseUrl(override?: string): string {
  return override ?? process.env.NEXT_PUBLIC_BACKEND_URL!;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const message = await res
    .json()
    .then((body) => body.error)
    .catch(() => null);
  return message ?? fallback;
}

async function postJson<T>(path: string, body: unknown, fetchImpl: typeof fetch, base: string): Promise<T> {
  const res = await fetchImpl(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessage(res, `${path} failed: ${res.status}`));
  return res.json() as Promise<T>;
}

export async function createUser(
  req: CreateUserRequest,
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<{ status: "created"; userId: string; unsignedTrustlineXdr: string } | { status: "awaiting_funding" }> {
  const res = await fetchImpl(`${base}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (res.status === 202) return { status: "awaiting_funding" };
  if (!res.ok) throw new Error(await errorMessage(res, `/users failed: ${res.status}`));
  const responseBody = (await res.json()) as { userId: string; unsignedTrustlineXdr: string };
  return { status: "created", userId: responseBody.userId, unsignedTrustlineXdr: responseBody.unsignedTrustlineXdr };
}

export async function getUserIdByKey(
  stellarPublicKey: string,
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<{ userId: string } | null> {
  const res = await fetchImpl(`${base}/users/by-key/${stellarPublicKey}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await errorMessage(res, `getUserIdByKey failed: ${res.status}`));
  return res.json();
}

export async function confirmTrustline(
  userId: string,
  signedXdr: string,
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<{ ready: boolean }> {
  return postJson(`/users/${userId}/confirm-trustline`, { signedXdr }, fetchImpl, base);
}

export async function getQuote(
  amountIdr: number,
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<Quote> {
  return postJson("/quote", { amountIdr }, fetchImpl, base);
}

export async function saveKoloAddress(
  userId: string,
  koloStellarAddress: string,
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<{ koloStellarAddress: string }> {
  return postJson(`/users/${userId}/kolo-address`, { koloStellarAddress }, fetchImpl, base);
}

export async function logScan(
  userId: string,
  scan: { merchantName: string; merchantCity: string; amountIdr: string; amountUsdc: string },
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<{ id: string }> {
  return postJson(`/users/${userId}/scans`, scan, fetchImpl, base);
}

export async function logTopup(
  userId: string,
  topup: { amountUsdc: string; stellarTxHash: string },
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<{ id: string }> {
  return postJson(`/users/${userId}/topups`, topup, fetchImpl, base);
}

export async function getBalance(
  userId: string,
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<{ usdcBalance: string; idrEstimate: string }> {
  const res = await fetchImpl(`${base}/users/${userId}/balance`);
  if (!res.ok) throw new Error(await errorMessage(res, `getBalance failed: ${res.status}`));
  return res.json();
}

export async function getHistory(
  userId: string,
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<HistoryEntry[]> {
  const res = await fetchImpl(`${base}/users/${userId}/history`);
  if (!res.ok) throw new Error(await errorMessage(res, `getHistory failed: ${res.status}`));
  const body = (await res.json()) as { entries: HistoryEntry[] };
  return body.entries;
}
