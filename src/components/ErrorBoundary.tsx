import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare props: ErrorBoundaryProps;

  state: ErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Application render failed", error);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="mx-auto flex min-h-[55vh] w-full max-w-3xl flex-col items-center justify-center gap-5 px-4 text-center">
        <div className="rounded-[1.4rem] border border-red-300/20 bg-red-400/10 px-6 py-7 shadow-[0_20px_60px_rgba(2,6,23,0.24)]">
          <div className="text-[11px] uppercase tracking-[0.28em] text-red-200">Display Error</div>
          <h1 className="mt-3 text-2xl font-medium tracking-[-0.03em] text-white">
            The test result could not be displayed.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            Refresh the page and run the test again. The app is still available; only the result view failed to render.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-full border border-white/12 bg-slate-950/50 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.24em] text-white transition hover:border-red-200/30"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }
}
