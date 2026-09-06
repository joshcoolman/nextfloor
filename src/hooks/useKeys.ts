"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "nextfloor.keys";

export interface KeyPair {
  anthropic: string;
  google: string;
  fal: string;
}

const EMPTY: KeyPair = { anthropic: "", google: "", fal: "" };

/**
 * Keys live in this browser and nowhere else. They are sent as request headers
 * at generation time and are never stored server-side.
 */
export function useKeys() {
  const [keys, setKeysState] = useState<KeyPair>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setKeysState({ ...EMPTY, ...JSON.parse(raw) });
    } catch {
      // A blocked or corrupt store just means the user re-enters their keys.
    }
    setLoaded(true);
  }, []);

  const setKeys = useCallback((next: KeyPair) => {
    setKeysState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Non-fatal: the keys still work for this session.
    }
  }, []);

  const headers = useCallback((): Record<string, string> => {
    const out: Record<string, string> = { "content-type": "application/json" };
    if (keys.anthropic) out["x-anthropic-key"] = keys.anthropic;
    if (keys.google) out["x-google-key"] = keys.google;
    if (keys.fal) out["x-fal-key"] = keys.fal;
    return out;
  }, [keys]);

  return { keys, setKeys, headers, loaded };
}
