export function GradientBalanceCard({
  usdcBalance,
  idrEstimate,
}: {
  usdcBalance: string;
  idrEstimate: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-emerald-deep via-emerald to-emerald-bright p-6 text-white shadow-[0_25px_50px_-20px_rgba(6,61,44,0.55)]">
      <div className="absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
      <p className="font-display text-sm italic text-white/70">Your balance</p>
      <p className="mt-2 font-body text-4xl font-semibold tabular-nums">
        {usdcBalance} <span className="text-lg font-normal text-white/70">USDC</span>
      </p>
      <p className="mt-1 text-sm text-white/70 tabular-nums">≈ Rp {Number(idrEstimate).toLocaleString("en-US")}</p>
    </div>
  );
}
