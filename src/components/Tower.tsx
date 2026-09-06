"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./Tower.module.css";
import CondemnedDialog from "./CondemnedDialog";
import ControlPanel from "./ControlPanel";
import DeadFloor from "./DeadFloor";
import ZoomControl, { DEFAULT_ZOOM, ZOOM_STEPS } from "./ZoomControl";
import { useKeys } from "@/hooks/useKeys";
import { frameOf, placeFloors } from "@/lib/building/layout";
import type { Effort, Floor } from "@/lib/ai/types";

/** Faint rather than gone: the lifted floor still reads as a floor. */
const PEEK_OPACITY = 0.4;

export default function Tower() {
  const [floors, setFloors] = useState<Floor[]>([]);
  const [serverKeys, setServerKeys] = useState(false);
  const [local, setLocal] = useState(false);
  /** ?keys forces the panel open even when the host supplies them. */
  const [forceKeys, setForceKeys] = useState(false);
  const [busy, setBusy] = useState(false);
  const pendingCount = floors.filter((floor) => floor.status === "pending").length;
  const [error, setError] = useState<string | null>(null);
  const [newest, setNewest] = useState<string | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  const [reopen, setReopen] = useState(0);
  /** The floor currently held out of the way so the one below it can be seen. */
  const [peeked, setPeeked] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  /** Floors this browser started, so only its own failures interrupt it. */
  const mine = useRef<Set<string>>(new Set());

  const { keys, setKeys, headers } = useKeys();

  /**
   * A condemned floor is not in the building until someone keeps it. Until
   * then the row exists only to be decided on, so it is not drawn.
   */
  const visible = useMemo(
    () => floors.filter((floor) => floor.status !== "dead" || floor.meta?.kept === true),
    [floors],
  );
  const condemned = useMemo(
    () =>
      floors.find(
        (floor) =>
          floor.status === "dead" && floor.meta?.kept !== true && mine.current.has(floor.id),
      ) ?? null,
    [floors],
  );
  const frame = useMemo(() => frameOf(visible), [visible]);
  const placed = useMemo(() => placeFloors(visible, frame), [visible, frame]);
  const ready = serverKeys || Boolean(keys.anthropic && keys.fal);

  /** How much each tile rides up over the one below it. */
  const overlap = frame.height - frame.pitch;


  useEffect(() => {
    setForceKeys(new URLSearchParams(window.location.search).has("keys"));
  }, []);

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
        const floor = data.floor as Floor;
        mine.current.add(floor.id);
        setFloors((current) => [...current, floor]);
        setNewest(floor.id);
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

  /** Keeps the wreck: the condemned tile becomes part of the tower. */
  const keepCondemned = useCallback(async (id: string) => {
    setDeciding(true);
    try {
      const response = await fetch(`/api/floors/${id}`, { method: "PATCH" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "That floor could not be kept.");
      setFloors((current) =>
        current.map((floor) => (floor.id === id ? (data.floor as Floor) : floor)),
      );
      setNewest(id);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "That floor could not be kept.");
    } finally {
      setDeciding(false);
    }
  }, []);

  /**
   * Clears the wreck and hands the description back, with the panel reopened on
   * it -- a refused theme usually wants an edit, not the same submission again.
   */
  const retryCondemned = useCallback(async (floor: Floor) => {
    setDeciding(true);
    try {
      const response = await fetch(`/api/floors/${floor.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "That floor could not be cleared.");
      }
      mine.current.delete(floor.id);
      setFloors((current) => current.filter((item) => item.id !== floor.id));
      try {
        localStorage.setItem("nextfloor.draft", floor.themePrompt);
      } catch {
        // Non-fatal: the panel just opens empty.
      }
      setReopen((count) => count + 1);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "That floor could not be cleared.");
    } finally {
      setDeciding(false);
    }
  }, []);

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

  /**
   * Clicking a floor holds the one above it out of the way; clicking again puts
   * it back. Tiles overlap -- that is what makes the tower read as one building
   * -- so the floor above always covers the back of the floor below.
   *
   * Only one floor is ever lifted, so clicking a second storey moves the effect
   * there rather than accumulating ghosts to clean up.
   *
   * The roof is never lifted. It is the building's lid rather than a storey, and
   * fading it just punches a hole in the sky.
   */
  const peek = useCallback(
    (index: number) => {
      const over = placed[index - 1]?.floor;
      if (!over || over.kind === "roof") return;
      setPeeked((current) => (current === over.id ? null : over.id));
    },
    [placed],
  );

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

          /*
            A lifted floor drops behind the whole tower rather than only fading.
            Ghosted but still on top, it goes on swallowing clicks aimed at the
            floor it is covering -- so putting it back meant hunting for the
            strip of the storey below that it did not overlap. Behind everything,
            the floor you uncovered is what you click, and clicking it restores
            its neighbour. It stays visible through the gap, so the tower still
            reads as continuous instead of gaining a hole.
          */
          const tileStyle =
            item.floor.id === peeked
              ? { ...style, opacity: PEEK_OPACITY, zIndex: 0 }
              : style;

          if (item.floor.status === "pending") {
            return (
              <figure
                key={item.floor.id}
                id={item.floor.id}
                className={`${styles.tile} ${styles.construction} ${styles.settle}`}
                style={tileStyle}
                title={item.floor.themePrompt}
                onClick={() => peek(index)}
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
              style={tileStyle}
              // A click on the REMOVE button must not also lift a floor.
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("button")) return;
                peek(index);
              }}
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

      <ControlPanel
        floors={floors}
        busy={busy}
        pending={pendingCount}
        ready={ready}
        error={error}
        onSubmit={addFloor}
        onDelete={removeFloors}
        keys={keys}
        onKeysChange={setKeys}
        serverKeys={serverKeys}
        showKeys={!serverKeys || forceKeys}
        local={local}
        reopen={reopen}
      />

      {condemned && (
        <CondemnedDialog
          floor={condemned}
          busy={deciding}
          onRetry={() => retryCondemned(condemned)}
          onKeep={() => keepCondemned(condemned.id)}
        />
      )}

      <ZoomControl zoom={zoom} onChange={changeZoom} />
    </main>
  );
}
