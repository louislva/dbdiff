import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { useStore } from "../stores/store";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  handleReset = () => {
    useStore.getState().resetUIState();
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const darkMode = useStore.getState().darkMode;
      // Ensure the html element has the right class for dark mode
      document.documentElement.classList.toggle("dark", darkMode);

      return (
        <div
          className={`flex items-center justify-center h-screen ${
            darkMode ? "dark bg-[#0a0a0a]" : "bg-stone-50"
          }`}
        >
          <div className="max-w-md w-full mx-4 p-6 rounded-xl border border-stone-200 dark:border-white/10 bg-white dark:bg-[#1a1a1a]">
            <h1 className="text-lg font-semibold text-primary mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-secondary mb-4">
              An unexpected error occurred. You can reset the UI state to
              recover. Your database connections and settings will be preserved.
            </p>
            <pre className="text-xs text-tertiary bg-stone-100 dark:bg-white/5 rounded-lg p-3 mb-4 overflow-auto max-h-32">
              {this.state.error?.message}
            </pre>
            <button
              className="px-4 py-2 text-sm font-medium rounded-lg bg-stone-900 dark:bg-white text-white dark:text-black hover:opacity-90 transition-opacity"
              onClick={this.handleReset}
            >
              Reset UI State
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
