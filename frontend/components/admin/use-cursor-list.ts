"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * A filterable, keyset-paginated list. The first page can be supplied by the
 * server render (no request until a filter changes); filter changes are
 * debounced, and a response that is no longer the latest request is dropped.
 */
export function useCursorList<T extends { id: string }, F>({
  initial,
  filters,
  load,
  debounceMs = 250,
}: {
  initial?: CursorPage<T>;
  filters: F;
  load: (filters: F, cursor: string | null) => Promise<CursorPage<T>>;
  debounceMs?: number;
}) {
  const key = JSON.stringify(filters);
  const [items, setItems] = useState<T[]>(initial?.items ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(initial?.nextCursor ?? null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const loadRef = useRef(load);
  const shown = useRef<string | null>(initial ? `${key}#0` : null);
  const seq = useRef(0);

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    const stamp = `${key}#${nonce}`;
    if (shown.current === stamp) return;
    const id = ++seq.current;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      loadRef
        .current(JSON.parse(key) as F, null)
        .then((page) => {
          if (id !== seq.current) return;
          shown.current = stamp;
          setItems(page.items);
          setNextCursor(page.nextCursor);
        })
        .catch((err: unknown) => {
          if (id === seq.current) setError(err instanceof Error ? err.message : "Could not load.");
        })
        .finally(() => {
          if (id === seq.current) setLoading(false);
        });
    }, nonce === 0 ? debounceMs : 0);
    return () => clearTimeout(timer);
  }, [key, nonce, debounceMs]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    const id = seq.current;
    setLoadingMore(true);
    try {
      const page = await loadRef.current(JSON.parse(key) as F, nextCursor);
      if (id !== seq.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...page.items.filter((i) => !seen.has(i.id))];
      });
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more.");
    } finally {
      setLoadingMore(false);
    }
  }, [key, nextCursor]);

  /** Refetch the first page with the current filters (after a mutation). */
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { items, setItems, nextCursor, loading, loadingMore, error, loadMore, reload };
}
