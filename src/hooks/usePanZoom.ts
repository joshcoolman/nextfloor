"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface Transform {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.08;
const MAX_SCALE = 4;
const FRICTION = 0.94;
const MIN_VELOCITY = 0.02;

interface Options {
  contentWidth: number;
  contentHeight: number;
}

/**
 * Pan and zoom over the tower. Wheel pans, modifier-wheel and pinch zoom at the
 * cursor, drag throws with momentum. The tower is tall and mostly empty at the
 * sides, so clamping keeps content on screen without feeling like a cage.
 */
export function usePanZoom({ contentWidth, contentHeight }: Options) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 0.3 });
  const stateRef = useRef(transform);
  const velocityRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef<number | null>(null);
  const animationRef = useRef<number | null>(null);
  const sizeRef = useRef({ contentWidth, contentHeight });
  sizeRef.current = { contentWidth, contentHeight };

  const commit = useCallback((next: Transform) => {
    stateRef.current = next;
    setTransform(next);
  }, []);

  const clamp = useCallback((next: Transform): Transform => {
    const viewport = viewportRef.current;
    if (!viewport) return next;
    const { width, height } = viewport.getBoundingClientRect();
    const { contentWidth: cw, contentHeight: ch } = sizeRef.current;

    const scaledWidth = cw * next.scale;
    const scaledHeight = ch * next.scale;
    // Half a viewport of slack past each end, so the tower can be framed
    // against empty space rather than jammed against the edge.
    const slackX = width * 0.5;
    const slackY = height * 0.5;

    return {
      scale: next.scale,
      x: Math.min(slackX, Math.max(width - scaledWidth - slackX, next.x)),
      y: Math.min(slackY, Math.max(height - scaledHeight - slackY, next.y)),
    };
  }, []);

  const zoomAt = useCallback(
    (factor: number, clientX: number, clientY: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const current = stateRef.current;
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor));
      const ratio = scale / current.scale;
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      commit(
        clamp({
          scale,
          x: px - (px - current.x) * ratio,
          y: py - (py - current.y) * ratio,
        }),
      );
    },
    [clamp, commit],
  );

  /** Centres a content-space y coordinate in the viewport, with a short ease. */
  const focusOn = useCallback(
    (contentY: number, scale?: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      velocityRef.current = { x: 0, y: 0 };

      const rect = viewport.getBoundingClientRect();
      const from = stateRef.current;
      const targetScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale ?? from.scale));
      const to = clamp({
        scale: targetScale,
        x: rect.width / 2 - (sizeRef.current.contentWidth / 2) * targetScale,
        y: rect.height / 2 - contentY * targetScale,
      });

      const start = performance.now();
      const duration = 520;
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        // easeOutCubic: fast departure, soft landing.
        const e = 1 - Math.pow(1 - t, 3);
        commit({
          x: from.x + (to.x - from.x) * e,
          y: from.y + (to.y - from.y) * e,
          scale: from.scale + (to.scale - from.scale) * e,
        });
        if (t < 1) animationRef.current = requestAnimationFrame(step);
      };
      animationRef.current = requestAnimationFrame(step);
    },
    [clamp, commit],
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        zoomAt(Math.exp(-event.deltaY * 0.01), event.clientX, event.clientY);
        return;
      }
      const current = stateRef.current;
      commit(clamp({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
    };

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let lastTime = 0;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest("[data-no-pan]")) return;
      dragging = true;
      viewport.setPointerCapture(event.pointerId);
      viewport.style.cursor = "grabbing";
      lastX = event.clientX;
      lastY = event.clientY;
      lastTime = performance.now();
      velocityRef.current = { x: 0, y: 0 };
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      const now = performance.now();
      const dt = Math.max(1, now - lastTime);
      velocityRef.current = { x: (dx / dt) * 16, y: (dy / dt) * 16 };
      lastX = event.clientX;
      lastY = event.clientY;
      lastTime = now;
      const current = stateRef.current;
      commit(clamp({ ...current, x: current.x + dx, y: current.y + dy }));
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      viewport.releasePointerCapture(event.pointerId);
      viewport.style.cursor = "grab";

      const glide = () => {
        const velocity = velocityRef.current;
        if (Math.abs(velocity.x) < MIN_VELOCITY && Math.abs(velocity.y) < MIN_VELOCITY) return;
        const current = stateRef.current;
        commit(clamp({ ...current, x: current.x + velocity.x, y: current.y + velocity.y }));
        velocityRef.current = { x: velocity.x * FRICTION, y: velocity.y * FRICTION };
        frameRef.current = requestAnimationFrame(glide);
      };
      frameRef.current = requestAnimationFrame(glide);
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("pointerup", onPointerUp);
    viewport.addEventListener("pointercancel", onPointerUp);

    return () => {
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", onPointerUp);
      viewport.removeEventListener("pointercancel", onPointerUp);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [clamp, commit, zoomAt]);

  return { viewportRef, transform, focusOn, zoomAt };
}
