import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

// Only serializable values live here. The live Lucid instance lives in
// React Context (LucidProvider) — it has functions/promises and would break
// Redux's serialization checks if stored here.
interface WalletState {
  address: string | null
  walletName: string | null
  isConnected: boolean
  isConnecting: boolean
  error: string | null
}

const initialState: WalletState = {
  address: null,
  walletName: null,
  isConnected: false,
  isConnecting: false,
  error: null,
}

export const walletSlice = createSlice({
  name: 'wallet',
  initialState,
  reducers: {
    connectStart: (state, action: PayloadAction<string>) => {
      state.isConnecting = true
      state.walletName = action.payload
      state.error = null
    },
    connectSuccess: (state, action: PayloadAction<{ address: string; walletName: string }>) => {
      state.address = action.payload.address
      state.walletName = action.payload.walletName
      state.isConnected = true
      state.isConnecting = false
      state.error = null
    },
    connectFailure: (state, action: PayloadAction<string>) => {
      state.error = action.payload
      state.isConnecting = false
      state.isConnected = false
    },
    disconnectWallet: (state) => {
      state.address = null
      state.walletName = null
      state.isConnected = false
      state.isConnecting = false
      state.error = null
    },
  },
})

export const { connectStart, connectSuccess, connectFailure, disconnectWallet } = walletSlice.actions
export default walletSlice.reducer
