"use client";

import { useState } from "react";
import styles from "./Navigator.module.css";
import type { PlacedFloor } from "@/lib/building/layout";

interface Props {
  placed: PlacedFloor[];
  onSelect: (floor: PlacedFloor) => void;
}

export default function Navigator({ placed, onSelect }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <nav className={styles.panel} data-no-pan>
      <button className={styles.header} onClick={() => setOpen(!open)}>
        <span>FLOORS</span>
        <span>{open ? "—" : "+"}</span>
      </button>
      {open && (
        <div className={styles.list}>
          {placed.map((item) => (
            <button
              key={item.floor.id}
              className={styles.row}
              data-dead={item.floor.status === "dead"}
              onClick={() => onSelect(item)}
            >
              <span className={styles.ordinal}>
                {item.floor.kind === "roof" ? "RF" : item.floor.kind === "basement" ? "B" : item.label}
              </span>
              <span className={styles.name}>{item.floor.displayName}</span>
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
