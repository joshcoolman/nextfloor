"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlacedFloor } from "@/lib/building/layout";

export function useTowerImages(placed: PlacedFloor[], pitch: number, scale: number, y: number, positioned: boolean) {
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [required, setRequired] = useState<string[] | null>(null);
  const [settled, setSettled] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!positioned) return;
    const measure = () => {
      const near: string[] = [];
      const inView: string[] = [];
      const first = placed[0] && document.getElementById(placed[0].floor.id)?.getBoundingClientRect();
      for (const { floor, top } of placed) {
        if (floor.status === "dead") continue;
        if (!first) continue;
        const tileTop = first.top + top * scale;
        const tileBottom = tileTop + first.height;
        const key = `${floor.id}:${floor.status}`;
        if (tileBottom > -2 * pitch * scale && tileTop < window.innerHeight + 2 * pitch * scale) near.push(key);
        if (tileBottom > 0 && tileTop < window.innerHeight) inView.push(key);
      }
      setRequested((previous) => near.every((key) => previous.has(key)) ? previous : new Set([...previous, ...near]));
      setRequired((previous) => previous?.join() === inView.join() ? previous : inView);
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => { window.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); };
  }, [placed, pitch, scale, y, positioned]);
  const markSettled = useCallback((key: string) => setSettled((previous) => previous.has(key) ? previous : new Set([...previous, key])), []);
  const prioritize = useCallback((index: number) => {
    setRequested((previous) => new Set([...previous, ...placed.slice(Math.max(0, index - 2), index + 3).map(({ floor }) => `${floor.id}:${floor.status}`)]));
  }, [placed]);
  return { requested, markSettled, prioritize, ready: positioned && required !== null && required.every((key) => settled.has(key)) };
}
