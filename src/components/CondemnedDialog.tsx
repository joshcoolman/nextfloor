"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import styles from "./CondemnedDialog.module.css";
import type { Floor } from "@/lib/ai/types";

interface Props {
  floor: Floor;
  busy: boolean;
  /** Clears the floor and hands the description back for another go. */
  onRetry: () => void;
  /** Puts the condemned storey into the building. */
  onKeep: () => void;
}

/**
 * What happens when a floor cannot be built.
 *
 * The failure is a decision rather than a notification: nothing is added to the
 * building unless the visitor says so. Keeping it is the only way a condemned
 * floor ever appears, so one in the wild means a person chose it.
 */
export default function CondemnedDialog({ floor, busy, onRetry, onKeep }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onRetry();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onRetry]);

  const refused = floor.meta?.refusal === true;

  return createPortal(
    <div className={styles.backdrop}>
      <div className={styles.modal} role="alertdialog" aria-labelledby="condemned-title">
        <div className={styles.tape} />
        <div className={styles.body}>
          <h2 className={styles.title} id="condemned-title">
            FLOOR CONDEMNED
          </h2>
          <p className={styles.lead}>
            {refused
              ? "The inspector would not sign off on this one."
              : "Construction stopped before the floor was finished."}
          </p>
          <p className={styles.theme}>&ldquo;{floor.themePrompt}&rdquo;</p>
          {floor.failureReason && <p className={styles.reason}>{floor.failureReason}</p>}
        </div>
        <div className={styles.actions}>
          <button className={styles.action} onClick={onRetry} disabled={busy}>
            TRY AGAIN
          </button>
          <button className={styles.action} data-keep onClick={onKeep} disabled={busy}>
            LEAVE IT STANDING
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
