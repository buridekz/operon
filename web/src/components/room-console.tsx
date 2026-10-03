"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type * as React from "react";
import Link from "next/link";
import { Check, ChevronRight, CircleStop, Keyboard, Mic, MicOff, MonitorUp, X } from "lucide-react";
import { ArnieOrb } from "@/components/arnie-orb";
import { Logo } from "@/components/vega-ring";
import { cn } from "@/lib/utils";
import { engine, type CaseSetup } from "@/lib/engine";
import { useEarcons } from "@/lib/earcons";
import { joinChannel, type Call } from "@/lib/rtc";
import { useEngineState } from "@/lib/use-engine";
import { MOOD, arnieMood, lastArnieLine } from "@/lib/vega";

type Step = "case" | "mic" | "live";
const STEPS: { key: Step; label: string }[] = [
  { key: "case", label: "Case setup" },
  { key: "mic", label: "Mic check" },
  { key: "live", label: "Live" },
];

type Field = { name: string; label: string; value: string; hint?: string; wide?: boolean };
const GROUPS: { title: string; fields: Field[] }[] = [
  {
    title: "Patient",
    fields: [
      { name: "patient", label: "Patient name", value: "Juan Cruz" },
      { name: "room", label: "Operating room", value: "OR 3" },
    ],
  },
  {
    title: "Procedure",
    fields: [
      { name: "procedure", label: "Procedure", value: "Exploration and repair, left femoral artery", wide: true },
      { name: "site", label: "Surgical site", value: "left thigh" },
      { name: "summary", label: "One-line summary", value: "58-year-old male, left femoral bleed", hint: "ARNIE reads this to a specialist you call in." },
      { name: "specialists", label: "On-call specialists", value: "vascular: Dr. Valdez; orthopedics: Dr. Lim; anesthesia: Dr. Ramos", hint: "Specialty: name, separated by semicolons. Say “ARNIE, call vascular” or the doctor’s name.", wide: true },
    ],
  },
  {
    title: "Safety",
    fields: [
      { name: "allergies", label: "Allergies", value: "penicillin", hint: "Separate with commas. ARNIE speaks up when a drug, brand name or skin prep it hears conflicts." },
      { name: "orders", label: "Ordered medications", value: "cefazolin 2 g", hint: "From the chart, separated by semicolons. ARNIE compares any dose it hears with these. It never suggests a dose." },
      { name: "potassium", label: "Pre-op potassium", value: "3.9" },
      { name: "hemoglobin", label: "Pre-op hemoglobin", value: "9.8" },
    ],
  },
];

function caseFromForm(form: HTMLFormElement): CaseSetup {
  const f = new FormData(form);
  const get = (k: string) => String(f.get(k) ?? "").trim();
  return {
    patient: get("patient"), room: get("room"), summary: get("summary"), procedure: get("procedure"), site: get("site"),
    allergies: get("allergies").split(",").map((s) => s.trim()).filter(Boolean),
    preop: { potassium: get("potassium"), hemoglobin: get("hemoglobin") },
    orders: get("orders"),
    specialists: get("specialists"),
  };
}

function useNow() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tickNow = () => setNow(Date.now());
    const first = setTimeout(tickNow, 0);
    const id = setInterval(tickNow, 500);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);
  return now;
}

function StepCount({ step }: { step: Step }) {
  const i = STEPS.findIndex((s) => s.key === step);
  return <p className="text-[13px] text-label-3" aria-label="Setup progress">Step {i + 1} of {STEPS.length} · {STEPS[i].label}</p>;
}

/** A capsule in the floating control bar. */
function Capsule({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-full px-4 text-[15px] font-medium text-foreground transition-colors hover:bg-white/[0.08] disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

function ControlBar({ children, fade }: { children: React.ReactNode; fade?: boolean }) {
  return (
    <nav
      aria-label="Controls"
      className={cn(
        "pointer-events-none fixed inset-x-0 z-20 flex justify-center px-4",
        fade ? "bottom-0 bg-gradient-to-t from-black via-black/85 to-transparent pb-6 pt-14" : "bottom-6",
      )}
    >
      <div className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-tile p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.7)] ring-1 ring-white/[0.08]">
        {children}
      </div>
    </nav>
  );
}

