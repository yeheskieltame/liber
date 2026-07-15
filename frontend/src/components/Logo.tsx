export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <rect width="64" height="64" rx="16" fill="#063d2c" />
      <path d="M 44 20 A 17 17 0 1 0 47 40" fill="none" stroke="#2fd98a" strokeWidth="6" strokeLinecap="round" />
      <circle cx="47" cy="40" r="6" fill="#e7a33a" />
    </svg>
  );
}
