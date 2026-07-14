const SPREAD = 0.01; // 1%
const QUOTE_TTL_MS = 30_000;

export interface Quote {
  amountUsdc: string;
  rateIdrPerUsdc: string;
  expiresAt: Date;
}

export async function getRateIdrPerUsdc(fetchImpl: typeof fetch = fetch): Promise<number> {
  const baseUrl = process.env.COINGECKO_API_URL ?? "https://api.coingecko.com/api/v3";
  const res = await fetchImpl(`${baseUrl}/simple/price?ids=usd-coin&vs_currencies=idr`);
  const body = (await res.json()) as { "usd-coin"?: { idr?: number } };
  const rate = body["usd-coin"]?.idr;

  if (!rate) {
    throw new Error("CoinGecko response missing usd-coin.idr rate");
  }
  return rate;
}

export async function getQuote(
  amountIdr: number,
  deps: { fetchImpl?: typeof fetch; now?: () => Date } = {}
): Promise<Quote> {
  const now = deps.now ?? (() => new Date());
  const rate = await getRateIdrPerUsdc(deps.fetchImpl);
  const amountUsdc = (amountIdr / rate) * (1 + SPREAD);

  return {
    amountUsdc: amountUsdc.toFixed(2),
    rateIdrPerUsdc: rate.toString(),
    expiresAt: new Date(now().getTime() + QUOTE_TTL_MS),
  };
}
