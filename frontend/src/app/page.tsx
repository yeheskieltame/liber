"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/ui/PageShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { GradientBalanceCard } from "@/components/ui/GradientBalanceCard";
import { getBalance } from "@/lib/api";

const FEATURES = [
  {
    title: "Dompet Stellar non-custodial",
    body: "Kunci pribadi kamu tersimpan di perangkat kamu sendiri. Liber tidak pernah menyimpan atau mengakses kunci itu.",
  },
  {
    title: "Scan QRIS, cek kurs",
    body: "Scan QRIS merchant mana pun, langsung lihat berapa USDC yang setara sebelum kamu bayar.",
  },
  {
    title: "Rute ke kartu Kolo",
    body: "Kirim USDC ke kartu Kolo kamu, lalu bayar QRIS langsung lewat GoPay pakai kartu itu.",
  },
  {
    title: "Riwayat tercatat",
    body: "Setiap scan dan top up tersimpan rapi, gampang ditelusuri kapan saja.",
  },
];

export default function HomePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [balance, setBalance] = useState<{ usdcBalance: string; idrEstimate: string } | null>(null);

  useEffect(() => {
    async function loadHome() {
      const stored = window.localStorage.getItem("liber:userId");
      setUserId(stored);
      setChecked(true);
      if (!stored) return;

      try {
        const result = await getBalance(stored);
        setBalance(result);
      } catch {
        setBalance({ usdcBalance: "0.00", idrEstimate: "0" });
      }
    }
    loadHome();
  }, []);

  if (!checked) return null;

  if (!userId) {
    return (
      <PageShell>
        <p className="font-display text-lg italic text-emerald">Liber</p>
        <h1 className="mt-2 font-display text-3xl italic text-ink">
          Belanja QRIS langsung dari saldo USDC kamu.
        </h1>
        <p className="mt-3 text-sm text-ink/60">
          Non-custodial, mobile-first. Lihat dulu cara kerjanya di bawah, baru buat wallet kalau sudah yakin.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="flex flex-col gap-1">
              <p className="font-semibold text-ink">{feature.title}</p>
              <p className="text-sm text-ink/60">{feature.body}</p>
            </Card>
          ))}
        </div>

        <Link href="/onboarding" className="mt-6 block">
          <Button>Buat wallet</Button>
        </Link>
      </PageShell>
    );
  }

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
