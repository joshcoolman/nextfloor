"use client";

import { useEffect, useRef, useState } from "react";

/** Native images deliberately preserve the lossless serving asset and exact canvas. */
export default function FloorImage({ src, alt, width, height, enabled, onSettled }: {
  src: string; alt: string; width: number; height: number; enabled: boolean; onSettled: () => void;
}) {
  const image = useRef<HTMLImageElement>(null);
  const settled = useRef(onSettled);
  settled.current = onSettled;
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let finished = false;
    const finish = () => { if (!cancelled) { finished = true; settled.current(); } };
    const fail = () => { if (!cancelled) { setFailed(true); finish(); } };
    const element = image.current;
    const decode = () => {
      if (!element?.naturalWidth) return fail();
      element.decode().then(finish, fail);
    };
    element?.addEventListener("load", decode);
    element?.addEventListener("error", fail);
    const timer = setTimeout(() => { if (!finished) fail(); }, 20000);
    if (element?.complete) decode();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      element?.removeEventListener("load", decode);
      element?.removeEventListener("error", fail);
    };
  }, [enabled, src, attempt]);
  if (!enabled || failed) return (
    <div style={{ width, height, display: "grid", placeItems: "center", color: "var(--ink-faint)", lineHeight: 1.5 }}>
      {failed && <button onClick={(event) => { event.stopPropagation(); setFailed(false); setAttempt((n) => n + 1); }}>Image unavailable · Retry</button>}
    </div>
  );
  return <img key={attempt} ref={image} src={src} alt={alt} width={width} height={height} decoding="async" draggable={false} />;
}
