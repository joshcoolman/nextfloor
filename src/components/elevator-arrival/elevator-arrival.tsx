"use client";

import { useEffect, useState } from "react";
import styles from "./elevator-arrival.module.css";

export default function ElevatorArrival({ ordinals, ready, error, onRetry, onDone }: {
  ordinals: number[];
  ready: boolean;
  error: string | null;
  onRetry: () => void;
  onDone: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (error || ready) return;
    const timer = setInterval(() => setProgress((value) => value + (0.9 - value) * 0.12), 180);
    return () => clearInterval(timer);
  }, [error, ready]);
  useEffect(() => {
    if (!ready || error) return;
    setProgress(1);
    setLeaving(true);
    const timer = setTimeout(onDone, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 400);
    return () => clearTimeout(timer);
  }, [ready, error, onDone]);
  const stops = ["B1", ...ordinals.map(String)];
  const current = Math.min(stops.length - 1, Math.floor(progress * (stops.length - 1)));
  // A moving window stays compact even when the building has thousands of floors.
  const start = Math.max(0, Math.min(current - 3, stops.length - 8));
  return (
    <div className={styles.overlay} data-leaving={leaving || undefined}>
      <div className={styles.panel}>
        <div className={styles.stops} aria-hidden="true">
          {stops.slice(start, start + 8).reverse().map((stop) => (
            <span key={stop} className={styles.stop} data-lit={stop === stops[current] || undefined}>{stop}</span>
          ))}
        </div>
        <p role={error ? "alert" : "status"}>{error ?? "Loading"}</p>
        {error && <button onClick={onRetry}>TRY AGAIN</button>}
      </div>
    </div>
  );
}
