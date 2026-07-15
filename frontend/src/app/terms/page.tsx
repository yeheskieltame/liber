import Link from "next/link";
import { PageShell } from "@/components/ui/PageShell";

const SECTIONS = [
  {
    title: "1. Non-custodial wallet",
    body: "Liber generates a Stellar keypair on your own device and never stores or has access to your secret key. You are solely responsible for backing it up (Settings > Backup & Recovery). If you lose your device without a backup, Liber cannot recover your funds; nobody can.",
  },
  {
    title: "2. What Liber does and does not do",
    body: "Liber quotes a USDC price for a scanned QRIS code and helps you send USDC, over Stellar, to your own Kolo card address. Liber never holds your funds and never executes the QRIS payment itself. The payment happens inside GoPay or DANA, using your own linked Kolo card, entirely outside Liber's systems.",
  },
  {
    title: "3. Third-party services",
    body: "Kolo, GoPay, and DANA are independent services not operated by Liber. Their availability, fees, limits, and terms are their own. Liber is not responsible for how they process a payment once you leave the app.",
  },
  {
    title: "4. No financial advice",
    body: "Nothing in Liber is investment, tax, or financial advice. USDC prices and exchange rates are estimates at the time of the quote and can change before you complete a payment elsewhere.",
  },
  {
    title: "5. Beta software",
    body: "Liber was built for a hackathon and is provided as is, without warranty of any kind. Use small amounts while you get familiar with it.",
  },
  {
    title: "6. Your responsibility",
    body: "You are responsible for the accuracy of any address you enter (including your Kolo address), for keeping your secret key private, and for complying with any laws that apply to you.",
  },
];

export default function TermsPage() {
  return (
    <PageShell>
      <h1 className="font-display text-2xl italic text-ink">Terms &amp; Conditions</h1>
      <p className="mt-2 text-sm text-ink/50">Last updated 2026.</p>

      <div className="mt-6 flex flex-col gap-5">
        {SECTIONS.map((s) => (
          <div key={s.title}>
            <p className="font-semibold text-ink">{s.title}</p>
            <p className="mt-1 text-sm text-ink/60">{s.body}</p>
          </div>
        ))}
      </div>

      <Link href="/" className="mt-8 block text-center text-sm text-emerald underline underline-offset-4">
        Back to Liber
      </Link>
    </PageShell>
  );
}
