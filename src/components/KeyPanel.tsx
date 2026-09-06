"use client";

import { useState } from "react";
import styles from "./KeyPanel.module.css";
import type { KeyPair } from "@/hooks/useKeys";

interface Props {
  keys: KeyPair;
  onChange: (keys: KeyPair) => void;
  serverKeys: boolean;
}

export default function KeyPanel({ keys, onChange, serverKeys }: Props) {
  const [open, setOpen] = useState(false);
  const ready = serverKeys || Boolean(keys.anthropic && keys.fal);

  return (
    <aside className={styles.panel} data-no-pan>
      <button className={styles.header} onClick={() => setOpen(!open)}>
        <span>KEYS</span>
        <span className={styles.dot} data-ready={ready} />
      </button>
      {open && (
        <div className={styles.body}>
          <label className={styles.field}>
            <span>ANTHROPIC — writes the floor</span>
            <input
              type="password"
              value={keys.anthropic}
              placeholder={serverKeys ? "using the host's key" : "sk-ant-..."}
              onChange={(event) => onChange({ ...keys, anthropic: event.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span>FAL — draws the floor</span>
            <input
              type="password"
              value={keys.fal}
              placeholder={serverKeys ? "using the host's key" : "fal key"}
              onChange={(event) => onChange({ ...keys, fal: event.target.value })}
            />
          </label>
          <p className={styles.note}>
            Kept in this browser only, sent with each request, never stored on the
            server. Floors spend your own credit.
          </p>
        </div>
      )}
    </aside>
  );
}
