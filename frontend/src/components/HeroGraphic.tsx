export function HeroGraphic({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 360 360" fill="none" className={className}>
      <circle cx="180" cy="180" r="170" fill="url(#hero-glow)" opacity="0.5" />

      {/* Phone scanning a QRIS code */}
      <rect x="34" y="52" width="148" height="252" rx="26" fill="#ffffff" stroke="#101e1a" strokeOpacity="0.08" strokeWidth="2" />
      <rect x="48" y="72" width="120" height="148" rx="14" fill="#063d2c" />
      {[
        [60, 84, 22, 22], [90, 84, 14, 14], [112, 84, 14, 22], [134, 84, 22, 14],
        [60, 112, 14, 30], [82, 118, 20, 20], [112, 114, 14, 14], [134, 106, 22, 30],
        [60, 150, 22, 14], [90, 146, 14, 22], [112, 150, 14, 14], [134, 146, 22, 22],
        [60, 172, 14, 14], [82, 176, 20, 14], [116, 172, 30, 14],
      ].map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} rx="3" fill="#2fd98a" opacity={i % 3 === 0 ? 1 : 0.75} />
      ))}
      <rect x="80" y="238" width="56" height="8" rx="4" fill="#101e1a" opacity="0.12" />
      <rect x="92" y="254" width="32" height="8" rx="4" fill="#101e1a" opacity="0.08" />

      {/* Flow arrow from phone to card */}
      <path
        d="M 178 150 Q 235 130 268 178"
        stroke="#0b6b4e"
        strokeWidth="3"
        strokeDasharray="2 10"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M 258 168 L 272 180 L 256 188" stroke="#0b6b4e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />

      {/* USDC token riding the flow */}
      <circle cx="222" cy="140" r="19" fill="#e7a33a" />
      <text x="222" y="146" textAnchor="middle" fontSize="17" fontWeight="700" fill="#101e1a" fontFamily="system-ui, sans-serif">
        $
      </text>

      {/* Kolo card */}
      <rect x="196" y="188" width="132" height="84" rx="16" fill="url(#card-gradient)" />
      <rect x="212" y="204" width="26" height="18" rx="4" fill="#e7a33a" opacity="0.9" />
      <rect x="212" y="240" width="66" height="7" rx="3.5" fill="#ffffff" opacity="0.55" />
      <rect x="212" y="252" width="40" height="7" rx="3.5" fill="#ffffff" opacity="0.3" />
      <path
        d="M 300 250 A 8 8 0 1 0 296 236"
        stroke="#2fd98a"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="296" cy="236" r="2.6" fill="#e7a33a" />

      <defs>
        <radialGradient id="hero-glow" cx="0.5" cy="0.4" r="0.6">
          <stop offset="0%" stopColor="#2fd98a" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#2fd98a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="card-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0b6b4e" />
          <stop offset="100%" stopColor="#063d2c" />
        </linearGradient>
      </defs>
    </svg>
  );
}
