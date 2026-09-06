"use client";

import { useEffect, useState } from "react";
import styles from "./AddFloorControl.module.css";
import { EFFORTS, type Effort } from "@/lib/ai/types";

/** Where an unsent description is kept, so a reload does not eat it. */
const DRAFT_KEY = "nextfloor.draft";
const EFFORT_KEY = "nextfloor.effort";

interface Props {
  busy: boolean;
  /** Floors currently under construction. */
  pending: number;
  disabled: boolean;
  error: string | null;
  /** Resolves false when the floor could not be started, so the draft is kept. */
  onSubmit: (theme: string, effort: Effort) => Promise<boolean>;
  /** Called once a floor is actually under way, to dismiss the panel. */
  onDone: () => void;
}

export default function AddFloorControl({ busy, pending, disabled, error, onSubmit, onDone }: Props) {
  const [theme, setTheme] = useState("");
  const [effort, setEffort] = useState<Effort>("medium");

  // Restoring a draft has to happen after mount: the server has no localStorage,
  // and rendering the stored value directly would mismatch the server's markup.
  useEffect(() => {
    try {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) setTheme(draft);
      const stored = localStorage.getItem(EFFORT_KEY) as Effort | null;
      if (stored && EFFORTS.includes(stored)) setEffort(stored);
    } catch {
      // A blocked store just means no draft.
    }
  }, []);

  const change = (next: string) => {
    setTheme(next);
    try {
      localStorage.setItem(DRAFT_KEY, next);
    } catch {
      // Non-fatal: the description still works for this session.
    }
  };

  const chooseEffort = (next: Effort) => {
    setEffort(next);
    try {
      localStorage.setItem(EFFORT_KEY, next);
    } catch {
      // Non-fatal.
    }
  };

  const clearDraft = () => {
    setTheme("");
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Non-fatal.
    }
  };

  return (
    <form
      className={styles.dock}
      onSubmit={async (event) => {
        event.preventDefault();
        const description = theme.trim();
        if (!description) return;
        // Only discard the draft once the floor is actually under way. A failed
        // start used to lose whatever had just been typed.
        // Dismiss on success only; a failed start keeps the description.
        if (await onSubmit(description, effort)) {
          clearDraft();
          onDone();
        }
      }}
    >
      <div className={styles.field}>
        <div className={styles.labelRow}>
          <span className={styles.label}>DESCRIBE ROOM</span>
          {theme && (
            <button type="button" className={styles.clear} onClick={clearDraft}>
              CLEAR
            </button>
          )}
        </div>
        <textarea
          className={styles.input}
          value={theme}
          maxLength={2000}
          rows={4}
          placeholder="A 1970s detective office, blinds drawn, smoke in the lamplight..."
          onChange={(event) => change(event.target.value)}
        />
      </div>
      <label className={styles.effort}>
        <span className={styles.label}>EFFORT</span>
        <select
          className={styles.effortSelect}
          value={effort}
          onChange={(event) => chooseEffort(event.target.value as Effort)}
        >
          {EFFORTS.map((option) => (
            <option key={option} value={option}>
              {option.toUpperCase()}
            </option>
          ))}
        </select>
      </label>

      <button
        className={styles.submit}
        type="submit"
        disabled={disabled || busy || !theme.trim()}
      >
        {busy ? "STARTING..." : "CREATE FLOOR"}
      </button>
      {pending > 0 && (
        <p className={styles.pending}>
          {pending} floor{pending === 1 ? "" : "s"} under construction
        </p>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </form>
  );
}
