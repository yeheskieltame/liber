export interface CreateUserRequest {
  stellarPublicKey: string;
  email: string;
  fullname: string;
  address: string;
  idNumber: string;
  idFileBase64: string;
  bankAccountNumber: string;
  bankCode: string;
  provider: "gopay" | "dana" | "ovo" | "other";
}

export interface OrderQuote {
  orderId: string;
  merchantName: string;
  merchantCity: string;
  amountIdr: string;
  amountUsdc: string;
  quoteExpiresAt: string;
  unsignedBridgeXdr: string;
}

export interface OrderStatus {
  state: string;
  merchantName: string;
  amountIdr: string;
  amountUsdc: string;
  stellarTxHash: string | null;
  failureReason: string | null;
  ewalletHandoff: { appLink: string | null; qrContent: string };
}

function baseUrl(override?: string): string {
  return override ?? process.env.NEXT_PUBLIC_BACKEND_URL!;
}

async function postJson<T>(path: string, body: unknown, fetchImpl: typeof fetch, base: string): Promise<T> {
  const res = await fetchImpl(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function createUser(
  req: CreateUserRequest,
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<{ userId: string; unsignedTrustlineXdr: string }> {
  return postJson("/users", req, fetchImpl, base);
}

export async function confirmTrustline(
  userId: string,
  signedXdr: string,
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<{ ready: boolean }> {
  return postJson(`/users/${userId}/confirm-trustline`, { signedXdr }, fetchImpl, base);
}

export async function createOrder(
  req: { userId: string; qrContent: string; amountIdr?: number },
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<OrderQuote> {
  return postJson("/orders", req, fetchImpl, base);
}

export async function approveOrder(
  orderId: string,
  signedXdr: string,
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<{ state: string; stellarTxHash: string }> {
  return postJson(`/orders/${orderId}/approve`, { signedXdr }, fetchImpl, base);
}

export async function getOrder(
  orderId: string,
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<OrderStatus> {
  const res = await fetchImpl(`${base}/orders/${orderId}`);
  if (!res.ok) throw new Error(`getOrder failed: ${res.status}`);
  return res.json();
}

export async function getBalance(
  userId: string,
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<{ usdcBalance: string; idrEstimate: string }> {
  const res = await fetchImpl(`${base}/users/${userId}/balance`);
  if (!res.ok) throw new Error(`getBalance failed: ${res.status}`);
  return res.json();
}

export interface HistoryEntry {
  orderId: string;
  merchantName: string;
  merchantCity: string;
  amountIdr: string;
  amountUsdc: string;
  state: string;
  stellarTxHash: string | null;
  createdAt: string;
}

export async function getOrderHistory(
  userId: string,
  fetchImpl: typeof fetch = fetch,
  base = baseUrl()
): Promise<HistoryEntry[]> {
  const res = await fetchImpl(`${base}/users/${userId}/orders`);
  if (!res.ok) throw new Error(`getOrderHistory failed: ${res.status}`);
  const body = (await res.json()) as { orders: HistoryEntry[] };
  return body.orders;
}
