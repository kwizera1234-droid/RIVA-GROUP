import React from 'react';

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('SoberWatch render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="min-h-screen bg-[#05070B] text-white flex items-center justify-center p-6">
        <section className="w-full max-w-md rounded-2xl border border-red-500/30 bg-black/60 p-6 space-y-4">
          <h1 className="text-xl font-semibold">SoberWatch could not display this screen</h1>
          <p className="text-sm text-white/70">
            The app is still running, but this screen encountered an unexpected error.
          </p>
          <p className="text-xs text-red-300 break-words">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-black"
          >
            Reload app
          </button>
        </section>
      </main>
    );
  }
}
