"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./ElevatorPanel.module.css";
import { TILE } from "@/lib/building/styleGuide";
import type { Floor } from "@/lib/ai/types";

/** Four to a row, the way a call panel is laid out. */
const COLUMNS = 4;

/**
 * Where a floor actually reads on screen, as a fraction of its tile.
 *
 * Tiles overlap, and a lower floor is drawn under the one above it, so the only
 * part of a floor you ever see is its bottom band -- one pitch tall. Measuring
 * from the tile's centre would light the floor above the one being looked at.
 */
const ANCHOR = 1 - TILE.pitchRatio / 2;

interface Props {
  floors: Floor[];
}

/**
 * Call buttons for the building.
 *
 * Laid out in building order rather than reading order: the bottom row holds
 * the lowest floors, the roof sits above them and the basement below. Pressing
 * up moves you up the screen, and the panel ends up a small map of the tower --
 * including its holes, because a floor number nothing occupies is drawn as a
 * dead socket rather than skipped. Numbers are painted into the artwork and
 * cannot be renumbered, so those holes are real and worth showing.
 */
export default function ElevatorPanel({ floors }: Props) {
  const [lit, setLit] = useState<string | null>(null);

  const { rows, byOrdinal, roof, basement } = useMemo(() => {
    const numbered = new Map<number, Floor>();
    let highest = 0;
    for (const floor of floors) {
      if (floor.kind !== "floor") continue;
      numbered.set(floor.ordinal, floor);
      highest = Math.max(highest, floor.ordinal);
    }
    const built: number[][] = [];
    for (let start = 1; start <= highest; start += COLUMNS) {
      built.push(Array.from({ length: COLUMNS }, (_, offset) => start + offset));
    }
    return {
      // Highest row first, so the panel reads bottom-up like the building.
      rows: built.reverse(),
      byOrdinal: numbered,
      roof: floors.find((floor) => floor.kind === "roof"),
      basement: floors.find((floor) => floor.kind === "basement"),
    };
  }, [floors]);

  /**
   * The lit button follows the scroll position rather than the last press.
   *
   * That is what produces the elevator tick for free: travel is a smooth scroll
   * through every floor in between, so the light walks the panel on the way and
   * lands on the destination. A synthetic animation would have to be kept in
   * agreement with the scroll it was imitating; this cannot drift because it is
   * the same thing.
   */
  useEffect(() => {
    const ids = floors.map((floor) => floor.id);
    const ordered = [...floors].sort((a, b) => a.ordinal - b.ordinal);
    const ends = {
      bottom: ordered[0]?.id ?? null,
      top: ordered[ordered.length - 1]?.id ?? null,
    };
    let queued = 0;

    const measure = () => {
      queued = 0;
      // The caps cannot be scrolled to the middle -- there is no page beyond
      // them to scroll into -- so at either end of the travel the light belongs
      // to the tile you have actually arrived at.
      const doc = document.documentElement;
      if (window.scrollY <= 0) return setLit(ends.top);
      if (window.scrollY + window.innerHeight >= doc.scrollHeight - 2) {
        return setLit(ends.bottom);
      }

      const middle = window.innerHeight / 2;
      let closest: string | null = null;
      let distance = Infinity;
      for (const id of ids) {
        const element = document.getElementById(id);
        if (!element) continue;
        const box = element.getBoundingClientRect();
        const gap = Math.abs(box.top + box.height * ANCHOR - middle);
        if (gap < distance) {
          distance = gap;
          closest = id;
        }
      }
      setLit(closest);
    };

    const onScroll = () => {
      if (!queued) queued = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (queued) cancelAnimationFrame(queued);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [floors]);

  /**
   * Travel puts the floor's own anchor at the middle of the window, which is
   * the same point the lit button is measured from. scrollIntoView centres the
   * tile instead, and because a tile is mostly the floor above's overlap, that
   * landed a floor short: press B1 and 1 stayed lit.
   */
  const go = (floor: Floor) => {
    const element = document.getElementById(floor.id);
    if (!element) return;
    const box = element.getBoundingClientRect();
    const top = window.scrollY + box.top + box.height * ANCHOR - window.innerHeight / 2;
    window.scrollTo({ top, behavior: "smooth" });
  };

  const call = (floor: Floor | undefined, label: string, key: string) =>
    floor ? (
      <button
        key={key}
        className={styles.call}
        data-lit={floor.id === lit || undefined}
        onClick={() => go(floor)}
        aria-label={`Go to ${label}`}
        aria-current={floor.id === lit ? "true" : undefined}
        title={floor.displayName}
      >
        {label}
      </button>
    ) : (
      // A number with no floor behind it. Present, so the gap is visible, and
      // inert in every way: no hover, no press, never lit.
      <span key={key} className={styles.socket} aria-hidden="true" />
    );

  if (!rows.length) return null;

  return (
    <nav className={styles.panel} data-controls aria-label="Floors">
      {roof && call(roof, "R", "roof")}
      {rows.map((row) => (
        <div key={row[0]} className={styles.row}>
          {row.map((ordinal) => call(byOrdinal.get(ordinal), String(ordinal), String(ordinal)))}
        </div>
      ))}
      {basement && call(basement, "B1", "basement")}
    </nav>
  );
}
