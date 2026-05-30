import { BrowserRouter } from "react-router-dom";
import { ChainTaskWalletProvider } from "@/lib/cardano/WalletProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toasts } from "@/components/Toasts";
import AppRoutes from "@/pages/AppRoutes";

export default function App() {
  return (
    <ErrorBoundary>
      <ChainTaskWalletProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toasts />
        </BrowserRouter>
      </ChainTaskWalletProvider>
    </ErrorBoundary>
  );
}
