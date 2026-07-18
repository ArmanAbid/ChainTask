// Top-level error boundary.

import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // In production, swap console for a real reporter (Sentry, LogRocket, etc).
    console.error("[ChainTask] uncaught error:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-[480px] card p-8 text-center">
          <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
          <p className="text-[13.5px] text-text-dim mb-6">
            An unexpected error occurred. Try refreshing the page — if the problem persists, the team is investigating.
          </p>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => window.location.reload()}
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }
}
