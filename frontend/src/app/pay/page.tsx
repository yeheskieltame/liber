"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/ui/PageShell";
import { QrScanner } from "@/components/QrScanner";
import { QuoteCard } from "@/components/QuoteCard";
import { parseQRIS } from "@/lib/qris/parser";
import { createOrder, type OrderQuote } from "@/lib/api";

export default function PayPage() {
  const router = useRouter();
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleScan = useCallback(async (qrContent: string) => {
    try {
      const parsed = parseQRIS(qrContent);
      const userId = window.localStorage.getItem("liber:userId");
      if (!userId) throw new Error("Belum onboarding. Buka /onboarding dulu.");

      let amountIdr: number | undefined;
      if (!parsed.amount) {
        const input = window.prompt(`Nominal untuk ${parsed.merchantName} (Rp)`);
        if (!input) return;
        amountIdr = Number(input);
      }

      const result = await createOrder({ userId, qrContent, amountIdr });
      window.sessionStorage.setItem(`liber:pendingBridgeXdr:${result.orderId}`, result.unsignedBridgeXdr);
      setQuote(result);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  return (
    <PageShell>
      <h1 className="font-display text-2xl italic text-ink">Scan QRIS</h1>
      <div className="mt-6">
        {!quote && <QrScanner onScan={handleScan} onError={setError} />}
        {error && <p className="mt-4 text-center text-sm text-rose">{error}</p>}
        {quote && <QuoteCard quote={quote} onApprove={() => router.push(`/pay/${quote.orderId}`)} />}
      </div>
    </PageShell>
  );
}
