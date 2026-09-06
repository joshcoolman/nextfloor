"use client";

import { useEffect, useState } from "react";
import styles from "./AddFloorControl.module.css";

const SUGGESTIONS = [
  "80s video games",
  "mad scientist laboratory",
  "1970s detective office",
  "alien hotel",
  "japanese convenience store",
  "haunted library",
  "cyberpunk noodle market",
];

/** Generation takes a while. Say what is happening rather than showing a spinner. */
const STAGES: Array<[seconds: number, label: string]> = [
  [0, "INTERPRETING THEME"],
  [12, "DRAFTING THE FLOOR PLAN"],
  [26, "POURING CONCRETE"],
  [46, "WIRING THE LIGHTS"],
  [68, "MOVING PEOPLE IN"],
  [95, "SNAGGING"],
];

interface Props {
  busy: boolean;
  disabled: boolean;
  error: string | null;
  onSubmit: (theme: string) => void;
}

export default function AddFloorControl({ busy, disabled, error, onSubmit }: Props) {
  const [theme, setTheme] = useState("");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), 500);
    return () => clearInterval(timer);
  }, [busy]);

  if (busy) {
    const stage = [...STAGES].reverse().find(([at]) => elapsed >= at)?.[1] ?? STAGES[0][1];
    // Asymptotic: always advancing, never claiming to be finished.
    const progress = 4 + 92 * (1 - Math.exp(-elapsed / 55));
    return (
      <div className={styles.dock} data-no-pan>
        <div className={styles.building}>
          <div className={styles.stage}>
            <span>{stage}</span>
            <span className={styles.elapsed}>{Math.floor(elapsed)}s</span>
          </div>
          <div className={styles.bar}>
            <div className={styles.fill} style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dock} data-no-pan>
      <div className={styles.suggestions}>
        {SUGGESTIONS.map((item) => (
          <button key={item} className={styles.suggestion} onClick={() => setTheme(item)}>
            {item}
          </button>
        ))}
      </div>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (theme.trim()) {
            onSubmit(theme.trim());
            setTheme("");
          }
        }}
      >
        <input
          className={styles.input}
          value={theme}
          maxLength={300}
          placeholder="Describe a floor..."
          onChange={(event) => setTheme(event.target.value)}
        />
        <button className={styles.submit} type="submit" disabled={disabled || !theme.trim()}>
          BUILD
        </button>
      </form>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
