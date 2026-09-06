"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./Tower.module.css";
import AddFloorControl from "./AddFloorControl";
import DeadFloor from "./DeadFloor";
import KeyPanel from "./KeyPanel";
import ZoomControl, { DEFAULT_ZOOM, ZOOM_STEPS } from "./ZoomControl";
import DeleteFloors from "./DeleteFloors";
import { useKeys } from "@/hooks/useKeys";
import { frameOf, placeFloors } from "@/lib/building/layout";
import type { Effort, Floor } from "@/lib/ai/types";

export default function Tower() {
  const [floors, setFloors] = useState<Floor[]>([]);
  const [serverKeys, setServerKeys] = useState(false);
  const [local, setLocal] = useState(false);
  const [busy, setBusy] = useState(false);
  const pendingCount = floors.filter((floor) => floor.status === "pending").length;
  const [error, setError] = useState<string | null>(null);
  const [newest, setNewest] = useState<string | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  const { keys, setKeys, headers } = useKeys();
  const frame = useMemo(() => frameOf(floors), [floors]);
  const placed = useMemo(() => placeFloors(floors, frame), [floors, frame]);
  const ready = serverKeys || Boolean(keys.anthropic && keys.fal);

  /** How much each tile rides up over the one below it. */
  const overlap = frame.height - frame.pitch;


  useEffect(() => {
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
        setLocal(Boolean(data.local));
      })
      .catch(() => setError("Could not reach the building. Is DATABASE_URL set?"));
  }, []);

  const addFloor = useCallback(
    async (theme: string, effort: Effort): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/floors", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ theme, effort }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Could not start that floor.");
        setFloors((current) => [...current, data.floor as Floor]);
        setNewest((data.floor as Floor).id);
        return true;
      } catch (thrown) {
        setError(thrown instanceof Error ? thrown.message : "Could not start that floor.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [headers],
  );

  /**
   * Zoom by keyboard and modifier-wheel rather than by clicking buttons.
   *
   * The wheel listener must be non-passive: ctrl/cmd + wheel is how browsers
   * report pinch zoom, and only preventDefault stops the whole page zooming
   * instead of the building. Cmd/ctrl + shift + arrows is the keyboard route --
   * plain + and - belong to the browser and cannot be taken.
   */
  useEffect(() => {
    const step = (direction: 1 | -1) => {
      setZoom((current) => {
        const index = ZOOM_STEPS.indexOf(current);
        const from = index === -1 ? ZOOM_STEPS.indexOf(DEFAULT_ZOOM) : index;
        const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, from + direction))];
        try {
          localStorage.setItem("nextfloor.zoom", String(next));
        } catch {
          // Non-fatal.
        }
        return next;
      });
    };

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if ((event.target as HTMLElement)?.closest("[data-controls]")) return;
      event.preventDefault();
      step(event.deltaY < 0 ? 1 : -1);
    };

    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return;
      if (event.key === "ArrowUp") {
        event.preventDefault();
        step(1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        step(-1);
      }
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  /** Poll while anything is under construction, and stop when nothing is. */
  useEffect(() => {
    if (pendingCount === 0) return;
    const timer = setInterval(() => {
      fetch("/api/floors")
        .then((response) => response.json())
        .then((data) => setFloors(data.floors))
        .catch(() => {});
    }, 8000);
    return () => clearInterval(timer);
  }, [pendingCount]);

  const removeFloors = useCallback(async (ids: string[]) => {
    const removed: string[] = [];
    for (const id of ids) {
      const response = await fetch(`/api/floors/${id}`, { method: "DELETE" });
      if (response.ok) {
        removed.push(id);
        continue;
      }
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "That floor could not be removed.");
    }
    if (removed.length) {
      setFloors((current) => current.filter((floor) => !removed.includes(floor.id)));
    }
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
        {placed.map((item, index) => {
          const style = {
            width: frame.width,
            height: frame.height,
            marginTop: index === 0 ? 0 : -overlap,
            // Higher floors paint over lower ones. Tiles are laid out
            // top-first, so without this the basement would cover the tower.
            zIndex: placed.length - index,
          } as const;

          if (item.floor.status === "pending") {
            return (
              <figure
                key={item.floor.id}
                id={item.floor.id}
                className={`${styles.tile} ${styles.construction} ${styles.settle}`}
                style={style}
                title={item.floor.themePrompt}
              >
                <img
                  src="/construction-floor.png"
                  alt={`Under construction: ${item.floor.themePrompt}`}
                  width={frame.width}
                  height={frame.height}
                  draggable={false}
                />
                <span className={styles.scan} />
              </figure>
            );
          }

          return (
            <figure
              key={item.floor.id}
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
              {local && (
                <button
                  className={styles.remove}
                  onClick={() => removeFloors([item.floor.id])}
                >
                  REMOVE
                </button>
              )}
            </figure>
          );
        })}
      </div>

      {placed.length === 0 && (
        <p className={styles.empty}>
          No building yet. Add artwork to public/ or check that DATABASE_URL is set.
        </p>
      )}

      <footer className={styles.footer} data-controls>
        <AddFloorControl
          busy={busy}
          pending={pendingCount}
          disabled={!ready}
          error={error}
          onSubmit={addFloor}
        />
        <ZoomControl zoom={zoom} onChange={changeZoom} />
        <KeyPanel keys={keys} onChange={setKeys} serverKeys={serverKeys} />
        {local && <DeleteFloors floors={floors} onDelete={removeFloors} />}
      </footer>
    </main>
  );
}
