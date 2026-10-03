"use client";

// Short tones so the room hears severity before anyone looks up:
// a soft chime when something is logged, two tones for a warning, three pulses for critical.
import { useEffect, useRef } from "react";
import type { EngineView } from "./engine";

export type Earcon = "logged" | "warning" | "critical";

function tone(ctx: AudioContext, freq: number, start: number, dur: number, gain: number) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.05);
}

export function playEarcon(ctx: AudioContext, kind: Earcon) {
  if (kind === "logged") {
    tone(ctx, 880, 0, 0.18, 0.12);
    tone(ctx, 1320, 0.09, 0.28, 0.1);
  } else if (kind === "warning") {
    tone(ctx, 740, 0, 0.22, 0.18);
    tone(ctx, 554, 0.26, 0.3, 0.18);
  } else {
    for (let i = 0; i < 3; i++) tone(ctx, 988, i * 0.2, 0.14, 0.22);
  }
}

/** Plays a tone for each new Vega line: alerts by severity, a chime for "Logged". */
export function useEarcons(view: EngineView | null, ctx: AudioContext | null) {
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (!view) return;
    const lines = view.transcript.filter((t) => t.who === "sv");
    const latest = lines.at(-1)?.at ?? 0;
    if (seen.current === null) { seen.current = latest; return; } // don't replay history on load
    if (!ctx) { seen.current = latest; return; }
    for (const t of lines.filter((l) => l.at > (seen.current ?? 0))) {
      if (t.severity === "critical") playEarcon(ctx, "critical");
      else if (t.severity === "warning") playEarcon(ctx, "warning");
      else if (/^Logged\b|complete\.$/.test(t.text)) playEarcon(ctx, "logged");
    }
    seen.current = latest;
  }, [view, ctx]);
}
