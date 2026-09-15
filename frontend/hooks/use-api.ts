"use client";

import { useState, useCallback } from "react";
import { ApiException } from "@/types/api";

interface UseApiState<T> {
  data: T | null;
  error: ApiException | Error | null;
  isLoading: boolean;
}

/**
 * Generic hook for executing async API operations with state management.
 */
export function useApi<T, P extends unknown[] = unknown[]>(
  apiFn: (...args: P) => Promise<T>
) {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    error: null,
    isLoading: false,
  });

  const execute = useCallback(
    async (...args: P): Promise<T | null> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const result = await apiFn(...args);
        setState({ data: result, error: null, isLoading: false });
        return result;
      } catch (err) {
        const error = err instanceof ApiException || err instanceof Error ? err : new Error("An unexpected error occurred");
        setState({ data: null, error, isLoading: false });
        return null;
      }
    },
    [apiFn]
  );

  const reset = useCallback(() => {
    setState({ data: null, error: null, isLoading: false });
  }, []);

  return {
    ...state,
    execute,
    reset,
  };
}
