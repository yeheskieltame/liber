"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { ScanIcon, SendIcon } from "@/components/icons";
import { getHistory, type HistoryEntry } from "@/lib/api";

const USER_ID_KEY = "liber:userId";

function truncateHash(hash: string): string {
  return hash.length > 14 ? `${hash.slice(0, 8)}...${hash.slice(-6)}` : hash;
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    const userId = window.localStorage.getItem(USER_ID_KEY);
    if (!userId) return;
    getHistory(userId)
      .then(setEntries)
      .catch(() => setEntries([]));
  }, []);

  return (
    <PageShell>
      <h1 className="font-display text-2xl italic text-ink">History</h1>

      {!entries && <p className="mt-8 text-center text-sm text-ink/60">Loading...</p>}
      {entries?.length === 0 && <p className="mt-8 text-center text-sm text-ink/40">No activity yet.</p>}

      <ul className="mt-6 flex flex-col gap-3">
        {entries?.map((entry) => (
          <li key={entry.id}>
            <Card className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald/10 text-emerald">
                {entry.type === "scan" ? <ScanIcon className="h-5 w-5" /> : <SendIcon className="h-5 w-5" />}
              </span>
              <div className="flex flex-1 flex-col gap-2">
                {entry.type === "scan" ? (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium text-ink">{entry.merchantName}</span>
                      <StatusPill state="scan" label="QRIS Scan" />
                    </div>
                    <p className="text-xs text-ink/50">{entry.merchantCity}</p>
                    <p className="text-sm tabular-nums text-ink/80">
                      Rp {Number(entry.amountIdr).toLocaleString("en-US")} &middot; {entry.amountUsdc} USDC
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium text-ink">Kolo Top-up</span>
                      <StatusPill state="topup" label="Sent" />
                    </div>
                    <p className="text-sm tabular-nums text-ink/80">{entry.amountUsdc} USDC</p>
                    {entry.stellarTxHash && (
                      <p className="font-mono text-xs text-ink/40">Tx: {truncateHash(entry.stellarTxHash)}</p>
                    )}
                  </>
                )}
                <p className="text-xs text-ink/30">{new Date(entry.createdAt).toLocaleString("en-GB")}</p>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
