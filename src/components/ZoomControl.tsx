"use client";

import styles from "./ZoomControl.module.css";

export const ZOOM_STEPS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.75, 0.9, 1, 1.25, 1.5, 2];

interface Props {
  zoom: number;
  onChange: (zoom: number) => void;
}

export default function ZoomControl({ zoom, onChange }: Props) {
  return (
    <div className={styles.control}>
      <span className={styles.label}>
        ZOOM <span className={styles.value}>{Math.round(zoom * 100)}%</span>
      </span>
      <span className={styles.hint}>⌘ scroll · ⌘⇧↑↓</span>
      <button onClick={() => onChange(1)} disabled={zoom === 1}>
        RESET
      </button>
    </div>
  );
}
