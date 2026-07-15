"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/ui/PageShell";
import { Card } from "@/components/ui/Card";
import { GradientBalanceCard } from "@/components/ui/GradientBalanceCard";
import { StatusPill } from "@/components/ui/StatusPill";
import { ScanIcon, SendIcon, ReceiveIcon } from "@/components/icons";
import { getBalance, getHistory, type HistoryEntry } from "@/lib/api";

const USER_ID_KEY = "liber:userId";

export default function HomePage() {
  const [balance, setBalance] = useState<{ usdcBalance: string; idrEstimate: string } | null>(null);
  const [recent, setRecent] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    const userId = window.localStorage.getItem(USER_ID_KEY);
    if (!userId) return;

    getBalance(userId)
      .then(setBalance)
      .catch(() => setBalance({ usdcBalance: "0.00", idrEstimate: "0" }));

    getHistory(userId)
      .then((entries) => setRecent(entries.slice(0, 3)))
      .catch(() => setRecent([]));
  }, []);

  return (
    <PageShell>
      <p className="font-display text-lg italic text-ink/70">Welcome back</p>

      <div className="mt-4">
        {balance ? (
          <GradientBalanceCard usdcBalance={balance.usdcBalance} idrEstimate={balance.idrEstimate} />
        ) : (
          <div className="h-40 animate-pulse rounded-[28px] bg-ink/5" />
        )}
      </div>

      <Link
        href="/profile"
        className="mt-4 flex items-center justify-center gap-2 rounded-3xl border border-ink/15 p-4 text-center text-sm font-semibold text-ink transition active:scale-[0.98]"
      >
        <ReceiveIcon className="h-5 w-5 text-emerald" />
        Receive USDC
      </Link>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink/70">Recent activity</h2>
        <Link href="/history" className="text-sm text-emerald underline underline-offset-4">
          See all
        </Link>
      </div>

      <ul className="mt-3 flex flex-col gap-3">
        {recent.length === 0 && <p className="text-sm text-ink/40">No activity yet.</p>}
        {recent.map((entry) => (
          <li key={entry.id}>
            <Card className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald/10 text-emerald">
                {entry.type === "scan" ? <ScanIcon className="h-4 w-4" /> : <SendIcon className="h-4 w-4" />}
              </span>
              <div className="flex-1">
                <p className="font-medium text-ink">{entry.type === "scan" ? entry.merchantName : "Kolo top-up"}</p>
                <p className="text-xs text-ink/40">{new Date(entry.createdAt).toLocaleDateString("en-GB")}</p>
              </div>
              <StatusPill state={entry.type} label={entry.type === "scan" ? "QRIS" : "Top-up"} />
            </Card>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
