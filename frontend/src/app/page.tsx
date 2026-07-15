"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/ui/PageShell";
import { GradientBalanceCard } from "@/components/ui/GradientBalanceCard";
import { getBalance } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [balance, setBalance] = useState<{ usdcBalance: string; idrEstimate: string } | null>(null);

  useEffect(() => {
    async function loadHome() {
      const stored = window.localStorage.getItem("liber:userId");
      if (!stored) {
        router.push("/onboarding");
        return;
      }
      setUserId(stored);
      try {
        const result = await getBalance(stored);
        setBalance(result);
      } catch {
        setBalance({ usdcBalance: "0.00", idrEstimate: "0" });
      }
    }
    loadHome();
  }, [router]);

  if (!userId) return null;

  return (
    <PageShell>
      <p className="font-display text-lg italic text-ink/70">Halo,</p>
      <h1 className="font-display text-2xl text-ink">selamat datang kembali.</h1>

      <div className="mt-6">
        {balance ? (
          <GradientBalanceCard usdcBalance={balance.usdcBalance} idrEstimate={balance.idrEstimate} />
        ) : (
          <div className="h-40 animate-pulse rounded-[28px] bg-ink/5" />
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Link
          href="/pay"
          className="flex flex-col items-center justify-center gap-2 rounded-3xl bg-gold p-5 text-center font-semibold text-ink shadow-[0_12px_30px_-12px_rgba(231,163,58,0.65)]"
        >
          Scan QRIS
        </Link>
        <Link
          href="/receive"
          className="flex flex-col items-center justify-center gap-2 rounded-3xl border border-ink/15 p-5 text-center font-semibold text-ink"
        >
          Terima USDC
        </Link>
      </div>

      <Link
        href="/kolo"
        className="mt-3 flex items-center justify-center gap-2 rounded-3xl border border-ink/15 p-4 text-center text-sm font-semibold text-ink"
      >
        Kelola Kolo
      </Link>

      <Link href="/history" className="mt-6 text-center text-sm text-ink/50 underline underline-offset-4">
        Lihat riwayat transaksi
      </Link>
    </PageShell>
  );
}
