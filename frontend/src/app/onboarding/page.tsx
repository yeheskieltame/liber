import { PageShell } from "@/components/ui/PageShell";
import { OnboardingForm } from "@/components/OnboardingForm";

export default function OnboardingPage() {
  return (
    <PageShell>
      <h1 className="font-display text-3xl leading-tight text-ink">
        Uangmu, <span className="italic text-emerald">bebas berpindah.</span>
      </h1>
      <p className="mt-2 text-sm text-ink/60">
        Terima gaji dari mana saja, bayar QRIS apa saja di Indonesia. Buat akun dalam satu langkah.
      </p>
      <div className="mt-6">
        <OnboardingForm />
      </div>
    </PageShell>
  );
}
