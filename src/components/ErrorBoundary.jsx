// App-wide error boundary — turns a crash into a friendly, branded recovery
// screen instead of a blank white page (corporate reliability). Logs the error
// to the console (and you can forward window.onerror to a service later).
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Visible in the browser console and any attached monitoring.
    console.error('[ui-error]', error, info?.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-bg px-6 text-center">
        <div className="w-full max-w-sm">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-3xl font-bold text-black">
            !
          </div>
          <h1 className="text-2xl font-bold uppercase text-body">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted">
            Sorry about that. Please reload the page — your data is safe.
          </p>
          <button className="btn-primary mt-6 w-full" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
