// backend/src/routes/quote.ts
import { Hono } from "hono";
import { getQuote as defaultGetQuote } from "../quote/quote.js";

export interface QuoteRouteDeps {
  getQuote: typeof defaultGetQuote;
}

const defaultDeps: QuoteRouteDeps = { getQuote: defaultGetQuote };

export function createQuoteRoute(deps: Partial<QuoteRouteDeps> = {}): Hono {
  const { getQuote } = { ...defaultDeps, ...deps };
  const quoteRoute = new Hono();

  quoteRoute.post("/quote", async (c) => {
    const { amountIdr } = await c.req.json<{ amountIdr: number }>();
    if (!Number.isFinite(amountIdr) || amountIdr <= 0) {
      return c.json({ error: "amountIdr must be a positive number" }, 400);
    }

    const quote = await getQuote(amountIdr);
    return c.json({
      amountUsdc: quote.amountUsdc,
      rateIdrPerUsdc: quote.rateIdrPerUsdc,
      expiresAt: quote.expiresAt,
    });
  });

  return quoteRoute;
}

export const quoteRoute = createQuoteRoute();
