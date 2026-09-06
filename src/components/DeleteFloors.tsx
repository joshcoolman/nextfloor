"use client";

import { useState } from "react";
import styles from "./DeleteFloors.module.css";
import type { Floor } from "@/lib/ai/types";

interface Props {
  floors: Floor[];
  onDelete: (ids: string[]) => Promise<void>;
}

/**
 * Local-only bulk delete, listed in the same order the building is read: roof
 * first, basement last. Counting down the list matches counting down the tower,
 * which is how you actually find the floor you meant.
 *
 * Static tiles are shown but not selectable. They are the building itself and
 * are re-imported from public/ regardless, so offering to delete them would be
 * offering an action that undoes itself -- but hiding them would break the
 * correspondence with what is on screen.
 */
export default function DeleteFloors({ floors, onDelete }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [working, setWorking] = useState(false);

  const ordered = [...floors].sort((a, b) => b.ordinal - a.ordinal);

  const label = (floor: Floor) =>
    floor.kind === "roof" ? "RF" : floor.kind === "basement" ? "B" : String(Math.round(floor.ordinal));

  return (
    <>
      <div className={styles.count}>
        {selected.length ? `${selected.length} selected` : "Local only"}
      </div>
      <div className={styles.list}>
          {ordered.map((floor) => {
            const fixed = floor.meta?.source === "public";
            return (
              <label
                key={floor.id}
                className={`${styles.row} ${fixed ? styles.fixed : ""}`}
              >
                {fixed ? (
                  <span className={styles.spacer} />
                ) : (
                  <input
                    type="checkbox"
                    checked={selected.includes(floor.id)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, floor.id]
                          : current.filter((id) => id !== floor.id),
                      )
                    }
                  />
                )}
                <span className={styles.ordinal}>{label(floor)}</span>
                <span className={styles.name}>{floor.displayName}</span>
                {fixed && <span className={styles.tag}>STATIC</span>}
                {floor.status === "pending" && <span className={styles.tag}>BUILDING</span>}
                {floor.status === "dead" && <span className={styles.tag}>DEAD</span>}
              </label>
            );
          })}
      </div>

      <button
        className={styles.confirm}
        disabled={working || selected.length === 0}
        onClick={async () => {
          setWorking(true);
          try {
            await onDelete(selected);
            setSelected([]);
          } finally {
            setWorking(false);
          }
        }}
      >
        {working ? "DELETING..." : "DELETE SELECTED"}
      </button>
    </>
  );
}
