"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./elevator-arrival.module.css";

export default function ElevatorArrival({ ordinals, hasRoof, ready, error, onRetry, onReveal, onDone }: {
  ordinals: number[];
  hasRoof: boolean;
  ready: boolean;
  error: string | null;
  onRetry: () => void;
  onDone: () => void;
  onReveal: () => void;
}) {
  const [current, setCurrent] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const currentRef = useRef(current);
  currentRef.current = current;
  const highest = Math.max(0, ...ordinals);
  const present = new Set(ordinals);
  const rows = Array.from({ length: Math.ceil(highest / 4) }, (_, row) =>
    Array.from({ length: 4 }, (_, column) => row * 4 + column + 1)).reverse();
  useEffect(() => {
    if (error || ready) return;
    const timer = setInterval(() => setCurrent((value) => Math.min(Math.max(0, highest - 1), value + 1)), 700);
    return () => clearInterval(timer);
  }, [error, ready, highest]);
  useEffect(() => {
    if (!ready || error) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { onDone(); return; }
    const from = currentRef.current;
    const started = performance.now();
    const duration = Math.min(650, Math.max(100, (highest - from) * 45));
    let frame = 0;
    let pause: ReturnType<typeof setTimeout>;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      setCurrent(from + Math.floor((highest - from) * progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else pause = setTimeout(() => setLeaving(true), 100);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); clearTimeout(pause); };
  }, [ready, error, onDone, highest]);
  useEffect(() => {
    if (!leaving) return;
    onReveal();
    const timer = setTimeout(onDone, 400);
    return () => clearTimeout(timer);
  }, [leaving, onDone, onReveal]);
  return (
    <div className={styles.overlay} data-elevator-arrival data-leaving={leaving || undefined}>
      <div className={styles.panel}>
        <div className={styles.stops} aria-hidden="true">
          {hasRoof && <span className={styles.stop}>R</span>}
          {rows.map((row) => <div className={styles.row} data-floor-row key={row[0]}>
            {row.map((ordinal) => <span key={ordinal} className={styles.stop} data-empty={!present.has(ordinal) || undefined} data-lit={ordinal === current || undefined}>{ordinal <= highest ? ordinal : ""}</span>)}
          </div>)}
          <span className={styles.stop} data-lit={current === 0 || undefined}>B1</span>
        </div>
        <p role={error ? "alert" : "status"}>{error ?? "Loading"}</p>
        {error && <button onClick={onRetry}>TRY AGAIN</button>}
      </div>
    </div>
  );
}
