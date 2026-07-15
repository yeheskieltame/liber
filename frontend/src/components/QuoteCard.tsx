"use client";

import { useEffect, useState } from "react";
import type { OrderQuote } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const QUOTE_WINDOW_SECONDS = 30;

export function QuoteCard({ quote, onApprove }: { quote: OrderQuote; onApprove: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(QUOTE_WINDOW_SECONDS);

  useEffect(() => {
    const expiresAt = new Date(quote.quoteExpiresAt).getTime();
    const interval = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
    }, 500);
    return () => clearInterval(interval);
  }, [quote.quoteExpiresAt]);

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-ink/50">
          {quote.merchantName} &middot; {quote.merchantCity}
        </p>
        <p className="mt-2 font-display text-4xl italic text-ink tabular-nums">
          Rp {Number(quote.amountIdr).toLocaleString("id-ID")}
        </p>
        <p className="mt-1 text-sm text-ink/60 tabular-nums">setara {quote.amountUsdc} USDC</p>
      </div>

      <div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
          <div
            className="h-full rounded-full bg-emerald transition-[width] duration-500"
            style={{ width: `${(secondsLeft / QUOTE_WINDOW_SECONDS) * 100}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-ink/40">Kuotasi berlaku {secondsLeft} detik lagi</p>
      </div>

      <Button onClick={onApprove} disabled={secondsLeft <= 0}>
        Bayar sekarang
      </Button>
    </Card>
  );
}
