"use client";

import { useEffect, useState } from "react";
import styles from "./AddFloorControl.module.css";
import { EFFORTS, type Effort } from "@/lib/ai/types";
import type { SponsoredAvailability, Suggestion } from "@/lib/sponsorship/types";

/** Where an unsent description is kept, so a reload does not eat it. */
const DRAFT_KEY = "nextfloor.draft";
const EFFORT_KEY = "nextfloor.effort";

interface Props {
  busy: boolean;
  /** Floors currently under construction. */
  pending: number;
  disabled: boolean;
  error: string | null;
  sponsored: SponsoredAvailability;
  usingOwnKeys: boolean;
  /** Resolves false when the floor could not be started, so the draft is kept. */
  onSubmit: (theme: string, effort: Effort) => Promise<boolean>;
  /** Called once a floor is actually under way, to dismiss the panel. */
  onDone: () => void;
}

export default function AddFloorControl({ busy, pending, disabled, error, sponsored, usingOwnKeys, onSubmit, onDone }: Props) {
  const [theme, setTheme] = useState("");
  const [effort, setEffort] = useState<Effort>("medium");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const hasDraft = Boolean(theme);
  useEffect(() => {
    if (!draftLoaded || hasDraft) return;
    const abort = new AbortController();
    fetch("/api/suggestions", { method: "POST", signal: abort.signal })
      .then((response) => response.json())
      .then((data) => {
        if (!Array.isArray(data.suggestions) || !data.suggestions.length) return;
        let offset = 0;
        try {
          const stored = JSON.parse(sessionStorage.getItem("nextfloor.suggestions") ?? "null");
          if (stored?.batch === data.batchId) offset = Number(stored.offset) || 0;
          sessionStorage.setItem("nextfloor.suggestions", JSON.stringify({ batch: data.batchId, offset: offset + 3 }));
        } catch { /* Storage is optional. */ }
        setSuggestions(Array.from({ length: Math.min(3, data.suggestions.length) }, (_, n) => data.suggestions[(offset + n) % data.suggestions.length]));
      }).catch(() => {});
    return () => abort.abort();
  }, [draftLoaded, hasDraft]);

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
    setDraftLoaded(true);
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
        if (await onSubmit(description, usingOwnKeys ? effort : "medium")) {
          clearDraft();
          onDone();
        }
      }}
    >
      <div className={styles.field}>
        <div className={styles.labelRow}>
          <label htmlFor="room-description" className={styles.label}>DESCRIBE ROOM</label>
          {theme && (
            <button type="button" className={styles.clear} onClick={clearDraft}>
              CLEAR
            </button>
          )}
        </div>
        <textarea
          id="room-description"
          className={styles.input}
          value={theme}
          maxLength={2000}
          rows={4}
          placeholder="A 1970s detective office, blinds drawn, smoke in the lamplight..."
          onChange={(event) => change(event.target.value)}
        />
      </div>
      {draftLoaded && !theme && suggestions.length > 0 && <div className={styles.suggestions} aria-label="Room ideas">
        {suggestions.map((suggestion) => <button type="button" key={suggestion.label} onClick={() => { change(suggestion.prompt); document.getElementById("room-description")?.focus(); }}>{suggestion.label}</button>)}
      </div>}
      {usingOwnKeys && <label className={styles.effort}>
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
      </label>}
      <p className={styles.allowance}>
        {usingOwnKeys ? (disabled ? "Enter both keys in Keys to use your own credit." : "Using your own keys. The free allowance does not apply.") :
          sponsored.available ? `${sponsored.remainingToday} free floor attempt${sponsored.remainingToday === 1 ? "" : "s"} remaining today, shared by everyone.` :
          sponsored.reason === "monthly_limit" ? "This month's free allowance is used up. You can still bring your own keys." :
          sponsored.reason === "daily_limit" ? "Today's free floors have been claimed. You can still bring your own keys." :
          sponsored.reason === "resetting" ? "The free allowance resets shortly. You can still bring your own keys." :
          "Bring your own Anthropic and fal keys in Keys to create a floor."}
        {!usingOwnKeys && sponsored.enabled && sponsored.resetAt && <span> Resets {new Date(sponsored.resetAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.</span>}
      </p>

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
