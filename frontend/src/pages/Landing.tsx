import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useExtensions, useWallet as useWeldWallet } from "@ada-anvil/weld/react";
import { env } from "@/config/env";
import { PROTOCOL_PARAMS } from "@/config/protocol";
import { useWallet } from "@/hooks/useWallet";
import { Icons } from "@/components/Icons";
import { Reveal } from "@/components/Reveal";

/**
 * Landing page.
 *
 * Marketing content. All numbers come from PROTOCOL_PARAMS, which mirror
 * the GlobalConfig the protocol will deploy with. Connect Wallet uses the
 * real CIP-30 multi-wallet picker - clicking actually connects.
 */
export default function Landing() {
  const [showWallets, setShowWallets] = useState(false);
  const navigate = useNavigate();
  const wallet = useWallet();

  const isConnected = wallet.status === "connected";

  // After successful connect, navigate to /app.
  const onConnected = () => {
    setShowWallets(false);
    navigate("/app");
  };

  return (
    <div className="overflow-x-hidden bg-[radial-gradient(1400px_700px_at_20%_-10%,oklch(0.78_0.13_215/0.08),transparent_60%),radial-gradient(900px_600px_at_95%_5%,oklch(0.80_0.14_155/0.04),transparent_60%)]">
      {/* Nav */}
      <header className="max-w-[1200px] mx-auto px-9 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center">
          <img src="/brand/logo.svg" alt="chain/task" className="h-7" />
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-[13px]">
          <a href="#how" className="text-text-dim hover:text-text">How it works</a>
          <a href="#fees" className="text-text-dim hover:text-text">Fees</a>
          <a href="#security" className="text-text-dim hover:text-text">Security</a>
          <a href="#faq" className="text-text-dim hover:text-text">FAQ</a>
        </nav>
        {isConnected ? (
          <Link to="/app" className="btn btn-primary">Open app</Link>
        ) : (
          <button className="btn btn-primary" onClick={() => setShowWallets(true)}>
            Connect wallet
          </button>
        )}
      </header>

      {/* Hero */}
      <section className="max-w-[1200px] mx-auto px-9 pt-16 pb-12 lg:pt-24 lg:pb-20 grid lg:grid-cols-[1.05fr_0.95fr] gap-16 items-center relative">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 grid-bg" style={{ maskImage: "radial-gradient(60% 60% at 30% 30%, #000, transparent 75%)" }} />
        </div>

        <div className="relative z-10 animate-fade-in">
          <h1 className="text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05] mb-5 text-balance animate-fade-up" style={{ animationDelay: "60ms" }}>
            <span>Freelance, <em className="italic font-serif font-normal tracking-tight">settled</em></span><br />
            <span className="text-accent"> by code.</span>
          </h1>
          <p className="text-[17px] leading-relaxed text-text-dim max-w-[540px] animate-fade-up" style={{ animationDelay: "200ms" }}>
            A trustless escrow marketplace on Cardano. Lock ADA in a smart contract, pay builders automatically when work is delivered.
          </p>
          <div className="flex items-center gap-2.5 mt-7 animate-fade-up" style={{ animationDelay: "340ms" }}>
            {isConnected ? (
              <Link to="/app" className="btn btn-accent btn-lg">
                <Icons.wallet className="w-4 h-4" /> Open app
              </Link>
            ) : (
              <button className="btn btn-accent btn-lg" onClick={() => setShowWallets(true)}>
                <Icons.wallet className="w-4 h-4" /> Connect wallet
              </button>
            )}
            <a className="btn btn-lg" href="#how">See how it works <Icons.arrR className="w-3.5 h-3.5 ml-1" /></a>
          </div>
        </div>

        <div className="relative animate-fade-up" style={{ animationDelay: "480ms" }}>
          <div className="relative p-5 rounded-lg border border-border bg-surface shadow-s2 overflow-hidden">
            <div className="absolute inset-0 grid-bg pointer-events-none" />
            <div className="relative z-10 mb-4">
              <div className="text-[11px] uppercase tracking-wider text-text-faint">Escrow vault — preview</div>
              <div className="mt-1 font-mono text-2xl font-semibold">
                <span className="text-accent">₳</span> <span>{PROTOCOL_PARAMS.minJob}</span><span className="text-text-faint text-[13px] font-normal"> minimum</span>
              </div>
            </div>
            <div className="relative z-10 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-3">
              <VaultNode label="Client" who="locks ADA" icon={<Icons.wallet className="w-4 h-4" />} />
              <div className="vault-line active w-full" />
              <VaultNode label="Escrow" who="escrow.ak" icon={<Icons.lock className="w-5 h-5" />} accent locked />
              <div className="vault-line w-full" />
              <VaultNode label="Builder" who="receives" icon={<Icons.user className="w-4 h-4" />} dim />
            </div>
            <div className="relative z-10 mt-3.5 text-[11.5px] text-text-faint text-center">
              Released to the builder on approval. Or refunded · disputed · auto-claimed.
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <Reveal as="section" id="how" className="max-w-[1200px] mx-auto px-9 py-16">
        <div className="mb-10 max-w-[720px]">
          <span className="font-mono text-[11.5px] uppercase tracking-wider text-accent">How it works</span>
          <h2 className="text-[36px] tracking-tight leading-tight mt-2 text-balance">From posting to payout — four signed transactions.</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { n: "01", t: "Post a job", s: `Client describes the scope, sets a budget (min ₳${PROTOCOL_PARAMS.minJob}), and locks the ADA in escrow.`, i: <Icons.plus className="w-4 h-4" /> },
            { n: "02", t: "Builder applies", s: "Anyone with a Cardano wallet submits a proposal with bid + timeline. Client picks one.", i: <Icons.send className="w-4 h-4" /> },
            { n: "03", t: "Funds lock in escrow", s: "Client signs Select. ADA enters Plutus V3 validator. Nobody — including us — can move it.", i: <Icons.lock className="w-4 h-4" /> },
            { n: "04", t: "Builder ships, funds release", s: `Builder pins delivery to IPFS, marks Submitted. Client approves → ${100 - PROTOCOL_PARAMS.platformCutPercent}% to builder, ${PROTOCOL_PARAMS.platformCutPercent}% to treasury.`, i: <Icons.unlock className="w-4 h-4" /> },
          ].map((s) => (
            <div key={s.n} className="card p-5 hover:border-border-strong hover:-translate-y-0.5 transition-all">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-[11px] text-text-faint px-2 py-px border border-border rounded-full bg-bg-2">{s.n}</span>
                <span className="text-accent">{s.i}</span>
              </div>
              <h3 className="text-[15px] mb-2">{s.t}</h3>
              <p className="text-[13px] text-text-dim leading-relaxed">{s.s}</p>
            </div>
          ))}
        </div>
      </Reveal>

      {/* Fees */}
      <Reveal as="section" id="fees" className="max-w-[1200px] mx-auto px-9 py-16">
        <div className="mb-10 max-w-[720px]">
          <span className="font-mono text-[11.5px] uppercase tracking-wider text-accent">Fees</span>
          <h2 className="text-[36px] tracking-tight leading-tight mt-2">Transparent. Set on-chain by the Global Config.</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { num: `₳${PROTOCOL_PARAMS.minJob}`, name: "Min job", sub: "Enforced by validator." },
            { num: `${PROTOCOL_PARAMS.platformCutPercent}%`, name: "Platform cut", sub: "Taken from escrow on Release." },
            { num: `₳${PROTOCOL_PARAMS.disputeFee}`, name: "Dispute fee", sub: "Paid to treasury when a dispute is filed." },
          ].map(f => (
            <div key={f.name} className="card p-6 hover:border-border-strong transition-colors">
              <div className="font-mono text-[30px] font-semibold tracking-tight">{f.num}</div>
              <div className="text-[14px] font-medium mt-2.5">{f.name}</div>
              <div className="text-[12px] text-text-faint mt-0.5">{f.sub}</div>
            </div>
          ))}
        </div>
      </Reveal>

      {/* Security */}
      <section id="security" className="bg-surface border-y border-border py-16">
        <Reveal className="max-w-[1200px] mx-auto px-9">
          <div className="mb-10 max-w-[720px]">
            <span className="font-mono text-[11.5px] uppercase tracking-wider text-accent">Security</span>
            <h2 className="text-[36px] tracking-tight leading-tight mt-2">One validator. Three timeouts. Public datums.</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { ico: <Icons.lock className="w-[18px] h-[18px]" />, t: "Plutus V3 escrow", d: "Single validator (escrow.ak) holds every UTxO. Open-source and verifiable.", meta: "78 unit tests passing" },
              { ico: <Icons.clock className="w-[18px] h-[18px]" />, t: "Timeouts everywhere", d: `Auto-refund ${PROTOCOL_PARAMS.autoRefundDays}d if no submission. Auto-claim ${PROTOCOL_PARAMS.autoReleaseDays}d if no review.` },
              { ico: <Icons.flag className="w-[18px] h-[18px]" />, t: "Team-run arbitration", d: "Disputes reviewed under 2-of-3 multisig. Either party plus a team signer unlocks the escrow." },
              { ico: <Icons.paper className="w-[18px] h-[18px]" />, t: "IPFS deliverables", d: "Scope and submissions pinned to IPFS. Only the CID lives on-chain." },
            ].map((c) => (
              <div key={c.t} className="bg-bg-2 border border-border rounded-lg p-5 hover:border-border-strong hover:-translate-y-0.5 transition-all">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-[10px] bg-accent-soft border border-accent-line text-accent mb-3.5">{c.ico}</span>
                <h3 className="text-[14.5px] mb-1.5">{c.t}</h3>
                <p className="text-[13px] text-text-dim leading-relaxed m-0">{c.d}</p>
                {c.meta && <div className="mt-3 font-mono text-[11px] text-text-faint break-all">{c.meta}</div>}
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <Reveal as="section" id="faq" className="max-w-[1200px] mx-auto px-9 py-16">
        <div className="mb-10 max-w-[720px]">
          <span className="font-mono text-[11.5px] uppercase tracking-wider text-accent">FAQ</span>
          <h2 className="text-[36px] tracking-tight leading-tight mt-2">Common questions.</h2>
        </div>
        <div className="flex flex-col gap-2">
          {[
            { q: "Do I need a Cardano wallet?", a: "Yes. Any CIP-30 wallet works — Lace, Eternl, Nami, Vespr, Yoroi, Typhon, and more. There is no email or password — your wallet is your account." },
            { q: "What if the builder disappears?", a: `After ${PROTOCOL_PARAMS.autoRefundDays} days without a submission you can sign Auto-Refund. The validator returns your ADA without the builder's signature.` },
            { q: "What if the client disappears after I submit?", a: `After ${PROTOCOL_PARAMS.autoReleaseDays} days you can sign Auto-Release. The validator releases the funds without the client's signature.` },
            { q: "Can ChainTask move my funds?", a: "No. There is no admin key on the escrow. We cannot release, refund, or freeze your UTxO. The validator code is the rule." },
            { q: "How are arbitrators chosen?", a: "The ChainTask team currently handles arbitration. Disputes resolve under 2-of-3 multisig — either party plus a team signer unlocks the escrow. Decentralized arbitration is on the roadmap." },
          ].map(f => <FaqItem key={f.q} q={f.q} a={f.a} />)}
        </div>
      </Reveal>

      {/* CTA */}
      <Reveal as="section" className="max-w-[880px] mx-auto px-9 py-20 text-center">
        <h2 className="text-[44px] tracking-tight">Ready when you are.</h2>
        <p className="text-text-dim text-[15px] mt-4 mb-8">Connect a wallet to post a job or browse the marketplace. No signup. No email.</p>
        {isConnected ? (
          <Link to="/app" className="btn btn-accent btn-lg">
            <Icons.wallet className="w-4 h-4" /> Open app
          </Link>
        ) : (
          <button className="btn btn-accent btn-lg" onClick={() => setShowWallets(true)}>
            <Icons.wallet className="w-4 h-4" /> Connect wallet
          </button>
        )}
      </Reveal>

      <footer className="max-w-[1200px] mx-auto px-9 py-8 pt-8 border-t border-border flex items-center justify-between">
        <img src="/brand/logo.svg" alt="chain/task" className="h-5 opacity-80" />
        <div className="text-[12px] text-text-faint">Cardano {env.network} · <a href="https://github.com/ArmanAbid/ChainTask" target="_blank" rel="noopener noreferrer" className="hover:text-text">GitHub →</a></div>
      </footer>

      {showWallets && (
        <ConnectModal onClose={() => setShowWallets(false)} onConnected={onConnected} />
      )}
    </div>
  );
}

