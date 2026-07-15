"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Logo } from "@/components/Logo";
import { ScanIcon, ProfileIcon, HistoryIcon } from "@/components/icons";

const STEPS = [
  {
    Icon: ScanIcon,
    title: "Scan",
    body: "Point your camera at any QRIS code. Liber reads the merchant and amount, and quotes the equivalent in USDC instantly.",
  },
  {
    Icon: ProfileIcon,
    title: "Route to Kolo",
    body: "Send that USDC to your own Kolo card over Stellar. It lands in seconds, no bridging, no bank in the middle.",
  },
  {
    Icon: HistoryIcon,
    title: "Pay in GoPay",
    body: "Open GoPay, scan the same code, and pay with your linked Kolo card. Liber never touches the payment, you're always in control.",
  },
] as const;

const TRUST = ["Non-custodial", "Built on Stellar", "Works with any QRIS merchant"] as const;

const USER_ID_KEY = "liber:userId";

export default function LandingPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(USER_ID_KEY)) {
      router.replace("/home");
    } else {
      setChecked(true);
    }
  }, [router]);

  if (!checked) return null;

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-paper text-ink">
      <div className="liber-mesh" />

      <div className="relative mx-auto flex max-w-5xl flex-col px-6 py-8 md:px-12 md:py-12">
        <header className="fade-up flex items-center gap-2.5">
          <Logo className="h-8 w-8" />
          <span className="font-display text-lg italic text-emerald">Liber</span>
        </header>

        <section className="mt-12 flex flex-col items-center gap-10 md:mt-20 md:flex-row md:items-center md:gap-16">
          <div className="max-w-xl text-center md:text-left">
            <h1 className="fade-up font-display text-4xl leading-tight text-ink md:text-6xl" style={{ animationDelay: "80ms" }}>
              Spend QRIS <span className="italic text-emerald">straight from USDC.</span>
            </h1>
            <p className="fade-up mt-5 text-base text-ink/60 md:text-lg" style={{ animationDelay: "160ms" }}>
              A non-custodial Stellar wallet for Indonesia. Scan any QRIS merchant, see the live USDC price, and
              settle instantly through your own Kolo card, no bank transfer, no manual steps.
            </p>
            <div className="fade-up mt-8 flex flex-col items-center gap-3 md:items-start" style={{ animationDelay: "240ms" }}>
              <Link
                href="/onboarding"
                className="rounded-full bg-gold px-8 py-4 text-base font-semibold text-ink shadow-[0_12px_30px_-12px_rgba(231,163,58,0.65)] transition active:scale-[0.98]"
              >
                Get Started
              </Link>
              <p className="text-xs text-ink/40">Takes about a minute. No bank account needed.</p>
            </div>
          </div>

          <div
            className="fade-up w-full max-w-[320px] shrink-0 overflow-hidden rounded-[28px] border-4 border-ink shadow-[10px_10px_0_rgba(16,30,26,0.85)] md:max-w-[380px]"
            style={{ animationDelay: "320ms" }}
          >
            <Image src="/illustrations/hero-success.jpg" alt="A vendor paying with QRIS through Liber" width={760} height={760} className="h-auto w-full" priority />
          </div>
        </section>

        <section className="mt-20 md:mt-28">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 text-center md:flex-row md:text-left">
            <div className="w-full max-w-[240px] shrink-0 overflow-hidden rounded-[24px] border-4 border-ink shadow-[8px_8px_0_rgba(16,30,26,0.85)]">
              <Image src="/illustrations/problem-hook.jpg" alt="Crypto stuck behind a wall, unable to reach a coffee shop" width={600} height={600} className="h-auto w-full" />
            </div>
            <div>
              <h2 className="font-display text-2xl italic text-ink md:text-3xl">The wall crypto hits every day.</h2>
              <p className="mt-3 text-sm text-ink/60 md:text-base">
                Your USDC is real money, but no QRIS merchant takes it directly. Selling it on an exchange, waiting
                for a bank transfer, then spending rupiah turns a coffee into a multi-day errand. Liber skips that
                entirely.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-24 md:mt-32">
          <h2 className="text-center font-display text-2xl italic text-ink md:text-3xl">How it works</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3 md:gap-8">
            {STEPS.map(({ Icon, title, body }, i) => (
              <div key={title} className="relative rounded-3xl bg-white/90 p-6 shadow-[0_20px_45px_-25px_rgba(11,107,78,0.45)]">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald/10 text-emerald">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-display text-sm italic text-ink/40">0{i + 1}</span>
                </div>
                <p className="mt-4 font-semibold text-ink">{title}</p>
                <p className="mt-2 text-sm text-ink/60">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 flex flex-wrap items-center justify-center gap-3 md:mt-20">
          {TRUST.map((label) => (
            <span key={label} className="rounded-full border border-ink/10 bg-white/60 px-4 py-2 text-xs font-semibold text-ink/60">
              {label}
            </span>
          ))}
        </section>

        <section className="mt-16 flex flex-col items-center gap-4 rounded-[32px] bg-emerald-deep px-8 py-12 text-center text-white md:mt-20">
          <p className="font-display text-2xl italic md:text-3xl">Your money, borderless.</p>
          <p className="max-w-md text-sm text-white/70">
            Create your wallet in about a minute and start paying QRIS merchants with USDC today.
          </p>
          <Link
            href="/onboarding"
            className="mt-2 rounded-full bg-gold px-8 py-4 text-base font-semibold text-ink shadow-[0_12px_30px_-12px_rgba(231,163,58,0.65)] transition active:scale-[0.98]"
          >
            Get Started
          </Link>
        </section>

        <footer className="mt-16 flex flex-col items-center gap-2 pb-8 text-center">
          <Logo className="h-6 w-6" />
          <p className="text-xs text-ink/40">Built for the APAC Stellar Hackathon 2026.</p>
        </footer>
      </div>
    </div>
  );
}
