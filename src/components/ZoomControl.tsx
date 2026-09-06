"use client";

import styles from "./ZoomControl.module.css";

export const ZOOM_STEPS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.75, 0.9, 1, 1.25, 1.5, 2];

interface Props {
  zoom: number;
  onChange: (zoom: number) => void;
}

export default function ZoomControl({ zoom, onChange }: Props) {
  const index = ZOOM_STEPS.indexOf(zoom);
  const at = index === -1 ? ZOOM_STEPS.indexOf(1) : index;

  return (
    <div className={styles.control}>
      <span className={styles.label}>
        ZOOM <span className={styles.value}>{Math.round(zoom * 100)}%</span>
      </span>
      <button onClick={() => onChange(ZOOM_STEPS[at - 1])} disabled={at === 0}>
        −
      </button>
      <button onClick={() => onChange(1)} disabled={zoom === 1}>
        100%
      </button>
      <button
        onClick={() => onChange(ZOOM_STEPS[at + 1])}
        disabled={at === ZOOM_STEPS.length - 1}
      >
        +
      </button>
    </div>
  );
}
