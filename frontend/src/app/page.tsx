export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <div className="liber-mesh" aria-hidden="true" />
      <main className="relative z-10 flex flex-col items-center gap-6 text-center">
        <span className="rounded-full bg-emerald px-4 py-1 text-sm font-medium text-paper">
          Liber
        </span>
        <h1 className="font-display text-4xl italic text-emerald-deep sm:text-5xl">
          Sedekah, verified.
        </h1>
        <p className="max-w-md font-body text-base text-ink/80">
          Frontend scaffold is live. Design tokens (
          <span className="text-gold">gold</span>,{" "}
          <span className="text-emerald">emerald</span>) and fonts are wired
          up and ready for the next build steps.
        </p>
      </main>
    </div>
  );
}
