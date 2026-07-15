"use client";

import { useEffect, useState } from "react";
import { getOrder, type OrderStatus as OrderStatusData } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";

const STEPS = [
  { key: "approved", label: "Disetujui" },
  { key: "awaiting_settlement", label: "Menunggu pembayaran ke merchant" },
  { key: "completed", label: "Selesai" },
] as const;

const STEP_INDEX: Record<string, number> = {
  approved: 0,
  awaiting_settlement: 1,
  completed: 2,
};

export function OrderStatus({ orderId }: { orderId: string }) {
  const [status, setStatus] = useState<OrderStatusData | null>(null);

  useEffect(() => {
    async function poll() {
      try {
        const result = await getOrder(orderId);
        setStatus(result);
        if (result.state === "completed" || result.state === "failed") {
          clearInterval(interval);
        }
      } catch (err) {
        console.error("poll failed, will retry", err);
      }
    }
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [orderId]);

  if (!status) {
    return <p className="mt-8 text-center text-sm text-ink/60">Memuat status...</p>;
  }

  // A "failed" order has no known partial progress — the backend only reports a terminal
  // failure, not which step it failed at. Don't paint any dot emerald in that case; the
  // rose StatusPill + failure message below are the sole indicator of the outcome.
  const currentIndex = status.state === "failed" ? -1 : STEP_INDEX[status.state] ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <ol className="flex flex-col gap-4">
          {STEPS.map((step, i) => (
            <li key={step.key} className="flex items-center gap-3">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  i <= currentIndex ? "bg-emerald" : "bg-ink/15"
                }`}
              />
              <span className={`text-sm ${i <= currentIndex ? "text-ink" : "text-ink/40"}`}>{step.label}</span>
            </li>
          ))}
        </ol>
        {status.state === "failed" && (
          <div className="mt-4">
            <StatusPill state="failed" label="Gagal" />
            <p className="mt-2 text-sm text-rose">{status.failureReason}</p>
          </div>
        )}
      </Card>

      {status.state === "completed" && (
        <Card className="flex flex-col items-center gap-4 text-center">
          <StatusPill state="completed" label="Selesai" />
          <p className="text-sm text-ink/60">
            Pembayaran ke {status.merchantName} sudah selesai. Terima kasih sudah menggunakan Liber.
          </p>
          <div className="w-full rounded-2xl bg-paper px-4 py-3 text-left">
            <p className="text-xs font-medium uppercase tracking-wide text-ink/50">Rincian</p>
            <p className="mt-1 text-sm text-ink">Merchant: {status.merchantName}</p>
            <p className="text-sm text-ink tabular-nums">Rp {Number(status.amountIdr).toLocaleString("id-ID")}</p>
            <p className="text-sm text-ink/60 tabular-nums">{status.amountUsdc} USDC</p>
          </div>
          {status.stellarTxHash && <p className="break-all text-xs text-ink/40">Tx: {status.stellarTxHash}</p>}
        </Card>
      )}
    </div>
  );
}
