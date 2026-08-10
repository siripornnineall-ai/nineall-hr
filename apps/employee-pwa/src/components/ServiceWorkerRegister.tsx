"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal — the app still works fully online without the service worker,
        // it just won't be installable/offline-capable on this browser.
      });
    }
  }, []);
  return null;
}
