"use client";

import { useEffect, useState } from "react";
import type { Quote } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const QUOTE_WINDOW_SECONDS = 30;

export function QuoteCard({
  merchantName,
  merchantCity,
  amountIdr,
  quote,
}: {
  merchantName: string;
  merchantCity: string;
  amountIdr: string;
  quote: Quote;
}) {
  const [secondsLeft, setSecondsLeft] = useState(QUOTE_WINDOW_SECONDS);

  useEffect(() => {
    const expiresAt = new Date(quote.expiresAt).getTime();
    const interval = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
    }, 500);
    return () => clearInterval(interval);
  }, [quote.expiresAt]);

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-ink/50">
          {merchantName} &middot; {merchantCity}
        </p>
        <p className="mt-2 font-display text-4xl italic text-ink tabular-nums">
          Rp {Number(amountIdr).toLocaleString("en-US")}
        </p>
        <p className="mt-1 text-sm text-ink/60 tabular-nums">&asymp; {quote.amountUsdc} USDC</p>
      </div>

      <div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
          <div
            className="h-full rounded-full bg-emerald transition-[width] duration-500"
            style={{ width: `${(secondsLeft / QUOTE_WINDOW_SECONDS) * 100}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-ink/40">Rate valid for {secondsLeft}s more</p>
      </div>

      <a href="gojek://gopay" className="w-full">
        <Button>Open GoPay</Button>
      </a>
      <p className="text-center text-xs text-ink/40">
        Scan the same QRIS in GoPay, then pay with your linked Kolo card.
      </p>
    </Card>
  );
}
