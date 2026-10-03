"use client";

// ARNIE's presence: a dotted thought-orb (thinking-orbs, MIT) drawn at any size. The package's
// <ThinkingOrb> ships tuned 64/32/20 px presets; its engine draws in a 300 px design space, so the
// same frames render crisply at wall-screen scale here. Monochrome by default; an alert tints it.
import { useEffect, useRef } from "react";
import { MODE_FRAMES, paintFrame, resolvePreset, type OrbState } from "thinking-orbs/engine";

export type { OrbState };

type Props = {
  state: OrbState;
  /** CSS px. */
  size: number;
  /** Multiplier on the state's tuned speed; can change every frame (e.g. with the mic level). */
  speed?: number;
  paused?: boolean;
  /** Hex ink for alerts; omit for the default light ink. */
  color?: string;
  label: string;
  className?: string;
};

function tintOf(hex?: string) {
  const m = hex?.match(/^#([0-9a-f]{6})$/i);
  if (!m) return undefined;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function ArnieOrb({ state, size, speed = 1, paused = false, color, label, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const speedRef = useRef(speed);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const { mode, speed: base, opts } = resolvePreset(state, 64);
    const frameOf = MODE_FRAMES[mode];
    const tint = tintOf(color);
    const draw = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      paintFrame(ctx, frameOf(size, t, opts), true, tint);
    };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || paused) { draw(0.6); return; }

    let t = 0;
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      t += ((now - last) / 1000) * base * speedRef.current;
      last = now;
      draw(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame((now) => { last = now; loop(now); });
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (document.visibilityState === "visible") raf = requestAnimationFrame((now) => { last = now; loop(now); });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", onVisibility); };
  }, [state, size, paused, color]);

  return <canvas ref={ref} role="img" aria-label={label} className={className} style={{ width: size, height: size }} />;
}
