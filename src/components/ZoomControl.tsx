"use client";

import styles from "./ZoomControl.module.css";

/** Capped at 100%: past that the tiles are upscaled and the pixel art softens. */
export const ZOOM_STEPS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.75, 0.9, 1];
export const DEFAULT_ZOOM = 0.6;

interface Props {
  zoom: number;
  onChange: (zoom: number) => void;
}

export default function ZoomControl({ zoom, onChange }: Props) {
  const index = ZOOM_STEPS.indexOf(zoom);
  const at = index === -1 ? ZOOM_STEPS.indexOf(DEFAULT_ZOOM) : index;

  return (
    <div className={styles.control} data-controls>
      <button
        className={styles.value}
        onClick={() => onChange(DEFAULT_ZOOM)}
        title="Reset to 60%"
      >
        {Math.round(zoom * 100)}%
      </button>
      <span className={styles.stepper}>
        <button
          className={styles.step}
          onClick={() => onChange(ZOOM_STEPS[at + 1])}
          disabled={at === ZOOM_STEPS.length - 1}
          aria-label="Zoom in"
        >
          ▲
        </button>
        <button
          className={styles.step}
          onClick={() => onChange(ZOOM_STEPS[at - 1])}
          disabled={at === 0}
          aria-label="Zoom out"
        >
          ▼
        </button>
      </span>
    </div>
  );
}
