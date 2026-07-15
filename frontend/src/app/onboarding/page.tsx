import { PageShell } from "@/components/ui/PageShell";
import { OnboardingForm } from "@/components/OnboardingForm";

export default function OnboardingPage() {
  return (
    <PageShell>
      <h1 className="font-display text-3xl leading-tight text-ink">
        Your money, <span className="italic text-emerald">borderless.</span>
      </h1>
      <p className="mt-2 text-sm text-ink/60">
        Get paid from anywhere, spend on any QRIS in Indonesia. One step to set up.
      </p>
      <div className="mt-6">
        <OnboardingForm />
      </div>
    </PageShell>
  );
}
