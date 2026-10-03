import { useRef, useState } from 'react';
import { ApiError } from '../api';
import { useToast } from '../context/ToastContext.jsx';

/**
 * Runs a save with a toast and per-field errors from the server, so each form stays short.
 * `save(key, fn, success)` resolves to true when it worked.
 */
export function useSaver() {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [errors, setErrors] = useState({});
  const running = useRef(new Set());
  const save = async (key, fn, success) => {
    // A second click while this save is still going would send the same request twice.
    if (running.current.has(key)) return false;
    running.current.add(key);
    setBusy(key);
    setErrors({});
    try {
      await fn();
      if (success) toast.success(success);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      toast.error(err.message);
      return false;
    } finally {
      running.current.delete(key);
      setBusy(null);
    }
  };
  return { busy, errors, save, clearErrors: () => setErrors({}) };
}
