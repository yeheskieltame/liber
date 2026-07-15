const STYLES: Record<string, string> = {
  scanned: "bg-ink/5 text-ink/60",
  quoted: "bg-ink/5 text-ink/60",
  approved: "bg-gold/15 text-[#8a5c14]",
  bridging: "bg-gold/15 text-[#8a5c14]",
  redeeming: "bg-gold/15 text-[#8a5c14]",
  completed: "bg-emerald/15 text-emerald-deep",
  failed: "bg-rose/15 text-rose",
};

export function StatusPill({ state, label }: { state: string; label: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${STYLES[state] ?? STYLES.scanned}`}>
      {label}
    </span>
  );
}
