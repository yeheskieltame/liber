"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { getOrderHistory, type HistoryEntry } from "@/lib/api";

const STATE_LABELS: Record<string, string> = {
  scanned: "Diproses",
  quoted: "Diproses",
  approved: "Diproses",
  bridging: "Diproses",
  redeeming: "Diproses",
  completed: "Selesai",
  failed: "Gagal",
};

function truncateHash(hash: string): string {
  return hash.length > 14 ? `${hash.slice(0, 8)}...${hash.slice(-6)}` : hash;
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    const userId = window.localStorage.getItem("liber:userId");
    if (userId) getOrderHistory(userId).then(setEntries);
  }, []);

  return (
    <PageShell>
      <h1 className="font-display text-2xl italic text-ink">Riwayat transaksi</h1>

      {!entries && <p className="mt-8 text-center text-sm text-ink/60">Memuat riwayat...</p>}
      {entries?.length === 0 && <p className="mt-8 text-center text-sm text-ink/40">Belum ada transaksi.</p>}

      <ul className="mt-6 flex flex-col gap-3">
        {entries?.map((entry) => (
          <li key={entry.orderId}>
            <Card className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-ink">{entry.merchantName}</span>
                <StatusPill state={entry.state} label={STATE_LABELS[entry.state] ?? entry.state} />
              </div>
              <p className="text-xs text-ink/50">{entry.merchantCity}</p>
              <p className="text-sm tabular-nums text-ink/80">
                Rp {Number(entry.amountIdr).toLocaleString("id-ID")} &middot; {entry.amountUsdc} USDC
              </p>
              {entry.stellarTxHash && (
                <p className="font-mono text-xs text-ink/40">Tx: {truncateHash(entry.stellarTxHash)}</p>
              )}
              <p className="text-xs text-ink/30">{new Date(entry.createdAt).toLocaleString("id-ID")}</p>
            </Card>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
