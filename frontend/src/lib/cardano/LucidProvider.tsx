import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Blockfrost, Lucid, type LucidEvolution, type Network } from '@lucid-evolution/lucid'
import { useAppDispatch } from '../../store/hooks'
import { connectFailure, connectStart, connectSuccess, disconnectWallet } from '../../store/walletSlice'

// ─────────────────────────────────────────────────────────────────────────────
// Context
//
// The live Lucid instance is non-serializable (it carries functions, promises,
// and a wallet handle), so it lives in React Context — not in Redux.
// Redux only holds the serializable address + status flags.
// ─────────────────────────────────────────────────────────────────────────────

interface LucidContextValue {
  lucid: LucidEvolution | null
  connectWallet: (walletName: SupportedWallet) => Promise<void>
  disconnect: () => void
}

export type SupportedWallet = string

const LucidContext = createContext<LucidContextValue | null>(null)

export const useLucid = (): LucidContextValue => {
  const ctx = useContext(LucidContext)
  if (!ctx) throw new Error('useLucid must be used within a LucidProvider')
  return ctx
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

const NETWORK = (import.meta.env.VITE_CARDANO_NETWORK || 'Preview') as Network

const BLOCKFROST_URL: Record<Network, string> = {
  Mainnet: 'https://cardano-mainnet.blockfrost.io/api/v0',
  Preprod: 'https://cardano-preprod.blockfrost.io/api/v0',
  Preview: 'https://cardano-preview.blockfrost.io/api/v0',
  Custom: '',
}

export const LucidProvider = ({ children }: { children: ReactNode }) => {
  const [lucid, setLucid] = useState<LucidEvolution | null>(null)
  const dispatch = useAppDispatch()

  const connectWallet = useCallback(
    async (walletName: SupportedWallet) => {
      dispatch(connectStart(walletName))

      try {
        const apiKey = import.meta.env.VITE_BLOCKFROST_API_KEY
        if (!apiKey) {
          throw new Error('VITE_BLOCKFROST_API_KEY is not set. Copy .env.example to .env.local.')
        }

        if (!window.cardano?.[walletName]) {
          throw new Error(`${walletName} wallet extension is not installed.`)
        }

        // 1. Init Lucid Evolution against Blockfrost.
        const lucidInstance = await Lucid(
          new Blockfrost(BLOCKFROST_URL[NETWORK], apiKey),
          NETWORK,
        )

        // 2. Ask the wallet for permission and get the CIP-30 API.
        const walletApi = await window.cardano[walletName]!.enable()

        // 3. Bind the wallet to Lucid. Note the new API: `selectWallet.fromAPI`,
        //    not the old `selectWallet(api)`.
        lucidInstance.selectWallet.fromAPI(walletApi)

        // 4. Pull the address and push to Redux.
        const address = await lucidInstance.wallet().address()
        setLucid(lucidInstance)
        dispatch(connectSuccess({ address, walletName }))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown wallet error'
        dispatch(connectFailure(message))
        // Re-throw so callers (UI buttons) can show toasts if desired.
        throw err
      }
    },
    [dispatch],
  )

  const disconnect = useCallback(() => {
    setLucid(null)
    dispatch(disconnectWallet())
  }, [dispatch])

  return (
    <LucidContext.Provider value={{ lucid, connectWallet, disconnect }}>
      {children}
    </LucidContext.Provider>
  )
}
