import { createContext, useContext, useEffect, useRef, useState } from 'react';

/**
 * SseContext — provides a single SSE connection to /api/events at the App level.
 *
 * Consumers can subscribe to real-time updates via useSse():
 *   const { lastMessage, subscribe } = useSse();
 *
 * subscribe(handler) registers a callback and returns an unsubscribe function:
 *   useEffect(() => {
 *     const unsub = subscribe((msg) => { ... });
 *     return unsub;
 *   }, [subscribe]);
 */

const SseContext = createContext(null);

export function SseProvider({ children }) {
  const [lastMessage, setLastMessage] = useState(null);
  const listenersRef = useRef(new Set());

  useEffect(() => {
    const es = new EventSource('/api/events');

    es.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        data = event.data;
      }
      setLastMessage(data);
      listenersRef.current.forEach((fn) => fn(data));
    };

    es.onerror = () => {
      // Browser will auto-reconnect; nothing to do here.
    };

    return () => {
      es.close();
    };
  }, []);

  const subscribe = (handler) => {
    listenersRef.current.add(handler);
    return () => listenersRef.current.delete(handler);
  };

  return (
    <SseContext.Provider value={{ lastMessage, subscribe }}>
      {children}
    </SseContext.Provider>
  );
}

export function useSse() {
  const ctx = useContext(SseContext);
  if (!ctx) throw new Error('useSse must be used within <SseProvider>');
  return ctx;
}
