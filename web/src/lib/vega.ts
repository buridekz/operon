// What ARNIE is doing right now, derived from the engine snapshot. Drives the ring and the tones.
import type { EngineView, Severity, TranscriptLine } from "./engine";

export type ArnieState = "off" | "listening" | "speaking" | "warning" | "critical";

const ALERT_HOLD_MS = 12_000;
/** Roughly how long ARNIE takes to say a line (mirrors the engine's speakingMs). */
export const speakingMs = (text: string) => text.split(/\s+/).length * 330 + 500;

export function lastArnieLine(v: EngineView): TranscriptLine | undefined {
  return [...v.transcript].reverse().find((t) => t.who === "sv");
}

export function vegaState(v: EngineView | null, now: number | null): ArnieState {
  if (!v || !now) return "off";
  const last = lastArnieLine(v);
  const sev: Severity = last?.severity ?? "info";
  if (last && sev !== "info" && now - last.at < ALERT_HOLD_MS) return sev;
  if (last && now - last.at < speakingMs(last.text)) return "speaking";
  return v.agent.running ? "listening" : "off";
}

/** What the orb shows. Adds "thinking" (someone just spoke, no answer yet) to ArnieState. */
export type ArnieMood = "off" | "listening" | "thinking" | "speaking" | "warning" | "critical";
const THINK_MS = 4_000;

export function arnieMood(v: EngineView | null, now: number | null): ArnieMood {
  if (!v || !now) return "off";
  const s = vegaState(v, now);
  if (s !== "listening") return s;
  const lastHeard = [...v.transcript].reverse().find((t) => t.who === "heard");
  const last = lastArnieLine(v);
  if (lastHeard && now - lastHeard.at < THINK_MS && (!last || last.at < lastHeard.at)) return "thinking";
  return "listening";
}

/** The orb animation and the word under it, per mood. */
export const MOOD: Record<ArnieMood, { orb: "listening" | "working" | "composing" | "breathing" | "solving"; word: string; color?: string }> = {
  off: { orb: "breathing", word: "Off" },
  listening: { orb: "listening", word: "Listening" },
  thinking: { orb: "working", word: "Thinking" },
  speaking: { orb: "composing", word: "Speaking" },
  warning: { orb: "solving", word: "Warning", color: "#ffd60a" },
  critical: { orb: "solving", word: "Alert", color: "#ff453a" },
};

/** How many of the four phase ticks are complete: Sign in, Time out, Surgery, Sign out. */
export function phaseTicks(v: EngineView | null): number {
  if (!v) return 0;
  const c = v.checklists;
  return [c.signin.complete, c.timeout.complete, c.signout.complete || v.phase === "signout", c.signout.complete].filter(Boolean).length;
}

export const VEGA_LABEL: Record<ArnieState, string> = {
  off: "ARNIE is off",
  listening: "ARNIE is listening",
  speaking: "ARNIE is speaking",
  warning: "ARNIE raised a warning",
  critical: "ARNIE raised a critical alert",
};
