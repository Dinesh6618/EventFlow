import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs `fetcher(signal)` on mount and whenever `deps` change.
 * Cancels the in-flight request on change/unmount and exposes loading, error and reload.
 * `refreshMs` re-fetches quietly in the background (no loading flicker; failures keep the old data).
 */
export function useApi(fetcher, deps = [], { refreshMs } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [version, setVersion] = useState(0);
  const quiet = useRef(false);
  // After a 429 the background refresh waits out the time the server asked for.
  const pausedUntil = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const silent = quiet.current;
    quiet.current = false;
    if (!silent) setState((prev) => ({ ...prev, error: null, loading: true }));

    // A response that arrives after the request was superseded must never touch the state.
    fetcher(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'AbortError') return;
        if (error.status === 429 && error.retryAfter) pausedUntil.current = Date.now() + error.retryAfter * 1000;
        setState((prev) => (silent ? prev : { data: null, error, loading: false }));
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  useEffect(() => {
    if (!refreshMs) return undefined;
    const timer = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      quiet.current = true;
      setVersion((v) => v + 1);
    }, refreshMs);
    return () => clearInterval(timer);
  }, [refreshMs]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}

/** Returns `value` only after it has stopped changing for `delay` ms. */
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
