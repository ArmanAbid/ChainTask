import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider as ReduxProvider } from 'react-redux'
import { store } from './store'
import { LucidProvider } from './lib/cardano/LucidProvider'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReduxProvider store={store}>
      <LucidProvider>
        <App />
      </LucidProvider>
    </ReduxProvider>
  </StrictMode>,
)
