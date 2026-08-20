import { Component } from "react";

export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled UI error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="panel max-w-md p-6 text-center">
          <h1 className="text-sm font-medium text-ash-100">Something broke</h1>
          <p className="mt-2 text-sm text-ash-500">{this.state.error.message}</p>
          <button
            className="btn-ghost mt-4"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
