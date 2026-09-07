"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import styles from "./Tower.module.css";
import CondemnedDialog from "./CondemnedDialog";
import ControlPanel from "./ControlPanel";
import ElevatorPanel from "./ElevatorPanel";
import DeadFloor from "./DeadFloor";
import ZoomControl, { DEFAULT_ZOOM } from "./ZoomControl";
import { useKeys } from "@/hooks/useKeys";
import { frameOf, placeFloors, towerHeight } from "@/lib/building/layout";
import { TILE } from "@/lib/building/styleGuide";
import type { Effort, Floor } from "@/lib/ai/types";
import ElevatorArrival from "./elevator-arrival/elevator-arrival";
import FloorPrompt from "./floor-prompt/floor-prompt";
import FloorImage from "./floor-image/floor-image";
import { useTowerImages } from "@/hooks/useTowerImages";
import { NO_SPONSORSHIP, type SponsoredAvailability } from "@/lib/sponsorship/types";

/** Faint rather than gone: the lifted floor still reads as a floor. */
const PEEK_OPACITY = 0.2;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 1;
const DESKTOP_QUERY = "(min-width: 641px)";
const FLOOR_ANCHOR = 1 - TILE.pitchRatio / 2;

interface Camera {
  scale: number;
  x: number;
  y: number;
}

