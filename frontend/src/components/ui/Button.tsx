import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-gold text-ink shadow-[0_12px_30px_-12px_rgba(231,163,58,0.65)]",
  secondary: "bg-emerald text-white shadow-[0_12px_30px_-12px_rgba(11,107,78,0.6)]",
  ghost: "border border-ink/15 bg-transparent text-ink",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`w-full rounded-full px-6 py-4 text-base font-semibold transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
