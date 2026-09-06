"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./Tower.module.css";
import AddFloorControl from "./AddFloorControl";
import DeadFloor from "./DeadFloor";
import KeyPanel from "./KeyPanel";
import ZoomControl from "./ZoomControl";
import { useKeys } from "@/hooks/useKeys";
import { frameOf, placeFloors } from "@/lib/building/layout";
import type { Floor } from "@/lib/ai/types";

export default function Tower() {
  const [floors, setFloors] = useState<Floor[]>([]);
  const [serverKeys, setServerKeys] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newest, setNewest] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.6);
  /** ?constructing previews the construction tile without spending a generation. */
  const [preview, setPreview] = useState(false);

  const { keys, setKeys, headers } = useKeys();
  const frame = useMemo(() => frameOf(floors), [floors]);
  const placed = useMemo(() => placeFloors(floors, frame), [floors, frame]);
  const ready = serverKeys || Boolean(keys.anthropic && keys.fal);

  /** How much each tile rides up over the one below it. */
  const overlap = frame.height - frame.pitch;

  /**
   * While a floor generates, a construction tile occupies the slot it will
   * land in, so the building visibly grows a storey rather than the page
   * sitting still for a couple of minutes.
   */
  const items = useMemo(() => {
    const list: Array<{ key: string; placed?: (typeof placed)[number] }> = placed.map((item) => ({
      key: item.floor.id,
      placed: item,
    }));
    if (!busy && !preview) return list;
    const below = list.findIndex((item) => item.placed?.floor.kind !== "roof");
    list.splice(below === -1 ? list.length : below, 0, { key: "under-construction" });
    return list;
  }, [busy, placed, preview]);

  useEffect(() => {
    setPreview(new URLSearchParams(window.location.search).has("constructing"));
    try {
      const stored = Number(localStorage.getItem("nextfloor.zoom"));
      if (stored > 0) setZoom(stored);
    } catch {
      // A blocked store just means the default zoom.
    }
  }, []);

  const changeZoom = useCallback((next: number) => {
    setZoom(next);
    try {
      localStorage.setItem("nextfloor.zoom", String(next));
    } catch {
      // Non-fatal: the zoom still applies for this session.
    }
  }, []);

  useEffect(() => {
    fetch("/api/floors")
      .then((response) => response.json())
      .then((data) => {
        setFloors(data.floors);
        setServerKeys(data.serverKeys);
      })
      .catch(() => setError("Could not reach the building. Is DATABASE_URL set?"));
  }, []);

  const addFloor = useCallback(
    async (theme: string) => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/floors", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ theme }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Floor generation failed.");
        setFloors((current) => [...current, data.floor as Floor]);
        setNewest((data.floor as Floor).id);
      } catch (thrown) {
        setError(thrown instanceof Error ? thrown.message : "Floor generation failed.");
      } finally {
        setBusy(false);
      }
    },
    [headers],
  );

  const removeFloor = useCallback(async (id: string) => {
    const response = await fetch(`/api/floors/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "That floor could not be removed.");
      return;
    }
    setFloors((current) => current.filter((floor) => floor.id !== id));
  }, []);

  /** A new floor lands at the top of the tower; go and look at it. */
  useEffect(() => {
    if (!newest) return;
    document.getElementById(newest)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [newest, placed.length]);

  return (
    <main className={styles.page}>
      {/*
        CSS zoom rather than a transform: zoom takes part in layout, so the page
        height shrinks with it and ordinary scrolling still works. A transform
        would leave the layout box at full size and leave phantom scroll area.
      */}
      <div className={styles.stack} style={{ zoom }}>
        {items.map((entry, index) => {
          const style = {
            width: frame.width,
            height: frame.height,
            marginTop: index === 0 ? 0 : -overlap,
            // Higher floors paint over lower ones. Tiles are laid out
            // top-first, so without this the basement would cover the tower.
            zIndex: items.length - index,
          } as const;

          if (!entry.placed) {
            return (
              <figure
                key={entry.key}
                className={`${styles.tile} ${styles.construction} ${styles.settle}`}
                style={style}
              >
                <img
                  src="/construction-floor.png"
                  alt="Floor under construction"
                  width={frame.width}
                  height={frame.height}
                  draggable={false}
                />
                <span className={styles.scan} />
              </figure>
            );
          }

          const item = entry.placed;
          return (
            <figure
              key={entry.key}
              id={item.floor.id}
              className={`${styles.tile} ${item.floor.id === newest ? styles.settle : ""}`}
              style={style}
            >
              {item.floor.status === "dead" ? (
                <DeadFloor floor={item.floor} />
              ) : (
                <img
                  src={`/api/floors/${item.floor.id}/image`}
                  alt={item.floor.displayName}
                  width={frame.width}
                  height={frame.height}
                  draggable={false}
                />
              )}
              <button className={styles.remove} onClick={() => removeFloor(item.floor.id)}>
                REMOVE
              </button>
            </figure>
          );
        })}
      </div>

      {placed.length === 0 && (
        <p className={styles.empty}>
          No building yet. Add artwork to public/ or check that DATABASE_URL is set.
        </p>
      )}

      <footer className={styles.footer}>
        <AddFloorControl busy={busy} disabled={!ready} error={error} onSubmit={addFloor} />
        <ZoomControl zoom={zoom} onChange={changeZoom} />
        <KeyPanel keys={keys} onChange={setKeys} serverKeys={serverKeys} />
      </footer>
    </main>
  );
}
