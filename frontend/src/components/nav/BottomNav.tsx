"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, ScanIcon, ProfileIcon, HistoryIcon } from "@/components/icons";

const TABS = [
  { href: "/home", label: "Home", Icon: HomeIcon, center: false },
  { href: "/pay", label: "Scan", Icon: ScanIcon, center: true },
  { href: "/profile", label: "Profile", Icon: ProfileIcon, center: false },
  { href: "/history", label: "History", Icon: HistoryIcon, center: false },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center">
      <div className="relative mx-auto flex w-full max-w-[430px] items-end justify-around px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="absolute inset-x-0 bottom-0 -z-10 h-[76px] rounded-t-[28px] bg-white/95 shadow-[0_-15px_40px_-25px_rgba(11,107,78,0.35)] backdrop-blur" />
        {TABS.map(({ href, label, Icon, center }) => {
          const active = pathname === href;

          if (center) {
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className="relative -mt-9 flex flex-col items-center gap-1"
              >
                <span
                  className={`flex h-16 w-16 items-center justify-center rounded-full shadow-[0_16px_32px_-12px_rgba(231,163,58,0.75)] transition active:scale-[0.96] ${
                    active ? "bg-emerald-deep text-white" : "bg-gold text-ink"
                  }`}
                >
                  <Icon className="h-7 w-7" />
                </span>
                <span className={`text-[11px] font-semibold ${active ? "text-emerald-deep" : "text-ink/50"}`}>{label}</span>
              </Link>
            );
          }

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className="flex min-w-11 flex-col items-center gap-1 px-2 py-1 transition active:scale-[0.96]"
            >
              <Icon className={`h-6 w-6 ${active ? "text-emerald-deep" : "text-ink/40"}`} />
              <span className={`text-[11px] font-semibold ${active ? "text-emerald-deep" : "text-ink/40"}`}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
