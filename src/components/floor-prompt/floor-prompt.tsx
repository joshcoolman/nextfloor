"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { Floor } from "@/lib/ai/types";
import styles from "./floor-prompt.module.css";

export default function FloorPrompt({ floor }: { floor: Floor }) {
  const card = useRef<HTMLElement>(null);
  const align = useCallback(() => {
    const tile = document.getElementById(floor.id);
    const button = tile?.querySelector("[data-floor-eye]");
    if (!tile || !button || !card.current) return;
    const desktop = window.matchMedia("(min-width: 641px)").matches;
    const anchor = (desktop ? button : tile).getBoundingClientRect();
    const panel = card.current;
    // Never clamp to the viewport: the prompt leaves the screen with its floor.
    const left = desktop ? anchor.right + 12 : 16;
    const top = desktop ? anchor.top : anchor.top + 32;
    panel.style.setProperty("--prompt-left", `${left}px`);
    panel.style.setProperty("--prompt-top", `${top}px`);
  }, [floor.id]);
  // Camera renders update the anchor before paint, without another state render.
  useLayoutEffect(align);
  useEffect(() => {
    window.addEventListener("resize", align);
    window.addEventListener("scroll", align, true);
    return () => {
      window.removeEventListener("resize", align);
      window.removeEventListener("scroll", align, true);
    };
  }, [align]);
  return (
    <aside ref={card} className={styles.card} aria-label={`Original prompt for floor ${floor.ordinal}`} data-controls data-floor-prompt>
      <div className={styles.heading}>
        <span>FLOOR {floor.ordinal}</span>
      </div>
      <h2>{floor.displayName}</h2>
      <p>{floor.themePrompt}</p>
    </aside>
  );
}
