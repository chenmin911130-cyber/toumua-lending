import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "./api";

/**
 * Loads one resource for the current id. A newer id, retry, or unmount
 * invalidates the in-flight response so a slow 403/404 cannot stick on Loading
 * or overwrite the page the user has moved to.
 */
export function useAsyncResource<T>(
  key: string,
  load: (key: string, signal: AbortSignal) => Promise<T>,
) {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    setDataState(null);
    loadRef.current(key, controller.signal)
      .then((value) => {
        if (!active || controller.signal.aborted) return;
        setDataState(value);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active || controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setDataState(null);
        setError(err);
        setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const setData = useCallback((value: T | null) => {
    setDataState(value);
    setLoading(false);
    setError(null);
  }, []);

  return { data, error, loading, retry, setData };
}

export function ResourceGate({
  loading,
  error,
  ready,
  onRetry,
  loadingLabel,
  errorFallback,
}: {
  loading: boolean;
  error: unknown;
  ready: boolean;
  onRetry: () => void;
  loadingLabel: string;
  errorFallback: string;
}) {
  if (ready) return null;
  if (!error && loading) {
    return <p role="status">{loadingLabel}</p>;
  }
  return (
    <div role="alert">
      <p className="error">{errorMessage(error, errorFallback)}</p>
      <button type="button" className="btn btn-secondary" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
