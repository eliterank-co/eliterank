/**
 * Sentry initialization — deferred off the critical render path.
 *
 * The browser-tracing and session-replay integrations are the heaviest part of
 * the Sentry SDK. Importing/initializing them eagerly in main.jsx padded the
 * initial JS bundle that runs before first paint, hurting FCP/LCP (Real
 * Experience Score). This module isolates the `Sentry.init` (and the heavy
 * integrations it references) so Vite splits it into a separate chunk that
 * main.jsx loads *after* the app has painted, on idle.
 *
 * `captureException` / `setUser` calls elsewhere in the app are safe no-ops
 * until this init runs, so deferring it does not lose error reporting once the
 * SDK is warmed up (a few seconds after load).
 */

import * as Sentry from '@sentry/react';

export function initSentry() {
  if (!import.meta.env.VITE_SENTRY_DSN) return;

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
  });
}