// Inline ConnectModal (real CIP-30 picker)

function ConnectModal({ onClose, onConnected }: { onClose: () => void; onConnected: () => void }) {
  const installed = useExtensions("supportedArr");
  const weld = useWeldWallet("connectAsync", "isConnecting");
  const [pickedKey, setPickedKey] = useState<string | null>(null);

  const onPick = async (key: string) => {
    if (weld.isConnecting) return;
    setPickedKey(key);
    try {
      await weld.connectAsync(key);
      onConnected();
    } catch (err) {
      console.warn("[wallet] connect failed:", err);
      setPickedKey(null);
    }
  };

  return (
    <div onClick={() => !weld.isConnecting && onClose()} className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[oklch(0.10_0.01_250/0.65)] backdrop-blur-sm">
      <div onClick={e => e.stopPropagation()} className="w-full max-w-[460px] bg-surface border border-border rounded-lg shadow-s2 animate-fade-up">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="m-0 text-base font-semibold">Connect a wallet</h2>
            <div className="text-[11.5px] text-text-faint mt-0.5">CIP-30 compatible. Read-only until you sign a tx.</div>
          </div>
          {!weld.isConnecting && (
            <button onClick={onClose} className="btn btn-ghost btn-sm" aria-label="Close">
              <Icons.x className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="p-5">
          {installed.length === 0 ? (
            <div className="px-3 py-6 text-center bg-bg-2 border border-border rounded-md">
              <div className="text-[13px] text-text mb-1">No Cardano wallets installed</div>
              <div className="text-[12px] text-text-dim mb-4">
                Install one of these to get started:
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 text-[12px]">
                {[
                  { name: "Lace", url: "https://www.lace.io/" },
                  { name: "Eternl", url: "https://eternl.io/" },
                  { name: "Nami", url: "https://namiwallet.io/" },
                  { name: "Vespr", url: "https://vespr.xyz/" },
                  { name: "Yoroi", url: "https://yoroi-wallet.com/" },
                ].map(w => (
                  <a key={w.name} href={w.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                    {w.name} →
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {installed.map(ext => {
                const isPicking = pickedKey === ext.info.key && weld.isConnecting;
                return (
                  <button
                    key={ext.info.key}
                    disabled={weld.isConnecting}
                    onClick={() => onPick(ext.info.key)}
                    className={`flex items-center gap-3 px-3.5 py-3 bg-bg-2 border border-border rounded-md text-text hover:border-accent-line hover:bg-accent-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${isPicking ? "opacity-60" : ""}`}
                  >
                    <img
                      src={ext.info.icon}
                      alt=""
                      className="w-8 h-8 rounded-md"
                      onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                    />
                    <div className="flex-1 text-left min-w-0">
                      <div className="font-medium text-[13px]">{ext.info.displayName}</div>
                      <div className="text-[11px] text-text-faint">Installed</div>
                    </div>
                    {isPicking ? (
                      <span className="tx-spinner" />
                    ) : (
                      <Icons.arrR className="w-3.5 h-3.5 text-text-faint" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <div className="text-[11.5px] text-text-faint mt-3.5 leading-relaxed">
            ChainTask never receives your seed phrase or private key. You allow the dapp to read public addresses + sign txs you confirm.
          </div>
          <div className="text-[11px] text-text-faint mt-2">
            Network: <span className="text-text">{env.network}</span>. Switch your wallet to the matching network in its settings.
          </div>
        </div>
      </div>
    </div>
  );
}

// Small components from the original design

function VaultNode({ label, who, icon, accent, locked, dim }: { label: string; who: string; icon: React.ReactNode; accent?: boolean; locked?: boolean; dim?: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-1.5 text-center ${dim ? "opacity-55" : ""}`}>
      <span className={`w-11 h-11 rounded-xl inline-flex items-center justify-center border ${locked ? "bg-accent-soft border-accent-line text-accent shadow-[0_0_24px_oklch(0.78_0.13_215/0.18)]" : "bg-surface-2 border-border"}`}>{icon}</span>
      <span className={`text-[11.5px] ${accent ? "text-accent" : "text-text-faint"}`}>{label}</span>
      <span className={`font-mono text-[11.5px] ${accent ? "text-accent" : "text-text-dim"}`}>{who}</span>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button onClick={() => setOpen(o => !o)}
      className={`text-left p-5 bg-surface border rounded-md transition-colors ${open ? "border-border-strong" : "border-border hover:border-border-strong"}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 font-medium text-[14px]">{q}</div>
        <Icons.chevR className={`w-3.5 h-3.5 text-text-faint transition-transform ${open ? "rotate-90" : ""}`} />
      </div>
      {open && <div className="mt-2.5 text-text-dim text-[13px] leading-relaxed">{a}</div>}
    </button>
  );
}