type TowerStyle = CSSProperties & {
  "--control-scale": number;
  "--peek-opacity": number;
};

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12s3.5-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.5 5.5-9.5 5.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export default function Tower({ initialArrival }: { initialArrival: { ordinals: number[]; hasRoof: boolean } }) {
  const [metadataLoaded, setMetadataLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [positioned, setPositioned] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const revealBuilding = useCallback(() => setRevealing(true), []);
  const finishArrival = useCallback(() => setArrived(true), []);
  const retryArrival = useCallback(() => { setLoadError(null); setLoadAttempt((n) => n + 1); }, []);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [serverKeys, setServerKeys] = useState(false);
  const [sponsored, setSponsored] = useState<SponsoredAvailability>(NO_SPONSORSHIP);
  const refreshSponsorship = useCallback(() => {
    fetch("/api/sponsorship").then((response) => { if (!response.ok) throw new Error(); return response.json(); })
      .then(setSponsored).catch(() => setSponsored({ ...NO_SPONSORSHIP, reason: "unavailable" }));
  }, []);
  const submission = useRef<{ theme: string; effort: Effort; own: boolean; id: string } | null>(null);
  const [local, setLocal] = useState(false);
  const [busy, setBusy] = useState(false);
  const pendingCount = floors.filter((floor) => floor.status === "pending").length;
  const [error, setError] = useState<string | null>(null);
  const [newest, setNewest] = useState<string | null>(null);
  const [camera, setCamera] = useState<Camera>({ scale: DEFAULT_ZOOM, x: 0, y: 0 });
  const [desktop, setDesktop] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; time: number; vx: number; vy: number; samples: { x: number; y: number; time: number }[] } | null>(null);
  const dragged = useRef(false);
  const cameraRef = useRef(camera);
  const travel = useRef(0);

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
  const hasAnyKey = Boolean(keys.anthropic.trim() || keys.fal.trim());
  const ready = hasAnyKey ? Boolean(keys.anthropic.trim() && keys.fal.trim()) : sponsored.available;

  /** How much each tile rides up over the one below it. */
  const overlap = frame.height - frame.pitch;
  const contentHeight = towerHeight(placed.length, frame);
  const images = useTowerImages(placed, frame.pitch, camera.scale, camera.y, positioned);
  const closePrompt = useCallback(() => setPeeked(null), []);
  useEffect(() => {
    if (!peeked) return;
    // Mobile scrolls the document vertically; scrolling the prompt itself
    // must remain available for reading long descriptions.
    const dismissOnScroll = (event: Event) => {
      if (event.target === document || event.target === window) closePrompt();
    };
    window.addEventListener("scroll", dismissOnScroll);
    return () => window.removeEventListener("scroll", dismissOnScroll);
  }, [peeked, closePrompt]);
  const revealed = peeked ? placed[placed.findIndex((item) => item.floor.id === peeked) + 1]?.floor : null;
  const arrivalOrdinals = useMemo(() => visible.filter((floor) => floor.kind === "floor").map((floor) => floor.ordinal).sort((a, b) => a - b), [visible]);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem("nextfloor.zoom"));
      if (stored >= MIN_ZOOM && stored <= MAX_ZOOM) {
        setCamera((current) => ({ ...current, scale: stored }));
      }
    } catch {
      // A blocked store just means the default zoom.
    }
  }, []);

  const constrain = useCallback(
    (scale: number, x: number, y: number): Camera => {
      const box = viewport.current?.getBoundingClientRect();
      if (!box) return { scale, x, y };
      const width = frame.width * scale;
      const height = contentHeight * scale;
      return {
        scale,
        x: width <= box.width ? (box.width - width) / 2 : Math.min(0, Math.max(box.width - width, x)),
        y: height <= box.height ? (box.height - height) / 2 : Math.min(0, Math.max(box.height - height, y)),
      };
    },
    [contentHeight, frame.width],
  );

  const rememberZoom = useCallback((scale: number) => {
    try {
      localStorage.setItem("nextfloor.zoom", String(scale));
    } catch {
      // Non-fatal: the zoom still applies for this session.
    }
  }, []);

  const changeZoom = useCallback(
    (next: number, clientX?: number, clientY?: number) => {
      closePrompt();
      cancelAnimationFrame(travel.current);
      const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
      setCamera((current) => {
        const box = viewport.current?.getBoundingClientRect();
        if (!box) return { ...current, scale };
        const anchorX = (clientX ?? box.left + box.width / 2) - box.left;
        const anchorY = (clientY ?? box.top + box.height / 2) - box.top;
        const ratio = scale / current.scale;
        return constrain(
          scale,
          anchorX - (anchorX - current.x) * ratio,
          anchorY - (anchorY - current.y) * ratio,
        );
      });
      rememberZoom(scale);
    },
    [constrain, rememberZoom, closePrompt],
  );

  useEffect(() => {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 20000);
    fetch("/api/floors", { signal: abort.signal })
      .then((response) => { if (!response.ok) throw new Error(); return response.json(); })
      .then((data) => {
        if (!Array.isArray(data.floors)) throw new Error();
        setFloors(data.floors);
        setServerKeys(data.serverKeys);
        setSponsored(data.sponsored ?? NO_SPONSORSHIP);
        setLocal(Boolean(data.local));
        setMetadataLoaded(true);
      })
      .catch(() => { if (!abort.signal.aborted || !ignore) setLoadError("Could not reach the building."); })
      .finally(() => clearTimeout(timeout));
    let ignore = false;
    return () => { ignore = true; clearTimeout(timeout); abort.abort(); };
  }, [loadAttempt]);

  useEffect(() => {
    if (!metadataLoaded || positioned) return;
    const target = placed.find((item) => item.floor.kind === "floor") ?? placed[0];
    if (window.matchMedia(DESKTOP_QUERY).matches) {
      const height = viewport.current?.getBoundingClientRect().height ?? window.innerHeight;
      setCamera((current) => constrain(current.scale, current.x,
        target ? height / 2 - (target.top + frame.height * FLOOR_ANCHOR) * current.scale : 0));
    } else if (target) {
      if (viewport.current) viewport.current.scrollLeft = Math.max(0, (viewport.current.scrollWidth - viewport.current.clientWidth) / 2);
      document.getElementById(target.floor.id)?.scrollIntoView({ block: "center", behavior: "instant" });
    }
    setPositioned(true);
  }, [metadataLoaded, positioned, placed, constrain, frame.height]);

  const addFloor = useCallback(
    async (theme: string, effort: Effort): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        if (!submission.current) {
          try { submission.current = JSON.parse(sessionStorage.getItem("nextfloor.submission") ?? "null"); } catch { /* Optional recovery. */ }
        }
        if (!submission.current || submission.current.theme !== theme || submission.current.effort !== effort || submission.current.own !== hasAnyKey) {
          submission.current = { theme, effort, own: hasAnyKey, id: crypto.randomUUID() };
        }
        try { sessionStorage.setItem("nextfloor.submission", JSON.stringify(submission.current)); } catch { /* In-memory idempotency still works. */ }
        const response = await fetch("/api/floors", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ theme, effort, requestId: submission.current.id }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Could not start that floor.");
        const floor = data.floor as Floor;
        mine.current.add(floor.id);
        setFloors((current) => current.some((item) => item.id === floor.id) ? current : [...current, floor]);
        setNewest(floor.id);
        submission.current = null;
        try { sessionStorage.removeItem("nextfloor.submission"); } catch { /* Non-fatal. */ }
        return true;
      } catch (thrown) {
        setError(thrown instanceof Error ? thrown.message : "Could not start that floor.");
        return false;
      } finally {
        setBusy(false);
        fetch("/api/floors").then((r) => r.ok ? r.json() : null).then((data) => {
          if (data?.sponsored) setSponsored(data.sponsored);
        }).catch(() => {});
      }
    },
    [headers, hasAnyKey],
  );

  /** Plain wheel zooms the desktop stage around the pointer. Controls retain
   * their ordinary wheel behavior because they live outside the viewport. */
  useEffect(() => {
    const element = viewport.current;
    if (!element || !desktop) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      closePrompt();
      cancelAnimationFrame(travel.current);
      setCamera((current) => {
        const box = element.getBoundingClientRect();
        const anchorX = event.clientX - box.left;
        const anchorY = event.clientY - box.top;
        const scale = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, current.scale * Math.exp(-event.deltaY * 0.0015)),
        );
        const ratio = scale / current.scale;
        rememberZoom(scale);
        return constrain(
          scale,
          anchorX - (anchorX - current.x) * ratio,
          anchorY - (anchorY - current.y) * ratio,
        );
      });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [constrain, desktop, rememberZoom, closePrompt]);

  const travelTo = useCallback((y: number) => {
    cancelAnimationFrame(travel.current);
    const from = cameraRef.current.y;
    const distance = Math.abs(y - from);
    if (distance < 1) return;
    const duration = Math.min(700, Math.max(280, distance * 0.18));
    const started = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      setCamera((current) => ({ ...current, y: from + (y - from) * eased }));
      if (progress < 1) travel.current = requestAnimationFrame(tick);
    };

    travel.current = requestAnimationFrame(tick);
  }, []);

  /** Velocity is in screen pixels/ms; exponential decay feels the same at
   * different refresh rates. Share travel's cancellation with navigation. */
  const coast = useCallback((vx: number, vy: number) => {
    cancelAnimationFrame(travel.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let previous = performance.now();
    let position = cameraRef.current;
    const tick = (now: number) => {
      const elapsed = Math.min(32, now - previous);
      previous = now;
      // Slow frames should not kill momentum or jump the camera ahead.
      if (document.hidden) return;
      const decay = Math.exp(-elapsed / 500);
      const distance = 500 * (1 - decay);
      const x = position.x + vx * distance;
      const y = position.y + vy * distance;
      position = constrain(position.scale, x, y);
      vx = Math.abs(position.x - x) > 0.01 ? 0 : vx * decay;
      vy = Math.abs(position.y - y) > 0.01 ? 0 : vy * decay;
      cameraRef.current = position;
      setCamera(position);
      if (Math.hypot(vx, vy) > 0.02) travel.current = requestAnimationFrame(tick);
    };
    travel.current = requestAnimationFrame(tick);
  }, [constrain]);

  useEffect(() => () => cancelAnimationFrame(travel.current), [coast, desktop]);

  /** Keep the camera legal after resizing, adding floors, or changing artwork. */
  useEffect(() => {
    if (!desktop) return;
    const reframe = () => {
      cancelAnimationFrame(travel.current);
      setViewportHeight(viewport.current?.getBoundingClientRect().height ?? 0);
      setCamera((current) => constrain(current.scale, current.x, current.y));
    };
    reframe();
    window.addEventListener("resize", reframe);
    return () => window.removeEventListener("resize", reframe);
  }, [constrain, desktop]);

  const focusFloor = useCallback(
    (floor: Floor) => {
      setPeeked(null);
      images.prioritize(placed.findIndex((item) => item.floor.id === floor.id));
      if (!desktop) {
        document.getElementById(floor.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      const item = placed.find((candidate) => candidate.floor.id === floor.id);
      const box = viewport.current?.getBoundingClientRect();
      if (!item || !box) return;
      const current = cameraRef.current;
      const target = constrain(
        current.scale,
        current.x,
        box.height / 2 - (item.top + frame.height * FLOOR_ANCHOR) * current.scale,
      );
      travelTo(target.y);
    },
    [constrain, desktop, frame.height, placed, travelTo, images.prioritize],
  );

  const activeFloorId = useMemo(() => {
    if (!desktop || placed.length === 0 || viewportHeight === 0) return null;
    const scaledHeight = contentHeight * camera.scale;
    if (scaledHeight > viewportHeight) {
      if (camera.y >= -1) return placed[0].floor.id;
      if (camera.y + scaledHeight <= viewportHeight + 1) {
        return placed[placed.length - 1].floor.id;
      }
    }
    const middle = (viewportHeight / 2 - camera.y) / camera.scale;
    let closest = placed[0];
    let distance = Infinity;
    for (const item of placed) {
      const gap = Math.abs(item.top + frame.height * FLOOR_ANCHOR - middle);
      if (gap < distance) {
        closest = item;
        distance = gap;
      }
    }
    return closest.floor.id;
  }, [camera.scale, camera.y, contentHeight, desktop, frame.height, placed, viewportHeight]);

  /** Poll while anything is under construction, and stop when nothing is. */
  useEffect(() => {
    if (pendingCount === 0) return;
    const timer = setInterval(() => {
      fetch("/api/floors")
        .then((response) => response.json())
        .then((data) => { if (Array.isArray(data.floors)) setFloors(data.floors); if (data.sponsored) setSponsored(data.sponsored); })
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
   * The roof lifts like anything else. It was excluded on the theory that it is
   * the building's lid rather than a storey, but it overlaps the top floor
   * exactly as every other tile overlaps its neighbour -- and the top floor is
   * the one with no other way to see its back.
   */
  const peek = useCallback(
    (index: number) => {
      cancelAnimationFrame(travel.current);
      const over = placed[index - 1]?.floor;
      if (!over) return;
      setPeeked((current) => (current === over.id ? null : over.id));
    },
    [placed],
  );

  const peekControl = (index: number) => {
    const covered = placed[index - 1]?.floor;
    if (!covered) return null;
    const active = peeked === covered.id;
    return (
      <button
        className={styles.peek}
        data-floor-eye
        data-active={active || undefined}
        aria-label={`${active ? "Restore" : "Reveal"} ${placed[index].floor.displayName}`}
        aria-pressed={active}
        title={`${active ? "Restore" : "Reveal"} full floor`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => peek(index)}
      >
        <EyeIcon />
      </button>
    );
  };

  /** A new floor lands at the top of the tower; go and look at it. */
  useEffect(() => {
    if (!newest) return;
    const floor = visible.find((item) => item.id === newest);
    if (floor) focusFloor(floor);
  }, [focusFloor, newest, placed.length, visible]);

  const peekOpacity = Math.min(1, Math.max(0, (camera.scale - 0.32) / (0.55 - 0.32)));

  return (
    <main className={styles.page} aria-busy={!arrived} data-arriving={!arrived && revealing || undefined}
      onClick={(event) => {
        // Drag clicks are already suppressed by the viewport. Bubble after
        // floor taps so an outside tap closes instead of reopening the reveal.
        if (peeked && !(event.target as Element).closest("[data-floor-eye], [data-floor-prompt]")) closePrompt();
      }}
    >
      <div
        ref={viewport}
        onScroll={closePrompt}
        inert={!arrived}
        className={styles.viewport}
        onPointerDown={(event) => {
          if (!desktop || event.button !== 0) return;
          cancelAnimationFrame(travel.current);
          drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, vx: 0, vy: 0,
            samples: [{ x: event.clientX, y: event.clientY, time: event.timeStamp }] };
          dragged.current = false;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start || start.pointerId !== event.pointerId) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.abs(dx) + Math.abs(dy) > 2) {
            dragged.current = true;
            closePrompt();
          }
          const samples = [...start.samples, { x: event.clientX, y: event.clientY, time: event.timeStamp }];
          // A short history avoids letting the final tiny movement erase a flick.
          while (samples.length > 2 && samples[1].time < event.timeStamp - 120) samples.shift();
          const first = samples[0];
          const elapsed = Math.max(8, event.timeStamp - first.time);
          drag.current = {
            pointerId: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, samples,
            vx: Math.max(-3, Math.min(3, (event.clientX - first.x) / elapsed)),
            vy: Math.max(-3, Math.min(3, (event.clientY - first.y) / elapsed)),
          };
          setCamera((current) => constrain(current.scale, current.x + dx, current.y + dy));
        }}
        onPointerUp={(event) => {
          const release = drag.current;
          if (release?.pointerId !== event.pointerId) return;
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          const decay = Math.exp(-Math.max(0, event.timeStamp - release.time - 40) / 180);
          if (dragged.current) coast(release.vx * decay, release.vy * decay);
        }}
        onPointerCancel={() => {
          cancelAnimationFrame(travel.current);
          drag.current = null;
          dragged.current = false;
        }}
        onLostPointerCapture={() => { drag.current = null; }}
        onClickCapture={(event) => {
          if (!dragged.current) return;
          event.stopPropagation();
          dragged.current = false;
        }}
      >
      <div
        className={styles.stack}
        style={(
          desktop
            ? {
                width: frame.width,
                height: contentHeight,
                transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`,
                "--control-scale": 1 / camera.scale,
                "--peek-opacity": peekOpacity,
              }
            : {
                zoom: camera.scale,
                "--control-scale": 1 / camera.scale,
                "--peek-opacity": peekOpacity,
              }
        ) as TowerStyle}
      >
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
                onClick={() => {
                  if (!desktop) peek(index);
                }}
              >
                <FloorImage
                  enabled={images.requested.has(`${item.floor.id}:${item.floor.status}`)}
                  onSettled={() => images.markSettled(`${item.floor.id}:${item.floor.status}`)}
                  src="/construction-floor.png"
                  alt={`Under construction: ${item.floor.themePrompt}`}
                  width={frame.width}
                  height={frame.height}
                />
                <span className={styles.scan} />
                {peekControl(index)}
              </figure>
            );
          }

          return (
            <figure
              key={item.floor.id}
              id={item.floor.id}
              className={`${styles.tile} ${item.floor.id === newest ? styles.settle : ""}`}
              style={tileStyle}
              onClick={(event) => {
                if (!desktop && !(event.target as HTMLElement).closest("button")) peek(index);
              }}
            >
              {item.floor.status === "dead" ? (
                <DeadFloor floor={item.floor} />
              ) : (
                <FloorImage
                  enabled={images.requested.has(`${item.floor.id}:${item.floor.status}`)}
                  onSettled={() => images.markSettled(`${item.floor.id}:${item.floor.status}`)}
                  src={`/api/floors/${item.floor.id}/image`}
                  alt={item.floor.displayName}
                  width={frame.width}
                  height={frame.height}
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
              {peekControl(index)}
            </figure>
          );
        })}
      </div>

      {metadataLoaded && placed.length === 0 && (
        <p className={styles.empty}>
          No floors yet. Be the first to add one.
        </p>
      )}
      </div>

      <div className={styles.elevatorControls} data-controls inert={!arrived} style={{ visibility: arrived ? "visible" : "hidden" }}>
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
          sponsored={sponsored}
          onOpen={refreshSponsorship}
          showKeys={true}
          local={local}
          reopen={reopen}
        />
        <ElevatorPanel
          floors={visible}
          activeFloorId={activeFloorId}
          onSelect={focusFloor}
        />
      </div>

      {condemned && (
        <CondemnedDialog
          floor={condemned}
          busy={deciding}
          onRetry={() => retryCondemned(condemned)}
          onKeep={() => keepCondemned(condemned.id)}
        />
      )}

      {arrived && <ZoomControl zoom={camera.scale} onChange={changeZoom} />}
      {arrived && revealed?.kind === "floor" && <FloorPrompt floor={revealed} onClose={closePrompt} />}
      {!arrived && <ElevatorArrival ordinals={metadataLoaded ? arrivalOrdinals : initialArrival.ordinals} hasRoof={metadataLoaded ? visible.some((floor) => floor.kind === "roof") : initialArrival.hasRoof} ready={images.ready} error={loadError} onRetry={retryArrival} onReveal={revealBuilding} onDone={finishArrival} />}
    </main>
  );
}
