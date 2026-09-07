"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { Floor } from "@/lib/ai/types";
import styles from "./floor-prompt.module.css";

export default function FloorPrompt({ floor, onClose }: { floor: Floor; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLElement>(null);
  const align = useCallback(() => {
    if (!window.matchMedia("(min-width: 641px)").matches) return;
    const button = document.getElementById(floor.id)?.querySelector("[data-floor-eye]");
    if (!button || !card.current) return;
    const anchor = button.getBoundingClientRect();
    const panel = card.current;
    // Prefer the button's right edge and top; keep the card inside the screen
    // when a floor is near a viewport edge.
    const left = Math.max(16, Math.min(anchor.right + 12, window.innerWidth - panel.offsetWidth - 16));
    const top = Math.max(16, Math.min(anchor.top, window.innerHeight - panel.offsetHeight - 16));
    panel.style.setProperty("--prompt-left", `${left}px`);
    panel.style.setProperty("--prompt-top", `${top}px`);
  }, [floor.id]);
  // Position when opened; moving the tower dismisses the inspection.
  useLayoutEffect(align, [align]);
  useEffect(() => {
    window.addEventListener("resize", align);
    return () => {
      window.removeEventListener("resize", align);
    };
  }, [align]);
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
    <aside ref={card} className={styles.card} aria-label={`Original prompt for floor ${floor.ordinal}`} data-controls data-floor-prompt>
      <div className={styles.heading}>
        <span>FLOOR {floor.ordinal}</span>
        <button ref={close} onClick={onClose} aria-label="Close floor prompt">CLOSE</button>
      </div>
      <h2>{floor.displayName}</h2>
      <p>{floor.themePrompt}</p>
    </aside>
  );
}
