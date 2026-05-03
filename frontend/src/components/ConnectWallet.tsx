import { useEffect, useState } from 'react'
import { useLucid } from '../lib/cardano/LucidProvider'
import { useAppSelector } from '../store/hooks'

const truncate = (addr: string) => addr.slice(0, 8) + '...' + addr.slice(-6)

interface DetectedWallet {
  id: string
  name: string
  icon: string
}

export const ConnectWallet = () => {
  const { connectWallet, disconnect } = useLucid()
  const { address, isConnected, isConnecting, error } = useAppSelector((s) => s.wallet)
  const [open, setOpen] = useState(false)
  const [wallets, setWallets] = useState<DetectedWallet[]>([])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.cardano) {
      setWallets([])
      return
    }

    const detected: DetectedWallet[] = []
    for (const id of Object.keys(window.cardano)) {
      const w = window.cardano[id]
      if (w && typeof w.enable === 'function' && w.name) {
        detected.push({ id, name: w.name, icon: w.icon || '' })
      }
    }
    setWallets(detected)
  }, [open])

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600 font-mono">{truncate(address)}</span>
        <button
          onClick={disconnect}
          className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col items-end gap-1">
      <button
        onClick={() => setOpen(!open)}
        disabled={isConnecting}
        className="px-6 py-2 bg-black text-white font-medium text-sm rounded hover:bg-gray-800 disabled:opacity-50"
      >
        {isConnecting ? 'Connecting...' : 'Connect Wallet'}
      </button>

      {open && (
        <div className="absolute top-full mt-2 right-0 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          {wallets.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">
              No Cardano wallet detected. Install{' '}
              <a href="https://www.lace.io" target="_blank" rel="noreferrer" className="underline">
                Lace
              </a>
              {' '}or another CIP-30 wallet.
            </div>
          ) : (
            wallets.map((w) => (
              <button
                key={w.id}
                onClick={() => {
                  setOpen(false)
                  void connectWallet(w.id)
                }}
                className="w-full px-4 py-3 flex items-center gap-3 text-left text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
              >
                {w.icon && <img src={w.icon} alt="" className="w-6 h-6" />}
                <span>{w.name}</span>
              </button>
            ))
          )}
        </div>
      )}

      {error && <span className="text-xs text-red-600 max-w-xs">{error}</span>}
    </div>
  )
}