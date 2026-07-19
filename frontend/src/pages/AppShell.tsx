// AppShell - sidebar + main content. Desktop keeps the sidebar visible;
// mobile collapses it to a drawer behind the hamburger.

import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate, useLocation, Link } from "react-router-dom";
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
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  // Bounce disconnected users back to landing.
  useEffect(() => {
    if (wallet.status === "disconnected") navigate("/", { replace: true });
  }, [wallet.status, navigate]);

  // Close the mobile drawer on route change.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[232px_1fr] grid-rows-[56px_1fr] h-screen bg-[radial-gradient(1200px_600px_at_15%_-10%,oklch(0.78_0.13_215/0.06),transparent_60%),radial-gradient(800px_500px_at_95%_5%,oklch(0.80_0.14_155/0.04),transparent_60%)]">
      <Topbar onMenuClick={() => setNavOpen((v) => !v)} navOpen={navOpen} />
      <Sidebar mobileOpen={navOpen} onClose={() => setNavOpen(false)} />
      <main className="overflow-y-auto relative">
        <Outlet />
      </main>
    </div>
  );
}

// Topbar

function Topbar({ onMenuClick, navOpen }: { onMenuClick: () => void; navOpen: boolean }) {
  return (
    <header className="col-span-full flex items-center gap-3 px-4 md:px-5 border-b border-border bg-[oklch(0.15_0.008_250/0.8)] backdrop-blur-md relative z-30">
      <button
        type="button"
        className="md:hidden inline-flex items-center justify-center w-9 h-9 -ml-1 rounded-md hover:bg-surface text-text-dim"
        onClick={onMenuClick}
        aria-label={navOpen ? "Close menu" : "Open menu"}
      >
        {navOpen ? <Icons.x className="w-4 h-4" /> : <Hamburger />}
      </button>
      <Link to="/" className="md:w-[212px] flex items-center">
        <img src="/brand/logo.svg" alt="chain/task" className="h-6" />
      </Link>
      <div className="flex-1" />
      <WalletPill />
    </header>
  );
}

function Hamburger() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-4 h-4">
      <path d="M2 4h12M2 8h12M2 12h12" />
    </svg>
  );
}

function WalletPill() {
  const wallet = useWallet();
  const weld = useWeldWallet("disconnect", "isConnected");
  const { role, setRole } = useRole();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Close dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-wallet-pill]")) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  if (wallet.status !== "connected") {
    return <span className="text-[12px] text-text-faint">Not connected</span>;
  }

  // Arbitrator role is only visible to wallets whose address appears in
  // VITE_ARBITRATOR_ADDRESSES. Everyone else sees Client / Builder only.
  const isTeamArbitrator = env.arbitratorAddresses.includes(wallet.address);
  const availableRoles: Role[] = isTeamArbitrator
    ? ["client", "builder", "arbitrator"]
    : ["client", "builder"];

  // If the user was persisted as arbitrator but no longer qualifies
  // (e.g. reconnected as a different wallet), silently reset the role.
  if (!availableRoles.includes(role)) {
    setRole("client");
  }

  return (
    <div className="relative" data-wallet-pill>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12.5px] border border-border bg-surface hover:bg-surface-2 text-text"
      >
        <span className="font-mono">{truncateAddress(wallet.address, 6, 4)}</span>
        <span className="text-text-faint">·</span>
        <span className="font-mono">₳{formatAda(wallet.balanceAda)}</span>
        <Icons.chevR className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <>
          <div className="absolute right-0 top-[calc(100%+6px)] w-[240px] rounded-lg border border-border bg-surface shadow-s2 z-40">
            <div className="p-3 border-b border-border">
              <div className="text-[10.5px] uppercase tracking-wider text-text-faint mb-1">Connected</div>
              <div className="text-[12px] text-text font-mono break-all">{truncateAddress(wallet.address, 12, 6)}</div>
              <div className="text-[11px] text-text-faint mt-1">{wallet.wallet} · {env.network}</div>
            </div>
            <div className="p-1.5 border-b border-border">
              <div className="text-[10.5px] uppercase tracking-wider text-text-faint px-2 py-1">View as</div>
              {availableRoles.map((r) => (
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
            <div className="p-1.5">
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

// Sidebar

function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const { role } = useRole();
  return (
    <>
      {/* Backdrop (mobile) */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-bg/70 backdrop-blur-sm z-20"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-30 w-[232px] md:w-auto bg-[oklch(0.15_0.008_250/0.95)] md:bg-[oklch(0.15_0.008_250/0.6)] backdrop-blur-md border-r border-border p-1.5 flex flex-col overflow-y-auto transition-transform md:transition-none ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          }`}
      >
        {/* Spacer for topbar height on mobile (since fixed positioning) */}
        <div className="h-[56px] md:hidden" />
        <SidebarNav role={role} />
      </aside>
    </>
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
          <Item to="/app/marketplace" icon={<Icons.search className="w-4 h-4" />} label="Browse marketplace" />
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