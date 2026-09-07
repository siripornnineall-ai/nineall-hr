"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal — the app still works fully without the service worker, it just won't
        // be able to receive push notifications on this browser.
      });
    }
  }, []);
  return null;
}
