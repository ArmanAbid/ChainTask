import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchPeople, PEOPLE, SAMPLE_JOBS } from "../data/seed";
import { Avatar } from "../components/atoms";
import { Icons } from "../components/Icons";

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const people = q ? searchPeople(q) : Object.values(PEOPLE).slice(0, 5);
  const jobs = q
    ? SAMPLE_JOBS.filter(j => j.title.toLowerCase().includes(q.toLowerCase()) || j.skills.some(s => s.toLowerCase().includes(q.toLowerCase()))).slice(0, 4)
    : SAMPLE_JOBS.slice(0, 3);

  const rows: any[] = [
    ...people.map(p => ({ kind: "person", data: p })),
    ...jobs.map(j => ({ kind: "job", data: j })),
  ];

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => Math.min(s + 1, rows.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
      if (e.key === "Enter")     {
        e.preventDefault();
        const r = rows[sel]; if (!r) return;
        if (r.kind === "person") navigate(`/app/person/${r.data.handle}`);
        else navigate(`/app/jobs/${r.data.id}`);
        onClose();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, rows, sel, navigate, onClose]);

  if (!open) return null;
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-start justify-center pt-[90px] p-6 bg-[oklch(0.10_0.01_250/0.65)] backdrop-blur-sm">
      <div onClick={e => e.stopPropagation()} className="w-full max-w-[600px] bg-surface border border-border rounded-lg shadow-s2 overflow-hidden max-h-[540px] flex flex-col animate-fade-up">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <Icons.search className="w-4 h-4 text-text-faint" />
          <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setSel(0); }}
                 placeholder="Search builders, clients, jobs, skills, addresses…"
                 className="flex-1 bg-transparent border-0 outline-none text-[15px] font-medium text-text placeholder:text-text-faint" />
          <kbd className="kbd">esc</kbd>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5">
          {people.length > 0 && (
            <div>
              <div className="text-[10.5px] uppercase tracking-wider text-text-faint px-2.5 py-2 pb-1.5">{q ? "People" : "Suggested"}</div>
              {people.map((p, i) => {
                const idx = i;
                const isSel = sel === idx;
                return (
                  <button key={p.handle} onMouseEnter={() => setSel(idx)}
                          onClick={() => { navigate(`/app/person/${p.handle}`); onClose(); }}
                          className={`flex items-center gap-3 w-full text-left p-2.5 rounded-md ${isSel ? "bg-surface-2" : "hover:bg-surface-2"}`}>
                    <Avatar name={p.avatar} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium text-[13.5px]">{p.name}</span>
                        <span className="font-mono text-[11px] text-text-faint">@{p.handle}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-text-faint mt-0.5 font-mono">
                        {(p.builder?.jobs ?? 0) > 0 && <span className="text-success">{p.builder!.jobs}b</span>}
                        {(p.client?.jobs ?? 0) > 0 && <span className="text-accent">{p.client!.jobs}c</span>}
                        <span className="opacity-50">·</span>
                        <span>{p.addr.slice(0, 12)}…</span>
                      </div>
                    </div>
                    {isSel && <span className="font-mono text-[11px] text-text-faint">↵</span>}
                  </button>
                );
              })}
            </div>
          )}
          {jobs.length > 0 && (
            <div className="mt-2">
              <div className="text-[10.5px] uppercase tracking-wider text-text-faint px-2.5 py-2 pb-1.5">{q ? "Jobs" : "Trending"}</div>
              {jobs.map((j, i) => {
                const idx = people.length + i;
                const isSel = sel === idx;
                return (
                  <button key={j.id} onMouseEnter={() => setSel(idx)}
                          onClick={() => { navigate(`/app/jobs/${j.id}`); onClose(); }}
                          className={`flex items-center gap-3 w-full text-left p-2.5 rounded-md ${isSel ? "bg-surface-2" : "hover:bg-surface-2"}`}>
                    <span className="w-8 h-8 rounded-md bg-surface-2 border border-border inline-flex items-center justify-center text-text-faint flex-shrink-0">
                      <Icons.briefcase className="w-4 h-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[13.5px] truncate">{j.title}</div>
                      <div className="flex items-center gap-2 text-[11px] text-text-faint mt-0.5">
                        <span>{j.category}</span>
                        <span className="opacity-50">·</span>
                        <span className="ada font-mono">{j.budget.toLocaleString()}</span>
                      </div>
                    </div>
                    {isSel && <span className="font-mono text-[11px] text-text-faint">↵</span>}
                  </button>
                );
              })}
            </div>
          )}
          {rows.length === 0 && <div className="text-center py-8 text-[13px] text-text-dim">No matches.</div>}
        </div>

        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-border bg-bg-2">
          <span className="text-[11px] text-text-faint inline-flex items-center gap-1"><kbd className="kbd">↑↓</kbd> navigate</span>
          <span className="text-[11px] text-text-faint inline-flex items-center gap-1"><kbd className="kbd">↵</kbd> open</span>
          <span className="text-[11px] text-text-faint inline-flex items-center gap-1"><kbd className="kbd">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

export function TopbarSearchButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="flex items-center gap-2 bg-bg-2 border border-border hover:border-border-strong hover:bg-surface rounded-full pl-3 pr-2.5 py-1.5 w-[260px] text-[12.5px] text-text-faint hover:text-text-dim transition-colors">
      <Icons.search className="w-3.5 h-3.5" />
      <span>Search builders, clients, jobs…</span>
      <span className="flex-1" />
      <span className="kbd">⌘K</span>
    </button>
  );
}