const primaryCapsule = "bg-foreground px-6 text-black hover:bg-white";

export function RoomConsole() {
  const { view } = useEngineState();
  const now = useNow();
  const callRef = useRef<Call | null>(null);
  const [step, setStep] = useState<Step>("case");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [denoise, setDenoise] = useState(false);
  const [heardSomething, setHeardSomething] = useState(false);
  const [level, setLevel] = useState(0);
  const [audio, setAudio] = useState<AudioContext | null>(null);
  const [rehearsal, setRehearsal] = useState("");
  const [typing, setTyping] = useState(false);
  useEarcons(view, audio);

  // Mic level, which also drives the orb during the mic check.
  useEffect(() => {
    const id = setInterval(() => {
      const l = callRef.current?.mic.getVolumeLevel() ?? 0;
      setLevel(l);
      if (l > 0.08) setHeardSomething(true);
    }, 120);
    return () => clearInterval(id);
  }, []);

  // Leave the channel if the page closes mid-session.
  useEffect(() => () => void callRef.current?.leave(), []);

  async function saveCase(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const setup = caseFromForm(e.currentTarget); // read before any await
    setBusy(true);
    setError(null);
    try {
      const cfg = await engine<{ ready: boolean }>("/api/config");
      if (!cfg.ready) throw new Error("The engine is missing its Agora credentials (engine/.env).");
      await engine("/api/case", setup);
      setStep("mic");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function turnOnMic() {
    setBusy(true);
    setError(null);
    try {
      await callRef.current?.leave();
      callRef.current = await joinChannel("room");
      setDenoise(callRef.current.denoise);
      setMicOn(true);
    } catch (err) {
      setError(`Couldn't open the microphone: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function startArnie() {
    setBusy(true);
    setError(null);
    setAudio((a) => a ?? new AudioContext()); // created on a click, so browsers allow the alert tones
    try {
      await engine("/api/start", {});
      setStep("live");
    } catch (err) {
      setError(`ARNIE couldn't start: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  // Pause: the room mic goes silent and the engine ignores speech, so the team can talk about
  // ARNIE (or explain a demo) without it reacting. Press M, or say "ARNIE, pause listening".
  const [micMuted, setMicMuted] = useState(false);
  const paused = !!view?.paused || micMuted;
  async function togglePause() {
    const next = !paused;
    await callRef.current?.mic.setMuted(next).catch(() => {});
    setMicMuted(next);
    await engine("/api/listen", { paused: next }).catch(() => {});
  }
  useEffect(() => {
    if (step !== "live") return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key.toLowerCase() !== "m" || e.metaKey || e.ctrlKey || e.altKey || el?.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      void togglePause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function stop() {
    setBusy(true);
    await engine("/api/stop", {}).catch(() => {});
    await callRef.current?.leave();
    callRef.current = null;
    setMicOn(false);
    setHeardSomething(false);
    setLevel(0);
    setTyping(false);
    setStep("case");
    setBusy(false);
  }

  async function back() {
    await callRef.current?.leave();
    callRef.current = null;
    setMicOn(false);
    setHeardSomething(false);
    setStep("case");
  }

  async function rehearse(e: FormEvent) {
    e.preventDefault();
    const text = rehearsal.trim();
    if (!text) return;
    setRehearsal("");
    // A typed "ARNIE, resume" also undoes the pause button (which mutes the mic here).
    if (paused && /\b(resume|wake up|start listening|unmute|i'?m back)\b/i.test(text)) return void (await togglePause());
    await engine("/api/simulate", { text });
  }

  const mood = micMuted ? "paused" : arnieMood(view, now);
  const m = MOOD[mood];
  const lastArnie = view ? lastArnieLine(view) : undefined;
  const sev = lastArnie?.severity ?? "info";
  const line = paused
    ? "Press M, or say “ARNIE, resume”, when you need me."
    : lastArnie?.text ?? "Say “ARNIE, brief me” to begin.";

  return (
    <main className="relative flex min-h-dvh flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 px-5 pt-5 sm:px-8 sm:pt-7">
        <Logo size={24} />
        {step === "live" ? (
          <p className="flex items-center gap-2 text-[15px] text-label-2">
            <span aria-hidden className={cn("size-2 rounded-full", view?.agent.running && !paused ? "bg-teal" : "bg-label-3")} />
            {view?.case.room} · {view?.case.patient}
          </p>
        ) : (
          <StepCount step={step} />
        )}
      </header>

      {error && (
        <p role="alert" className="mx-auto mt-6 max-w-xl rounded-2xl bg-critical-soft px-5 py-3 text-[15px] text-critical">{error}</p>
      )}

      {step === "case" && (
        <form id="case" onSubmit={saveCase} className="mx-auto w-full max-w-2xl px-4 pb-32 pt-10 sm:px-6">
          <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">New case</h1>
          <p className="mt-1 text-[17px] text-label-2">Set this up before anyone scrubs. It&apos;s the only typing in the whole case.</p>
          {GROUPS.map((g) => (
            <fieldset key={g.title} className="mt-8">
              <legend className="mb-2 px-4 text-[13px] text-label-2">{g.title}</legend>
              <div className="tile divide-y divide-white/[0.08] overflow-hidden !rounded-[22px]">
                {g.fields.map((f) => (
                  <div key={f.name} className="grid gap-1 px-4 py-3 transition-colors focus-within:bg-white/[0.03] sm:grid-cols-[180px_1fr] sm:items-center sm:gap-4">
                    <label htmlFor={f.name} className="text-[15px] text-label-2">{f.label}</label>
                    <input
                      id={f.name}
                      name={f.name}
                      defaultValue={f.value}
                      aria-describedby={f.hint ? `${f.name}-hint` : undefined}
                      className="w-full min-w-0 bg-transparent text-[17px] text-foreground caret-white outline-none placeholder:text-label-3"
                    />
                  </div>
                ))}
              </div>
              {g.fields.filter((f) => f.hint).map((f) => (
                <p key={f.name} id={`${f.name}-hint`} className="mt-2 px-4 text-[13px] leading-snug text-label-3">{f.hint}</p>
              ))}
            </fieldset>
          ))}
          <ControlBar fade>
            <Capsule type="submit" form="case" disabled={busy} className={primaryCapsule}>
              Continue <ChevronRight className="size-4" aria-hidden />
            </Capsule>
          </ControlBar>
        </form>
      )}

      {step === "mic" && (
        <section className="flex flex-1 flex-col items-center justify-center px-4 pb-32 text-center" aria-labelledby="mic-title">
          <ArnieOrb
            state="listening"
            size={220}
            speed={micOn ? 0.35 + level * 5 : 0.3}
            paused={!micOn}
            label="Microphone check"
            className={cn("transition-opacity duration-500", !micOn && "opacity-40")}
          />
          <h1 id="mic-title" className="mt-10 text-[34px] font-semibold leading-tight tracking-[-0.02em]">Check the microphone</h1>
          <p className="mt-2 max-w-md text-[17px] text-label-2" aria-live="polite">
            {!micOn ? "Place this device where the whole team can be heard."
              : heardSomething ? <span className="inline-flex items-center gap-1.5"><Check className="size-4 text-teal" aria-hidden />ARNIE can hear the room.</span>
                : "Say a few words. The orb moves with your voice."}
          </p>
          {micOn && (
            <p className="mt-3 text-[13px] text-label-3">
              {denoise ? "AI noise suppression is on." : "AI noise suppression isn't available in this browser. Use desktop Chrome or Edge for a noisy room."}
            </p>
          )}
          <ControlBar>
            <Capsule onClick={back} disabled={busy}>Back</Capsule>
            {!micOn ? (
              <Capsule onClick={turnOnMic} disabled={busy} className={primaryCapsule}>
                <Mic className="size-4" aria-hidden /> Turn on microphone
              </Capsule>
            ) : (
              <Capsule onClick={startArnie} disabled={busy} className={primaryCapsule}>Start ARNIE</Capsule>
            )}
          </ControlBar>
        </section>
      )}

      {step === "live" && (
        <section className="flex flex-1 flex-col items-center justify-center px-4 pb-36 text-center" aria-labelledby="live-title">
          <ArnieOrb
            state={m.orb}
            size={280}
            color={m.color}
            speed={mood === "paused" || mood === "off" ? 0.25 : 1}
            label={`ARNIE: ${m.word}`}
            className={cn("transition-opacity duration-700", (mood === "paused" || mood === "off") && "opacity-35")}
          />
          <h1
            id="live-title"
            aria-live="polite"
            className={cn(
              "mt-8 text-[44px] font-semibold leading-none tracking-[-0.03em] transition-colors",
              mood === "critical" && "text-critical",
              mood === "warning" && "text-amber",
              (mood === "paused" || mood === "off") && "text-label-2",
            )}
          >
            {m.word}
          </h1>
          <p
            className={cn(
              "mt-5 line-clamp-3 min-h-[4.8em] max-w-xl text-xl leading-relaxed text-label-2",
              !paused && sev === "critical" && "text-critical",
              !paused && sev === "warning" && "text-amber",
            )}
          >
            {line}
          </p>

          {typing && (
            <form onSubmit={rehearse} className="fixed inset-x-0 bottom-24 z-20 mx-auto flex w-[min(36rem,calc(100%-2rem))] items-center gap-2 rounded-full bg-tile-raised p-1.5 pl-5 ring-1 ring-white/[0.08]">
              <label htmlFor="rehearsal" className="sr-only">Type a sentence as if it was spoken</label>
              <input
                id="rehearsal"
                autoFocus
                value={rehearsal}
                onChange={(e) => setRehearsal(e.target.value)}
                placeholder="ARNIE, brief me"
                className="min-w-0 flex-1 bg-transparent text-[17px] caret-white outline-none placeholder:text-label-3"
              />
              <Capsule type="submit" className={cn(primaryCapsule, "h-9 px-4")}>Send</Capsule>
            </form>
          )}

          <ControlBar>
            <Capsule onClick={togglePause} aria-pressed={paused} aria-keyshortcuts="M" className={cn(paused && primaryCapsule)}>
              {paused ? <Mic className="size-4" aria-hidden /> : <MicOff className="size-4" aria-hidden />}
              {paused ? "Resume" : "Pause"}
              <kbd className="rounded-md bg-white/[0.08] px-1.5 font-sans text-[12px] text-label-2 max-sm:hidden">M</kbd>
            </Capsule>
            <Link
              href="/board"
              target="_blank"
              className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-[15px] font-medium transition-colors hover:bg-white/[0.08]"
            >
              <MonitorUp className="size-4" aria-hidden /> <span className="max-sm:sr-only">Board</span>
            </Link>
            <Capsule onClick={() => setTyping((t) => !t)} aria-pressed={typing}>
              {typing ? <X className="size-4" aria-hidden /> : <Keyboard className="size-4" aria-hidden />} <span className="max-sm:sr-only">Type</span>
            </Capsule>
            <Capsule onClick={stop} disabled={busy} className="text-label-2 hover:bg-critical-soft hover:text-critical focus-visible:text-critical">
              <CircleStop className="size-4" aria-hidden /> <span className="max-sm:sr-only">Stop ARNIE</span>
            </Capsule>
          </ControlBar>
        </section>
      )}
    </main>
  );
}
