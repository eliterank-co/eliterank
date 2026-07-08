import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import './index.css';
import './styles/competition-phases.css';
import App from './App.jsx';
import { ToastProvider } from './contexts/ToastContext';
import { NotificationProvider } from './contexts/NotificationContext';

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    // Facebook/Instagram in-app browsers inject scripts (iabjs://) that
    // throw when the WebView's Java backing object is destroyed. Not our bug.
    denyUrls: [/^iabjs:\/\//i],
    ignoreErrors: [
      /Java object is gone/i,
      /enableButtonsClickedMetaDataLogging/i,
    ],
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<div style={{ padding: 24 }}>Something went wrong.</div>}>
      <BrowserRouter>
        <ToastProvider>
          <NotificationProvider>
            <App />
            <SpeedInsights />
          </NotificationProvider>
        </ToastProvider>
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </StrictMode>
);
