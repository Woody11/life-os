import { createContext, useCallback, useContext, useEffect, useRef } from 'react';

const SseContext = createContext(null);

// Named SSE event types the server emits.
const KNOWN_EVENTS = ['dispatch_updated', 'dispatch_created', 'kanban_updated', 'recipe_extraction'];

export function SseProvider({ children }) {
  // Map<eventType, Set<handler>>
  const listenersRef = useRef(new Map());

  useEffect(() => {
    const es = new EventSource('/api/events');

    KNOWN_EVENTS.forEach((type) => {
      es.addEventListener(type, (event) => {
        let data;
        try { data = JSON.parse(event.data); } catch { data = event.data; }
        (listenersRef.current.get(type) ?? new Set()).forEach((fn) => fn(data));
      });
    });

    es.onerror = () => {};
    return () => es.close();
  }, []);

  const subscribe = useCallback((handler, eventType) => {
    if (!listenersRef.current.has(eventType)) {
      listenersRef.current.set(eventType, new Set());
    }
    listenersRef.current.get(eventType).add(handler);
    return () => listenersRef.current.get(eventType)?.delete(handler);
  }, []);

  return (
    <SseContext.Provider value={{ subscribe }}>
      {children}
    </SseContext.Provider>
  );
}

export function useSse() {
  const ctx = useContext(SseContext);
  if (!ctx) throw new Error('useSse must be used within <SseProvider>');
  return ctx;
}
