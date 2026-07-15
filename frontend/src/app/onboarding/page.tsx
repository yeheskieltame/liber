import Link from "next/link";
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
    </PageShell>
  );
}
