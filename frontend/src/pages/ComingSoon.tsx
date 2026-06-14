/**
 * Placeholder for routes that don't exist yet. Used inside the AppShell
 * so the sidebar nav is still visible — clicking a nav item shows the
 * "this section ships in week X" message instead of a broken page.
 */

export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="max-w-[1180px] mx-auto px-8 py-12">
      <div className="card p-10 text-center">
        <div className="text-[11px] uppercase tracking-wider text-accent font-mono mb-2">Coming soon</div>
        <h1 className="text-2xl font-semibold tracking-tight mb-2">{title}</h1>
        <p className="text-[13.5px] text-text-dim max-w-[460px] mx-auto">
          This section will be unlocked in a later hackathon week. The smart contracts are complete (78 unit tests passing) — frontend ships incrementally so each week's release is real, not a demo.
        </p>
      </div>
    </div>
  );
}
