/**
 * ErrorBoundary - Catches render errors and displays fallback UI
 * 
 * Wraps components to prevent crashes from propagating up the tree.
 */

import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
    // Clear the chunk-error reload flag on successful mount
    try { sessionStorage.removeItem('chunk-error-reload'); } catch {}
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Report to Sentry. Imported lazily so Sentry stays off the critical render
    // path (this only runs when a render error is actually caught).
    import('@sentry/react')
      .then((Sentry) => {
        Sentry.captureException(error, { contexts: { react: { componentStack: errorInfo?.componentStack } } });
      })
      .catch(() => {});

    // Auto-reload once for chunk load failures (stale deployment cache)
    if (this.isChunkLoadError(error)) {
      const reloadKey = 'chunk-error-reload';
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, '1');
        window.location.reload();
        return;
      }
      // Already tried reloading once — clear flag so next navigation can retry
      sessionStorage.removeItem(reloadKey);
    }
  }

  isChunkLoadError(error) {
    const msg = error?.message || '';
    return (
      msg.includes('MIME type') ||
      msg.includes('Loading chunk') ||
      msg.includes('Failed to fetch dynamically imported module') ||
      error?.name === 'ChunkLoadError'
    );
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-bg-primary to-bg-elevated text-white p-8 text-center font-sans">
          {/* Error Icon */}
          <div className="w-16 h-16 mb-6 bg-red-500/20 rounded-full flex items-center justify-center text-3xl">
            ⚠️
          </div>
          
          <h1 className="text-gold mb-3 text-2xl font-semibold">
            Something went wrong
          </h1>
          
          <p className="text-gray-400 mb-8 max-w-[400px]">
            We encountered an unexpected error. Please try refreshing the page or go back to the home page.
          </p>
          
          <div className="flex gap-4">
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-white/10 text-white border border-white/20 rounded-lg font-semibold cursor-pointer hover:bg-white/15 transition-colors"
            >
              Refresh Page
            </button>
            <button
              onClick={this.handleReset}
              className="px-6 py-3 bg-gradient-to-br from-gold to-gold-light text-bg-primary border-none rounded-lg font-semibold cursor-pointer hover:brightness-110 transition-all"
            >
              Go Home
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
