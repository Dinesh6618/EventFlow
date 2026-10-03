import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A countdown for buttons that must not be pressed again straight away (resending an email, trying a
 * login again after being rate limited). `start(seconds)` begins it; `seconds` counts down to 0.
 * It is worked out from the clock rather than by subtracting one a tick, so a background tab that is
 * throttled still shows the right time.
 */
export function useCooldown() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until <= Date.now()) return undefined;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= until) clearInterval(timer);
    }, 500);
    return () => clearInterval(timer);
  }, [until]);

  const start = useCallback((seconds) => {
    const current = Date.now();
    setNow(current);
    setUntil(current + Math.max(1, Math.ceil(seconds)) * 1000);
  }, []);

  const seconds = Math.max(0, Math.ceil((until - now) / 1000));
  return { seconds, active: seconds > 0, start };
}

/**
 * Lets only one run of an action happen at a time. A second click, Enter press or double tap while the
 * first request is still going is ignored, so one action is always one request. Unlike a `disabled`
 * button this takes effect immediately, before React has re-rendered.
 */
export function useSingleFlight() {
  const running = useRef(false);
  return useCallback(async (task) => {
    if (running.current) return undefined;
    running.current = true;
    try {
      return await task();
    } finally {
      running.current = false;
    }
  }, []);
}
