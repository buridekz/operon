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
