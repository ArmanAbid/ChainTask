

import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate, Link } from "react-router-dom";
import { useWallet as useWeldWallet } from "@ada-anvil/weld/react";
import { useWallet } from "@/hooks/useWallet";
import { useRole } from "@/hooks/useRole";
import { Icons } from "@/components/Icons";
import { formatAda, truncateAddress } from "@/lib/format";
import { env } from "@/config/env";
import type { Role } from "@/types/domain";

export default function AppShell() {
  const wallet = useWallet();
  const navigate = useNavigate();

  // Bounce disconnected users back to landing.
  useEffect(() => {
    if (wallet.status === "disconnected") navigate("/", { replace: true });
  }, [wallet.status, navigate]);

  return (
    <div className="grid grid-cols-[232px_1fr] grid-rows-[56px_1fr] h-screen bg-[radial-gradient(1200px_600px_at_15%_-10%,oklch(0.78_0.13_215/0.06),transparent_60%),radial-gradient(800px_500px_at_95%_5%,oklch(0.80_0.14_155/0.04),transparent_60%)]">
      <Topbar />
      <Sidebar />
      <main className="overflow-y-auto relative">
        <Outlet />
      </main>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Topbar
// ────────────────────────────────────────────────────────────────────────

function Topbar() {
  return (
    <header className="col-span-full flex items-center justify-between px-5 border-b border-border bg-[oklch(0.15_0.008_250/0.8)] backdrop-blur-md relative z-10">
      <Link to="/" className="w-[212px] flex items-center">
        <img src="/brand/logo.svg" alt="chain/task" className="h-6" />
      </Link>
      <div className="flex-1" />
      <WalletPill />
    </header>
  );
}

function WalletPill() {
  const wallet = useWallet();
  const weld = useWeldWallet("disconnect", "isConnected");
  const { role, setRole } = useRole();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  if (wallet.status !== "connected") return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-full bg-surface hover:border-border-strong text-text-dim hover:text-text transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span
          className={`w-[7px] h-[7px] rounded-full ${wallet.isCorrectNetwork
            ? "bg-success shadow-[0_0_0_3px_oklch(0.80_0.14_155/0.13)]"
            : "bg-warn shadow-[0_0_0_3px_oklch(0.85_0.13_78/0.13)]"
            }`}
          aria-hidden="true"
        />
        <span className="font-mono text-[11.5px]">{truncateAddress(wallet.address, 8, 5)}</span>
        <span className="pl-2 ml-2 border-l border-border flex items-center gap-1">
          <span className="text-accent">₳</span>
          <span className="font-mono text-[11.5px]">{wallet.balanceAda.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} className="fixed inset-0 z-[90]" aria-hidden="true" />
          <div role="menu" className="absolute top-[calc(100%+8px)] right-0 w-[300px] bg-surface border border-border rounded-md shadow-s2 z-[100] overflow-hidden">
            <div className="px-3.5 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="w-[7px] h-[7px] rounded-full bg-success" aria-hidden="true" />
                <span className="text-[12px] font-medium">{wallet.wallet} · connected</span>
              </div>
              <div className="font-mono text-[11px] text-text-faint mt-1.5 break-all">{wallet.address}</div>
              <div className="text-[11px] text-text-faint mt-1.5">
                Balance · <span className="text-text">{formatAda(wallet.balanceAda)}</span>
                <span className="mx-1.5">·</span>
                Network · <span className={wallet.isCorrectNetwork ? "text-text" : "text-warn"}>{env.network}</span>
              </div>
            </div>

            <div className="p-1.5">
              <div className="text-[10.5px] uppercase tracking-wider text-text-faint px-2 py-1.5">Acting as</div>
              {(["client", "builder", "arbitrator"] as const).map(r => (
                <button
                  key={r}
                  role="menuitem"
                  onClick={() => { setRole(r); setOpen(false); navigate("/app"); }}
                  className={`flex w-full items-center px-2.5 py-2 text-[12.5px] rounded-md hover:bg-surface-2 ${role === r ? "text-text" : "text-text-dim"}`}
                >
                  <span className="capitalize">{r}</span>
                  {role === r && <span className="ml-auto text-accent">✓</span>}
                </button>
              ))}
            </div>

            <div className="p-1.5 border-t border-border">
              <button
                role="menuitem"
                onClick={async () => { await weld.disconnect(); setOpen(false); }}
                className="flex w-full items-center px-2.5 py-2 text-[12.5px] rounded-md hover:bg-surface-2 text-text-dim"
              >
                Disconnect
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Sidebar
// ────────────────────────────────────────────────────────────────────────

function Sidebar() {
  const { role } = useRole();
  return (
    <aside className="border-r border-border bg-[oklch(0.15_0.008_250/0.6)] backdrop-blur-md p-1.5 flex flex-col overflow-y-auto">
      <SidebarNav role={role} />
    </aside>
  );
}

function SidebarNav({ role }: { role: Role }) {
  return (
    <>
      <Label>Overview</Label>
      <Item to="/app" exact icon={<Icons.grid className="w-4 h-4" />} label="Dashboard" />

      {role === "client" && (
        <>
          <Label>Client</Label>
          <Item to="/app/post" icon={<Icons.plus className="w-4 h-4" />} label="Post a job" />
          <Item to="/app/jobs" icon={<Icons.briefcase className="w-4 h-4" />} label="My jobs" />
        </>
      )}

      {role === "builder" && (
        <>
          <Label>Builder</Label>
          <Item to="/app/marketplace" icon={<Icons.search className="w-4 h-4" />} label="Marketplace" />
          <Item to="/app/work" icon={<Icons.briefcase className="w-4 h-4" />} label="My work" />
        </>
      )}

      {role === "arbitrator" && (
        <>
          <Label>Arbitrator</Label>
          <Item to="/app/queue" icon={<Icons.flag className="w-4 h-4" />} label="Dispute queue" />
        </>
      )}

      <Label>Account</Label>
      <Item to="/app/profile" icon={<Icons.user className="w-4 h-4" />} label="Profile" />
      <Item to="/app/wallet" icon={<Icons.wallet className="w-4 h-4" />} label="Wallet" />
      <Item to="/app/settings" icon={<Icons.settings className="w-4 h-4" />} label="Settings" />
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] uppercase tracking-wider text-text-faint px-2.5 pt-3.5 pb-1.5">{children}</div>;
}

function Item({ to, icon, label, exact }: { to: string; icon: React.ReactNode; label: string; exact?: boolean }) {
  return (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13.5px] font-normal border transition-colors ${isActive ? "bg-surface text-text border-border shadow-s1" : "bg-transparent text-text-dim border-transparent hover:bg-surface hover:text-text"
        }`
      }
    >
      <span className="text-text-dim">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}
