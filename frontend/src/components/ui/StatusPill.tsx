const STYLES: Record<string, string> = {
  scan: "bg-ink/5 text-ink/60",
  topup: "bg-emerald/15 text-emerald-deep",
};

export function StatusPill({ state, label }: { state: string; label: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${STYLES[state] ?? STYLES.scan}`}>
      {label}
    </span>
  );
}
