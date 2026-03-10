import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex items-center justify-center h-full w-full bg-f1-carbon text-white p-6">
          <div className="text-center">
            <p className="text-f1-red font-bold text-sm mb-2">COMPONENT ERROR</p>
            <p className="text-xs text-gray-400 font-mono max-w-md break-words">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-4 px-4 py-2 bg-f1-red text-white text-xs font-bold rounded hover:bg-[#c70000] transition-colors"
            >
              RETRY
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
