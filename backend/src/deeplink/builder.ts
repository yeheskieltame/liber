// No e-wallet publicly supports "open scanner with this QR preloaded" — see
// spec 2026-07-15-liber-architecture-design.md §10.3. These are bare
// best-effort app-open links only; the user still re-scans qrContent
// themselves inside the app, which is the actual payment mechanism.
const APP_LINKS: Record<string, string | null> = {
  gopay: "gojek://gopay",
  dana: "dana://",
  ovo: "ovo://",
  other: null,
};

export function buildEwalletHandoff(
  provider: "gopay" | "dana" | "ovo" | "other",
  qrContent: string
): { appLink: string | null; qrContent: string } {
  return { appLink: APP_LINKS[provider] ?? null, qrContent };
}
