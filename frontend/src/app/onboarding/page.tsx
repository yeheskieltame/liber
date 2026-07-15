import Link from "next/link";
import Image from "next/image";
import { PageShell } from "@/components/ui/PageShell";
import { OnboardingForm } from "@/components/OnboardingForm";
import { Logo } from "@/components/Logo";

const TRUST = ["Non-custodial", "Built on Stellar"] as const;

export default function OnboardingPage() {
  return (
    <PageShell>
      <Link href="/" className="inline-flex">
        <Logo className="h-10 w-10" />
      </Link>

      <div className="mt-5 flex items-center gap-4">
        <div className="w-24 shrink-0 overflow-hidden rounded-2xl border-[3px] border-ink shadow-[5px_5px_0_rgba(16,30,26,0.85)]">
          <Image src="/illustrations/mascot-guide.jpg" alt="Liber's mascot waving hello" width={200} height={200} className="h-auto w-full" />
        </div>
        <p className="font-display text-lg italic text-ink/70">Hey, I&apos;m here to help you get set up.</p>
      </div>

      <h1 className="mt-5 font-display text-3xl leading-tight text-ink">
        Your money, <span className="italic text-emerald">borderless.</span>
      </h1>
      <p className="mt-2 text-sm text-ink/60">
        Get paid from anywhere, spend on any QRIS in Indonesia. One step to set up.
      </p>
      <div className="mt-6">
        <OnboardingForm />
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {TRUST.map((label) => (
          <span key={label} className="rounded-full border border-ink/10 bg-white/60 px-3 py-1.5 text-xs font-semibold text-ink/50">
            {label}
          </span>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-ink/40">
        By creating a wallet, you agree to Liber&apos;s{" "}
        <Link href="/terms" className="underline underline-offset-4">
          Terms &amp; Conditions
        </Link>
        .
      </p>
    </PageShell>
  );
}
