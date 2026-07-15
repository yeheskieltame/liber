import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl bg-white/90 p-5 shadow-[0_20px_45px_-25px_rgba(11,107,78,0.45)] ${className}`}>
      {children}
    </div>
  );
}
