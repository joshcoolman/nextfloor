"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [working, setWorking] = useState(false);

  const ordered = [...floors].sort((a, b) => b.ordinal - a.ordinal);

  const close = () => {
    setOpen(false);
    setSelected([]);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const label = (floor: Floor) =>
    floor.kind === "roof" ? "RF" : floor.kind === "basement" ? "B" : String(Math.round(floor.ordinal));

  const trigger = (
    <button className={styles.trigger} onClick={() => setOpen(true)}>
      DELETE FLOORS
    </button>
  );

  if (!open) return trigger;

  /*
   * Portalled to the body on purpose. The control rail sets backdrop-filter,
   * which makes it a containing block for fixed-position descendants -- so a
   * full-screen backdrop rendered inside it gets clipped to the rail.
   */
  const modal = (
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className={styles.modal}>
        <div className={styles.heading}>
          <span>DELETE FLOORS</span>
          <span>{selected.length ? `${selected.length} SELECTED` : "LOCAL ONLY"}</span>
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

        <div className={styles.actions}>
          <button onClick={close} disabled={working}>
            CANCEL
          </button>
          <button
            className={styles.confirm}
            disabled={working || selected.length === 0}
            onClick={async () => {
              setWorking(true);
              try {
                await onDelete(selected);
                close();
              } finally {
                setWorking(false);
              }
            }}
          >
            {working ? "DELETING..." : "DELETE"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {trigger}
      {createPortal(modal, document.body)}
    </>
  );
}
