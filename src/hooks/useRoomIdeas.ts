"use client";

import { useCallback, useEffect, useState } from "react";
import type { Suggestion } from "@/lib/sponsorship/types";

/** Page-owned pool: opening/closing the dialog never starts a model request. */
export function useRoomIdeas(enabled: boolean, anthropicKey: string, context: string) {
  const [batch, setBatch] = useState<{ batchId: string | null; suggestions: Suggestion[] }>({ batchId: null, suggestions: [] });
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    setLoading(true);
    const load = async () => {
      try {
        const response = await fetch("/api/suggestions", { method: "POST", signal: abort.signal,
          headers: anthropicKey.trim() ? { "x-anthropic-key": anthropicKey.trim() } : undefined });
        if (!response.ok) throw new Error("Room ideas unavailable");
        const data = await response.json();
        if (abort.signal.aborted) return;
        if (Array.isArray(data.suggestions) && data.suggestions.length) {
          setBatch({ batchId: data.batchId, suggestions: data.suggestions });
        }
        if (data.pending && polls++ < 30) { timer = setTimeout(load, 2000); return; }
      } catch { /* Hints never block the building or manual descriptions. */ }
      if (!abort.signal.aborted) {
        setLoading(false);
        timer = setTimeout(retry, 86_400_000);
      }
    };
    void load();
    return () => { abort.abort(); clearTimeout(timer); };
  }, [enabled, anthropicKey, context, attempt, retry]);

  return { ...batch, loading, retry };
}

export type RoomIdeas = ReturnType<typeof useRoomIdeas>;
