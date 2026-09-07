"use client";

import { useMemo } from "react";
import styles from "./ElevatorPanel.module.css";
import type { Floor } from "@/lib/ai/types";

/** Four to a row, the way a call panel is laid out. */
const COLUMNS = 4;

interface Props {
  floors: Floor[];
  activeFloorId: string | null;
  onSelect: (floor: Floor) => void;
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
export default function ElevatorPanel({ floors, activeFloorId, onSelect }: Props) {
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

  const call = (floor: Floor | undefined, label: string, key: string) =>
    floor ? (
      <button
        key={key}
        className={styles.call}
        data-lit={floor.id === activeFloorId || undefined}
        onClick={() => onSelect(floor)}
        aria-label={`Go to ${label}`}
        aria-current={floor.id === activeFloorId ? "true" : undefined}
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
