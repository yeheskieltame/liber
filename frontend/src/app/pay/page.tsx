"use client";

import { useCallback, useState } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { QrScanner } from "@/components/QrScanner";
import { QuoteCard } from "@/components/QuoteCard";
import { parseQRIS } from "@/lib/qris/parser";
import { getQuote, logScan, type Quote } from "@/lib/api";

export default function PayPage() {
  const [merchant, setMerchant] = useState<{ name: string; city: string; amountIdr: string } | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleScan = useCallback(async (qrContent: string) => {
    try {
      const parsed = parseQRIS(qrContent);
      const userId = window.localStorage.getItem("liber:userId");
      if (!userId) throw new Error("Belum onboarding. Buka /onboarding dulu.");

      let amountIdr: number;
      if (parsed.amount) {
        amountIdr = Number(parsed.amount);
      } else {
        const input = window.prompt(`Nominal untuk ${parsed.merchantName} (Rp)`);
        if (!input) return;
        amountIdr = Number(input);
        if (!Number.isFinite(amountIdr) || amountIdr <= 0) {
          setError("Nominal tidak valid. Masukkan angka lebih dari 0.");
          return;
        }
      }

      const result = await getQuote(amountIdr);
      setMerchant({ name: parsed.merchantName, city: parsed.merchantCity, amountIdr: amountIdr.toString() });
      setQuote(result);

      logScan(userId, {
        merchantName: parsed.merchantName,
        merchantCity: parsed.merchantCity,
        amountIdr: amountIdr.toString(),
        amountUsdc: result.amountUsdc,
      }).catch((err) => console.error("failed to log scan", err));
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
        {quote && merchant && (
          <QuoteCard merchantName={merchant.name} merchantCity={merchant.city} amountIdr={merchant.amountIdr} quote={quote} />
        )}
      </div>
    </PageShell>
  );
}
