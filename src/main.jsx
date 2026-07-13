import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { SpeedInsights } from '@vercel/speed-insights/react';
import './index.css';
import './styles/competition-phases.css';
import App from './App.jsx';
import ErrorBoundary from './components/common/ErrorBoundary';
import { ToastProvider } from './contexts/ToastContext';
import { NotificationProvider } from './contexts/NotificationContext';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <NotificationProvider>
            <App />
            <SpeedInsights />
          </NotificationProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);

// Initialize Sentry off the critical render path. Its browser-tracing/replay
// integrations are heavy; loading them after paint (on idle) keeps them out of
// the initial bundle and improves FCP/LCP. See src/lib/sentry.js.
if (import.meta.env.VITE_SENTRY_DSN) {
  const start = () => import('./lib/sentry').then((m) => m.initSentry());
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(start, { timeout: 3000 });
  } else {
    setTimeout(start, 2000);
  }
}
