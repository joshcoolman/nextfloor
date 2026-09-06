"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./Tower.module.css";
import AddFloorControl from "./AddFloorControl";
import DeadFloor from "./DeadFloor";
import KeyPanel from "./KeyPanel";
import Navigator from "./Navigator";
import { useKeys } from "@/hooks/useKeys";
import { usePanZoom } from "@/hooks/usePanZoom";
import { frameOf, placeFloors, towerHeight, type PlacedFloor } from "@/lib/building/layout";
import type { Floor } from "@/lib/ai/types";

export default function Tower() {
  const [floors, setFloors] = useState<Floor[]>([]);
  const [seeded, setSeeded] = useState<boolean | null>(null);
  const [serverKeys, setServerKeys] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newest, setNewest] = useState<string | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const framedRef = useRef(false);

  const { keys, setKeys, headers, loaded } = useKeys();
  const frame = useMemo(() => frameOf(floors), [floors]);
  const placed = useMemo(() => placeFloors(floors, frame), [floors, frame]);
  const height = towerHeight(placed.length, frame);

  const { viewportRef, transform, focusOn, zoomAt } = usePanZoom({
    contentWidth: frame.width,
    contentHeight: height,
  });

  const ready = serverKeys || Boolean(keys.anthropic && keys.fal);

  useEffect(() => {
    const measure = () => setViewportHeight(window.innerHeight);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    fetch("/api/floors")
      .then((response) => response.json())
      .then((data) => {
        setFloors(data.floors);
        setSeeded(data.seeded);
        setServerKeys(data.serverKeys);
      })
      .catch(() => {
        // Show the curtain rather than an empty screen; the error explains why.
        setSeeded(false);
        setError("Could not reach the building. Is DATABASE_URL set?");
      });
  }, []);

  /** Frame the whole tower once, the first time there is something to look at. */
  useEffect(() => {
    if (framedRef.current || placed.length === 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    framedRef.current = true;
    const rect = viewport.getBoundingClientRect();
    const scale = Math.min((rect.width * 0.82) / frame.width, (rect.height * 0.86) / height);
    focusOn(height / 2, scale);
  }, [focusOn, frame.width, height, placed.length, viewportRef]);

  const post = useCallback(
    async (url: string, body?: unknown) => {
      const response = await fetch(url, {
        method: "POST",
        headers: headers(),
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Something went wrong.");
      return data;
    },
    [headers],
  );

  const raiseBuilding = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await post("/api/seed");
      setFloors((current) => [...current, ...(data.floors as Floor[])]);
      setSeeded(true);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Could not raise the building.");
    } finally {
      setBusy(false);
    }
  }, [post]);

  const addFloor = useCallback(
    async (theme: string) => {
      setBusy(true);
      setError(null);
      try {
        const data = await post("/api/floors", { theme });
        const floor = data.floor as Floor;
        setFloors((current) => [...current, floor]);
        setNewest(floor.id);
      } catch (thrown) {
        setError(thrown instanceof Error ? thrown.message : "Floor generation failed.");
      } finally {
        setBusy(false);
      }
    },
    [post],
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

  /** A new floor lands at the top; go and look at it. */
  useEffect(() => {
    if (!newest) return;
    const target = placed.find((item) => item.floor.id === newest);
    if (target) focusOn(target.center, Math.max(transform.scale, 0.42));
    // Only when a floor arrives, not on every pan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newest, placed.length]);

  const jumpTo = useCallback((item: PlacedFloor) => focusOn(item.center), [focusOn]);

  return (
    <>
      <div className={styles.viewport} ref={viewportRef}>
        <div
          className={styles.stage}
          style={{
            width: frame.width,
            height,
            transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
          }}
        >
          {placed.map((item) => (
            <div
              key={item.floor.id}
              className={`${styles.tile} ${item.floor.id === newest ? styles.settle : ""}`}
              style={{ top: item.top, width: frame.width, height: frame.height }}
            >
              {item.floor.status === "dead" ? (
                <DeadFloor floor={item.floor} />
              ) : (
                <img
                  src={`/api/floors/${item.floor.id}/image`}
                  alt={item.floor.displayName}
                  draggable={false}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.gutter}>
        {placed.map((item) => {
          const y = item.center * transform.scale + transform.y;
          if (y < -40 || y > viewportHeight + 40) return null;
          return (
            <div
              key={item.floor.id}
              className={styles.label}
              style={{ top: y }}
              data-dead={item.floor.status === "dead"}
            >
              <span className={styles.labelOrdinal}>
                {item.floor.kind === "roof" ? "RF" : item.floor.kind === "basement" ? "B" : item.label}
              </span>
              <span className={styles.labelName}>{item.floor.displayName}</span>
              <button className={styles.remove} onClick={() => removeFloor(item.floor.id)}>
                DELETE
              </button>
            </div>
          );
        })}
      </div>

      <div className={styles.controls} data-no-pan>
        <button onClick={() => placed[0] && focusOn(placed[0].center)}>TOP</button>
        <button onClick={() => placed.length && focusOn(placed[placed.length - 1].center)}>
          BOTTOM
        </button>
        <button onClick={() => zoomAt(1.35, window.innerWidth / 2, window.innerHeight / 2)}>+</button>
        <button onClick={() => zoomAt(0.74, window.innerWidth / 2, window.innerHeight / 2)}>−</button>
      </div>

      <KeyPanel keys={keys} onChange={setKeys} serverKeys={serverKeys} />
      {placed.length > 0 && <Navigator placed={placed} onSelect={jumpTo} />}

      {seeded && (
        <AddFloorControl busy={busy} disabled={!ready} error={error} onSubmit={addFloor} />
      )}

      {loaded && seeded === false && (
        <div className={styles.curtain}>
          <h1>NEXTFLOOR</h1>
          <p>
            There is no building yet. Raising it generates the lobby, the basement and the
            roof, and the lobby becomes the reference every later floor is matched against.
            This takes a few minutes and spends your own credit.
          </p>
          <button onClick={raiseBuilding} disabled={busy || !ready}>
            {busy ? "BREAKING GROUND..." : ready ? "RAISE THE BUILDING" : "ENTER YOUR KEYS FIRST"}
          </button>
          {error && <p className={styles.curtainError}>{error}</p>}
        </div>
      )}
    </>
  );
}
