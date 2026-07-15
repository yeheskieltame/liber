"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { getOrder, type OrderStatus as OrderStatusData } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";

const STEPS = [
  { key: "approved", label: "Disetujui" },
  { key: "bridging", label: "Mengirim USDC lintas rantai" },
  { key: "redeeming", label: "Mencairkan ke Rupiah" },
  { key: "completed", label: "Selesai" },
] as const;

const STEP_INDEX: Record<string, number> = {
  approved: 0,
  bridging: 1,
  redeeming: 2,
  completed: 3,
};

export function OrderStatus({ orderId }: { orderId: string }) {
  const [status, setStatus] = useState<OrderStatusData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  useEffect(() => {
    const interval = setInterval(async () => {
      const result = await getOrder(orderId);
      setStatus(result);
      if (result.state === "completed" || result.state === "failed") {
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [orderId]);

  useEffect(() => {
    if (status?.state === "completed") {
      QRCode.toDataURL(status.ewalletHandoff.qrContent).then(setQrDataUrl);
    }
  }, [status]);

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
          <StatusPill state="completed" label="Siap dibayar" />
          <p className="text-sm text-ink/60">
            Saldo di e-wallet kamu sudah bertambah. Scan ulang QRIS {status.merchantName} ini dari aplikasi e-wallet untuk membayar merchant.
          </p>
          {qrDataUrl && (
            <div className="rounded-3xl bg-ink p-4">
              <img src={qrDataUrl} alt="QRIS" width={200} height={200} />
            </div>
          )}
          {status.ewalletHandoff.appLink && (
            <a href={status.ewalletHandoff.appLink} className="w-full">
              <Button variant="secondary">Buka e-wallet</Button>
            </a>
          )}
          {status.stellarTxHash && (
            <p className="break-all text-xs text-ink/40">Tx: {status.stellarTxHash}</p>
          )}
        </Card>
      )}
    </div>
  );
}
