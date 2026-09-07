"use client";

import { useEffect, useRef } from "react";
import type { Floor } from "@/lib/ai/types";
import styles from "./floor-prompt.module.css";

export default function FloorPrompt({ floor, onClose }: { floor: Floor; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus({ preventScroll: true });
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", dismiss);
    return () => {
      window.removeEventListener("keydown", dismiss);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [onClose]);
  return (
    <aside className={styles.card} aria-label={`Original prompt for floor ${floor.ordinal}`} data-controls>
      <div className={styles.heading}>
        <span>FLOOR {floor.ordinal}</span>
        <button ref={close} onClick={onClose} aria-label="Close floor prompt">CLOSE</button>
      </div>
      <h2>{floor.displayName}</h2>
      <p>{floor.themePrompt}</p>
    </aside>
  );
}
