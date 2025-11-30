import * as Sentry from "@sentry/react";

// Initialize Sentry
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN || 
    "https://373ef2675f19f594f53318e4a1574c3f@o4509020080766976.ingest.de.sentry.io/4510447371747408";

  Sentry.init({
    dsn,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    // Performance Monitoring
    tracesSampleRate: 1.0, // Capture 100% of transactions for development
    // Session Replay
    replaysSessionSampleRate: 0.1, // Sample 10% of sessions
    replaysOnErrorSampleRate: 1.0, // Sample 100% of sessions with errors
    environment: import.meta.env.MODE || "development",
    // Release tracking
    release: import.meta.env.VITE_APP_VERSION || undefined,
  });
}

