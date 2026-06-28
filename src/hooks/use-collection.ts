"use client";

import { useEffect, useState } from "react";
import { CollectionApi } from "@/lib/data/repository";

interface UseCollectionResult<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Subscribe to a repository collection for the signed-in user. Returns realtime
 * data (Firestore onSnapshot in prod, polling in demo mode) plus loading/error.
 */
export function useCollection<T extends { id: string; userId: string }>(
  api: CollectionApi<T>,
  userId: string | null | undefined,
  deps: unknown[] = []
): UseCollectionResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!userId) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const off = api.subscribe(userId, (items) => {
      setData(items);
      setError(null);
      setLoading(false);
    });
    return () => off();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, tick, ...deps]);

  const refresh = () => setTick((t) => t + 1);

  return { data, loading, error, refresh };
}
