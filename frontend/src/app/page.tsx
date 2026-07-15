"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/ui/PageShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ScanIcon, ProfileIcon, HistoryIcon } from "@/components/icons";

const FEATURES = [
  { Icon: ScanIcon, title: "Scan & pay", body: "Scan any QRIS code and see the USDC price instantly." },
  { Icon: ProfileIcon, title: "Route to Kolo", body: "Send USDC to your Kolo card, then pay through GoPay." },
  { Icon: HistoryIcon, title: "Full history", body: "Every scan and top-up, logged and searchable." },
] as const;

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
    <PageShell>
      <p className="font-display text-lg italic text-emerald">Liber</p>
      <h1 className="mt-3 font-display text-4xl leading-tight text-ink">
        Spend QRIS <span className="italic text-emerald">straight from USDC.</span>
      </h1>
      <p className="mt-3 text-sm text-ink/60">
        A non-custodial Stellar wallet built for Indonesian QRIS, routed through your own Kolo card.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        {FEATURES.map(({ Icon, title, body }) => (
          <Card key={title} className="flex items-start gap-4">
            <Icon className="mt-0.5 h-6 w-6 shrink-0 text-emerald" />
            <div>
              <p className="font-semibold text-ink">{title}</p>
              <p className="text-sm text-ink/60">{body}</p>
            </div>
          </Card>
        ))}
      </div>

      <Link href="/onboarding" className="mt-8 block">
        <Button>Get Started</Button>
      </Link>
    </PageShell>
  );
}
