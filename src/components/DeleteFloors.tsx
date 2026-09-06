"use client";

import { useState } from "react";
import styles from "./DeleteFloors.module.css";
import type { Floor } from "@/lib/ai/types";

interface Props {
  floors: Floor[];
  onDelete: (ids: string[]) => Promise<void>;
}

/**
 * Local-only bulk delete. Generated floors only: the static roof, reference
 * floor and basement are the building itself and are re-imported anyway.
 */
export default function DeleteFloors({ floors, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [working, setWorking] = useState(false);

  const deletable = floors
    .filter((floor) => floor.meta?.source !== "public")
    .sort((a, b) => b.ordinal - a.ordinal);

  const close = () => {
    setOpen(false);
    setSelected([]);
  };

  if (!open) {
    return (
      <button className={styles.trigger} onClick={() => setOpen(true)}>
        DELETE FLOORS
      </button>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.heading}>
        <span>DELETE FLOORS</span>
        <span>{selected.length ? `${selected.length} SELECTED` : "LOCAL ONLY"}</span>
      </div>

      {deletable.length === 0 ? (
        <p className={styles.empty}>No generated floors to delete.</p>
      ) : (
        <div className={styles.list}>
          {deletable.map((floor) => (
            <label key={floor.id} className={styles.row}>
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
              <span className={styles.ordinal}>{Math.round(floor.ordinal)}</span>
              <span className={styles.name}>{floor.displayName}</span>
            </label>
          ))}
        </div>
      )}

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
  );
}
