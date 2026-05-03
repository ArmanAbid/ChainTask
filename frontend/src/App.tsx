import { ConnectWallet } from './components/ConnectWallet'

function App() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">ChainTask</h1>
          <p className="text-xs text-gray-500">Trustless escrow on Cardano</p>
        </div>
        <ConnectWallet />
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-semibold tracking-tight mb-4">
          Week 1 scaffold
        </h2>
        <p className="text-gray-600 mb-8">
          Wallet connect is wired up. Connect Lace to verify the round-trip
          (Blockfrost → Lucid Evolution → Redux). Job posting flow ships in Week 2.
        </p>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <h3 className="font-medium mb-2">What's working today</h3>
          <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
            <li>Aiken contracts compile, build, format clean</li>
            <li>3 smoke tests passing</li>
            <li>Vite + React + Tailwind 4 + Lucid Evolution wired</li>
            <li>Redux store with typed hooks</li>
            <li>Pinata uploader ready (needs JWT in .env.local)</li>
          </ul>
        </div>
      </main>
    </div>
  )
}

export default App
