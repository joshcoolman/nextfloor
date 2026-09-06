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
  const ready = serverKeys || Boolean(keys.anthropic && keys.google);

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
            <span>GOOGLE — draws the floor</span>
            <input
              type="password"
              value={keys.google}
              placeholder={serverKeys ? "using the host's key" : "AIza..."}
              onChange={(event) => onChange({ ...keys, google: event.target.value })}
            />
          </label>
          <p className={styles.note}>
            Kept in this browser only. Sent with each generation request, never stored
            on the server. Building a floor spends your own credit.
          </p>
        </div>
      )}
    </aside>
  );
}
