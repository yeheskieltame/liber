import type { ReactNode } from "react";

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-paper text-ink">
      <div className="liber-mesh" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-5 pb-28 pt-8">
        {children}
      </div>
    </div>
  );
}
