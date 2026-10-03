"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/vega-ring";
import { cn } from "@/lib/utils";
import { engine } from "@/lib/engine";
import { joinChannel, type Call } from "@/lib/rtc";
import { useEngineState } from "@/lib/use-engine";

/** Two-tone ring using Web Audio (needs one tap first: browsers block sound before a gesture). */
function ringOnce(ctx: AudioContext) {
  [0, 0.18].forEach((off, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = i ? 1046 : 1318;
    g.gain.setValueAtTime(0.0001, ctx.currentTime + off);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + off + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + off + 0.16);
    o.connect(g).connect(ctx.destination);
    o.start(ctx.currentTime + off);
    o.stop(ctx.currentTime + off + 0.2);
  });
}

export function SpecialistPhone() {
  const { view } = useEngineState();
  const [audio, setAudio] = useState<AudioContext | null>(null);
  // The consult we answered, identified by its start time; "joined" is derived from it.
  // "connected" turns true once the call is actually up (after the mic permission prompt).
  const [answered, setAnswered] = useState<{ start: number; connected: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const callRef = useRef<Call | null>(null);

  const consult = view?.consult ?? null;
  const joined = !!consult && answered?.start === consult.start && consult.state !== "ended";
  const connected = joined && !!answered?.connected;
  const ringing = consult?.state === "ringing" && !joined;

  // Ring while a consult is waiting to be answered.
  useEffect(() => {
    if (!ringing || !audio) return;
    ringOnce(audio);
    const id = setInterval(() => ringOnce(audio), 1200);
    return () => clearInterval(id);
  }, [ringing, audio]);

  // Leave the channel when the OR ends the consult.
  useEffect(() => {
    if (consult?.state === "ended" && callRef.current) {
      void callRef.current.leave();
      callRef.current = null;
    }
  }, [consult?.state]);

  useEffect(() => () => void callRef.current?.leave(), []);

  async function answer() {
    setError(null);
    if (!consult) return;
    const start = consult.start;
    try {
      setAnswered({ start, connected: false });
      callRef.current = await joinChannel("specialist");
      setAnswered({ start, connected: true });
      const { brief } = await engine<{ brief: string | null }>("/api/consult/joined", {});
      if (!brief) { // the OR ended the call while we were connecting
        await callRef.current?.leave();
        callRef.current = null;
        setAnswered(null);
      }
    } catch (e) {
      setAnswered(null);
      setError((e as Error).message);
    }
  }

  /** Hang up or decline: tell the OR, so ARNIE says so and goes back to normal. */
  async function hangUp() {
    await callRef.current?.leave();
    callRef.current = null;
    setAnswered(null);
    await engine("/api/consult/end", {}).catch(() => {});
  }

  const brief = consult ? [...(view?.transcript ?? [])].reverse().find((t) => t.who === "sv" && t.text.startsWith(consult.doctor)) : undefined;
  const state = connected ? "Connected" : joined ? "Connecting…" : consult?.state === "ringing" ? "Ringing…" : consult?.state === "ended" ? "Ended" : consult ? "Live" : "Idle";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
      <Logo size={26} className="self-center" />
      <Card className={cn("transition-shadow", (ringing || joined) && "ring-2 ring-teal", ringing && "animate-pulse")}>
        <CardHeader>
          <CardTitle className="font-heading text-3xl">{consult?.doctor ?? "On call"}</CardTitle>
          <CardDescription>
            {consult
              ? `${consult.specialty[0].toUpperCase()}${consult.specialty.slice(1)} · ${view?.case.room} ${connected ? "is on the line" : "is calling"}`
              : "Waiting for a consult request"}
          </CardDescription>
          <CardAction>
            <Badge className="bg-teal-soft font-mono text-teal">{state}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!audio && !joined && (
            <Button variant="secondary" size="lg" onClick={() => setAudio(new AudioContext())}>
              Tap once to enable the ringer
            </Button>
          )}
          {!consult && !joined && (
            <p className="text-muted-foreground">Keep this page open. When the operating room says &ldquo;call vascular&rdquo;, this phone rings.</p>
          )}
          {ringing && (
            <div className="grid grid-cols-2 gap-3">
              <Button size="lg" onClick={answer}>Answer</Button>
              <Button size="lg" variant="secondary" onClick={hangUp}>Decline</Button>
            </div>
          )}
          {joined && (
            <>
              {!connected && <p className="text-muted-foreground">Allow the microphone when your browser asks.</p>}
              {brief && (
                <blockquote className="border-l-[3px] border-teal pl-3 text-lg leading-snug">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-teal">ARNIE briefing</span>
                  {brief.text}
                </blockquote>
              )}
              <Button variant="secondary" size="lg" onClick={hangUp}>Hang up</Button>
            </>
          )}
          {error && <p className="text-sm text-destructive">Could not join: {error}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
