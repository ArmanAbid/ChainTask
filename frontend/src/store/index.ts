import { configureStore } from '@reduxjs/toolkit'
import walletReducer from './walletSlice'

export const store = configureStore({
  reducer: {
    wallet: walletReducer,
  },
})

// Inferred types — use these instead of plain useDispatch/useSelector
// so we get full type safety throughout the app.
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
