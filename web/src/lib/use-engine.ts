"use client";

import { useEffect, useState } from "react";
import { engineUrl, type EngineView } from "./engine";

/** Live engine state pushed over Server-Sent Events. */
export function useEngineState() {
  const [view, setView] = useState<EngineView | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;
    engineUrl().then((base) => {
      if (closed) return;
      es = new EventSource(`${base}/api/events`);
      es.onopen = () => setConnected(true);
      es.onmessage = (e) => setView(JSON.parse(e.data) as EngineView);
      es.onerror = () => setConnected(false);
    });
    return () => {
      closed = true;
      es?.close();
    };
  }, []);

  return { view, connected };
}
