"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./ControlPanel.module.css";
import AddFloorControl from "./AddFloorControl";
import DeleteFloors from "./DeleteFloors";
import KeyPanel from "./KeyPanel";
import type { KeyPair } from "@/hooks/useKeys";
import type { Effort, Floor } from "@/lib/ai/types";

type Pane = "add" | "floors" | "keys";

interface Props {
  floors: Floor[];
  busy: boolean;
  pending: number;
  ready: boolean;
  error: string | null;
  onSubmit: (theme: string, effort: Effort) => Promise<boolean>;
  onDelete: (ids: string[]) => Promise<void>;
  keys: KeyPair;
  onKeysChange: (keys: KeyPair) => void;
  serverKeys: boolean;
  showKeys: boolean;
  local: boolean;
  /** Bumped to reopen the dialog on the add pane, e.g. after a condemned floor. */
  reopen?: number;
}

/**
 * One dialog, several panes.
 *
 * Everything used to live in a rail pinned down the right edge, permanently
 * covering a slice of the building for controls that are used occasionally.
 * The responsive trigger is the only lasting chrome; the panes switch inside
 * one dialog rather than stacking dialogs on top of each other.
 */
export default function ControlPanel({
  floors,
  busy,
  pending,
  ready,
  error,
  onSubmit,
  onDelete,
  keys,
  onKeysChange,
  serverKeys,
  showKeys,
  local,
  reopen = 0,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pane, setPane] = useState<Pane>("add");

  useEffect(() => {
    if (reopen === 0) return;
    setPane("add");
    setOpen(true);
  }, [reopen]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const tabs: Array<[Pane, string]> = [
    ["add", "ADD FLOOR"],
    ...(local ? ([["floors", "FLOORS"]] as Array<[Pane, string]>) : []),
    ...(showKeys ? ([["keys", "KEYS"]] as Array<[Pane, string]>) : []),
  ];

  const trigger = (
    <button
      className={styles.add}
      onClick={() => {
        setPane(ready ? "add" : "keys");
        setOpen(true);
      }}
      title="Add a floor"
      aria-label="Add a floor"
    >
      <span className={styles.desktopLabel}>Add floor</span>
      <span className={styles.mobilePlus} aria-hidden="true">+</span>
      {pending > 0 && <span className={styles.badge}>{pending}</span>}
    </button>
  );

  if (!open) return trigger;

  const modal = (
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className={styles.modal}>
        {tabs.length > 1 && (
          <div className={styles.tabs}>
            {tabs.map(([id, label]) => (
              <button
                key={id}
                className={styles.tab}
                data-active={pane === id}
                onClick={() => setPane(id)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className={styles.pane}>
          {pane === "add" && (
            <AddFloorControl
              busy={busy}
              pending={pending}
              disabled={!ready}
              error={error}
              onSubmit={onSubmit}
              onDone={() => setOpen(false)}
            />
          )}
          {pane === "floors" && <DeleteFloors floors={floors} onDelete={onDelete} />}
          {pane === "keys" && (
            <KeyPanel keys={keys} onChange={onKeysChange} serverKeys={serverKeys} />
          )}
        </div>

        <button className={styles.close} onClick={() => setOpen(false)}>
          CLOSE
        </button>
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
