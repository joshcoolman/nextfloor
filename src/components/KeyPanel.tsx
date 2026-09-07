"use client";

import styles from "./KeyPanel.module.css";
import type { KeyPair } from "@/hooks/useKeys";

interface Props {
  keys: KeyPair;
  onChange: (keys: KeyPair) => void;
  serverKeys: boolean;
}

/**
 * Portalled to the body for the same reason the delete dialog is: the control
 * rail sets backdrop-filter, which makes it a containing block for
 * fixed-position descendants and would clip a full-screen backdrop to the rail.
 */
export default function KeyPanel({ keys, onChange, serverKeys }: Props) {
  return (
    <div className={styles.body}>
      <label className={styles.field}>
        <span>ANTHROPIC — WRITES THE FLOOR</span>
        <input
          type="password"
          value={keys.anthropic}
          placeholder="sk-ant-..."
          onChange={(event) => onChange({ ...keys, anthropic: event.target.value })}
        />
      </label>
      <label className={styles.field}>
        <span>FAL — DRAWS THE FLOOR</span>
        <input
          type="password"
          value={keys.fal}
          placeholder="fal key"
          onChange={(event) => onChange({ ...keys, fal: event.target.value })}
        />
      </label>
      <p className={styles.note}>
        Kept in this browser only, sent with each request, never stored on the
        server. Floors spend your own credit.
      </p>
    </div>
  );
}
