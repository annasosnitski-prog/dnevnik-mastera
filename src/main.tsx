import React from 'react';
import ReactDOM from 'react-dom/client';
import TattoDiary from './components/TattoDiary';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/sw.js')
    .then((registration) => {
      // Home-screen installs on iOS can sit suspended in the background for
      // days without ever re-navigating, so the browser's own update check
      // (which only runs on navigation) may not fire for a long time. Ask
      // explicitly whenever the app comes back to the foreground, so a
      // resumed session picks up a newer deploy instead of continuing to run
      // whatever was loaded at the last cold launch.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update();
      });
    })
    .catch((err) => console.log('SW registration failed:', err));

  // Once a new service worker takes control, the already-loaded page is
  // running stale JS — reload once to pick up the new version.
  let reloadedForNewWorker = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadedForNewWorker) return;
    reloadedForNewWorker = true;
    window.location.reload();
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <TattoDiary />
    </ErrorBoundary>
  </React.StrictMode>,
);
