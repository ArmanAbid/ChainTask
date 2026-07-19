// WalletButton - the universal connect/disconnect control.

import { useState } from "react";
import { useExtensions, useWallet as useWeldWallet } from "@ada-anvil/weld/react";
import { env } from "@/config/env";
import { useWallet } from "@/hooks/useWallet";
import { truncateAddress, formatAda } from "@/lib/format";
import { Modal } from "./Modal";

export function WalletButton() {
  const [open, setOpen] = useState(false);
  const conn = useWallet();
  const weld = useWeldWallet("connectAsync", "disconnect");

  if (conn.status === "connecting") {
    return (
      <button className="btn btn-sm" disabled>
        Connecting…
      </button>
    );
  }

  if (conn.status === "disconnected") {
    return (
      <>
        <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
          Connect Wallet
        </button>
        <ConnectModal
          open={open}
          onClose={() => setOpen(false)}
          onPick={async (key) => {
            setOpen(false);
            await weld.connectAsync(key);
          }}
        />
      </>
    );
  }

  return (
    <ConnectedButton
      label={`${truncateAddress(conn.address)} · ${formatAda(conn.balanceAda)}`}
      wrongNetwork={!conn.isCorrectNetwork}
      onDisconnect={() => weld.disconnect()}
    />
  );
}


function ConnectModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (key: string) => void;
}) {
  const installed = useExtensions("supportedArr");

  return (
    <Modal open={open} onClose={onClose} title="Connect a wallet">
      <p className="text-[13.5px] text-text-dim mb-4">
        Choose any installed Cardano wallet. Your wallet stays on your device — we never see your keys.
      </p>
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
        <div className="space-y-1.5">
          {(() => {
            // Some wallets (Vespr in particular) register themselves under
            // multiple slots on window.cardano for compatibility with
            // dapps that only whitelist Lace/Nami. Weld surfaces each
            // slot as a separate entry, so users see "Lace" listed twice.
            // Dedupe by displayName so each wallet appears once.
            const seen = new Set<string>();
            const unique = installed.filter((ext) => {
              const name = ext.info.displayName.toLowerCase();
              if (seen.has(name)) return false;
              seen.add(name);
              return true;
            });
            return unique.map((ext) => (
              <button
                key={ext.info.key}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-bg-2 hover:bg-surface-2 border border-border hover:border-border-strong rounded-md transition-colors"
                onClick={() => onPick(ext.info.key)}
              >
                <div className="flex items-center gap-3">
                  <img
                    src={ext.info.icon}
                    alt=""
                    className="w-7 h-7 rounded-md"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.visibility = "hidden";
                    }}
                  />
                  <span className="text-[13.5px] font-medium">{ext.info.displayName}</span>
                </div>
                <span className="text-[11px] text-accent">Connect</span>
              </button>
            ));
          })()}
        </div>
      )}
      <p className="text-[11.5px] text-text-faint mt-4">
        Network: <span className="text-text">{env.network}</span>. Switch your wallet to the matching network in its settings.
      </p>
    </Modal>
  );
}


function ConnectedButton({
  label,
  wrongNetwork,
  onDisconnect,
}: {
  label: string;
  wrongNetwork: boolean;
  onDisconnect: () => void;
}) {
  const [openMenu, setOpenMenu] = useState(false);

  return (
    <div className="relative">
      <button
        className={`btn btn-sm ${wrongNetwork ? "btn-warn" : ""}`}
        onClick={() => setOpenMenu((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={openMenu}
      >
        <span className="font-mono text-[12px]">{label}</span>
      </button>
      {openMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpenMenu(false)}
            aria-hidden="true"
          />
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[200px] card p-1"
          >
            {wrongNetwork && (
              <div className="px-3 py-2 text-[11.5px] text-warn border-b border-border mb-1">
                Wallet is on the wrong network. Switch to {env.network}.
              </div>
            )}
            <button
              role="menuitem"
              className="w-full text-left px-3 py-2 text-[13px] hover:bg-bg-2 rounded-md"
              onClick={() => {
                onDisconnect();
                setOpenMenu(false);
              }}
            >
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}