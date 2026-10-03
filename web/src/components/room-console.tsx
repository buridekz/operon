"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Check, ExternalLink, Mic, MicOff, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo, VegaRing } from "@/components/vega-ring";
import { cn } from "@/lib/utils";
import { engine, type CaseSetup } from "@/lib/engine";
import { useEarcons } from "@/lib/earcons";
import { joinChannel, type Call } from "@/lib/rtc";
import { useEngineState } from "@/lib/use-engine";
import { VEGA_LABEL, lastVegaLine, phaseTicks, vegaState } from "@/lib/vega";

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
      { name: "summary", label: "One-line summary", value: "58-year-old male, left femoral bleed", hint: "Vega reads this to a specialist you call in." },
      { name: "specialists", label: "On-call specialists", value: "vascular: Dr. Valdez; orthopedics: Dr. Lim; anesthesia: Dr. Ramos", hint: "Specialty: name, separated by semicolons. Say “Vega, call vascular” or the doctor’s name.", wide: true },
    ],
  },
  {
    title: "Safety",
    fields: [
      { name: "allergies", label: "Allergies", value: "penicillin", hint: "Separate with commas. Vega speaks up when a drug, brand name or skin prep it hears conflicts." },
      { name: "orders", label: "Ordered medications", value: "cefazolin 2 g", hint: "From the chart, separated by semicolons. Vega compares any dose it hears with these. It never suggests a dose." },
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

function Stepper({ step }: { step: Step }) {
  const current = STEPS.findIndex((s) => s.key === step);
  return (
    <ol className="flex items-center gap-2" aria-label="Setup progress">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2">
          <span
            aria-current={i === current ? "step" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-1 text-sm",
              i === current ? "bg-teal text-background font-semibold" : i < current ? "bg-teal-soft text-teal" : "text-muted-foreground",
            )}
          >
            <span className="grid size-5 place-items-center rounded-full border border-current text-xs">{i < current ? <Check className="size-3" /> : i + 1}</span>
            {s.label}
          </span>
          {i < STEPS.length - 1 && <span aria-hidden className="h-px w-6 bg-border" />}
        </li>
      ))}
    </ol>
  );
}

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
  useEarcons(view, audio);

  // Mic level meter.
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

  async function startVega() {
    setBusy(true);
    setError(null);
    setAudio((a) => a ?? new AudioContext()); // created on a click, so browsers allow the alert tones
    try {
      await engine("/api/start", {});
      setStep("live");
    } catch (err) {
      setError(`Vega couldn't start: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  // Pause: the room mic goes silent and the engine ignores speech, so the team can talk about
  // Vega (or explain a demo) without it reacting. Press M, or say "Vega, pause listening".
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
    await engine("/api/simulate", { text });
  }

  const vs = vegaState(view, now);
  const lastHeard = view ? [...view.transcript].reverse().find((t) => t.who === "heard") : undefined;
  const lastVega = view ? lastVegaLine(view) : undefined;
  const pct = Math.round(level * 100);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Logo size={30} />
        <Stepper step={step} />
      </header>

      {error && (
        <p role="alert" className="mt-6 rounded-lg border border-critical bg-critical-soft px-4 py-3 text-critical">{error}</p>
      )}

      {step === "case" && (
        <form onSubmit={saveCase} className="mt-8 space-y-6">
          <div>
            <h1 className="font-heading text-3xl font-semibold">Set up the case</h1>
            <p className="mt-1 text-muted-foreground">Do this before anyone scrubs. It&apos;s the only typing in the whole case.</p>
          </div>
          {GROUPS.map((g) => (
            <Card key={g.title}>
              <CardHeader>
                <CardTitle className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{g.title}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {g.fields.map((f) => (
                  <div key={f.name} className={cn("grid gap-1.5", (f.wide || f.hint) && "sm:col-span-2")}>
                    <Label htmlFor={f.name}>{f.label}</Label>
                    <Input id={f.name} name={f.name} defaultValue={f.value} aria-describedby={f.hint ? `${f.name}-hint` : undefined} />
                    {f.hint && <p id={`${f.name}-hint`} className="text-xs text-muted-foreground">{f.hint}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
          <div className="flex justify-end">
            <Button type="submit" size="lg" disabled={busy}>Continue to mic check</Button>
          </div>
        </form>
      )}

      {step === "mic" && (
        <section className="mt-8 space-y-6" aria-labelledby="mic-title">
          <div>
            <h1 id="mic-title" className="font-heading text-3xl font-semibold">Check the room microphone</h1>
            <p className="mt-1 text-muted-foreground">Place this device where the whole team can be heard, then say a few words.</p>
          </div>
          <Card>
            <CardContent className="space-y-5 py-2">
              {!micOn ? (
                <Button size="lg" onClick={turnOnMic} disabled={busy}>
                  <Mic className="size-4" aria-hidden /> Turn on microphone
                </Button>
              ) : (
                <>
                  <div className="h-4 overflow-hidden rounded-full bg-secondary" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                    <div className="h-full rounded-full bg-teal transition-[width] duration-100" style={{ width: `${pct}%` }} />
                  </div>
                  <p className={cn("flex items-center gap-2", heardSomething ? "text-teal" : "text-muted-foreground")} aria-live="polite">
                    {heardSomething ? <><Check className="size-4" aria-hidden /> Microphone is working.</> : "Say a few words. The bar should move."}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {denoise
                      ? "AI noise suppression is on: background noise and nearby voices are filtered."
                      : "AI noise suppression isn't available in this browser. Use desktop Chrome or Edge for a noisy room."}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
          <div className="flex justify-between gap-3">
            <Button variant="secondary" size="lg" onClick={back} disabled={busy}>Back</Button>
            <Button size="lg" onClick={startVega} disabled={busy || !micOn}>Start Vega</Button>
          </div>
        </section>
      )}

      {step === "live" && (
        <section className="mt-6 flex flex-1 flex-col items-center gap-6 text-center" aria-labelledby="live-title">
          <VegaRing state={paused ? "off" : vs} ticks={phaseTicks(view)} size={190} className="mt-4" />
          <div aria-live="polite">
            <h1 id="live-title" className={cn("font-heading text-4xl font-semibold", !paused && vs === "warning" && "text-amber", !paused && vs === "critical" && "text-critical")}>
              {paused ? "Paused, not listening" : VEGA_LABEL[vs].replace(/^Vega /, "").replace(/^is /, "").replace(/^raised an? /, "")}
            </h1>
            <p className="mt-2 text-lg text-muted-foreground">
              {view?.phase === "idle" ? <>Say &ldquo;<span className="text-foreground">Vega, start time out</span>&rdquo;</> : `${view?.case.room} · ${view?.case.patient}`}
            </p>
          </div>

          <Card className="w-full text-left">
            <CardContent className="space-y-3 py-1">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Heard</p>
                <p className="text-lg text-surgeon">{lastHeard?.text ?? "…"}</p>
              </div>
              <div className={cn("border-l-[3px] pl-3", lastVega?.severity === "critical" ? "border-critical" : lastVega?.severity === "warning" ? "border-amber" : "border-teal")}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-teal">Vega</p>
                <p className={cn("text-lg", lastVega?.severity === "critical" && "text-critical", lastVega?.severity === "warning" && "text-amber")}>{lastVega?.text ?? "…"}</p>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap justify-center gap-3">
            <Button size="lg" variant={paused ? "default" : "secondary"} onClick={togglePause} aria-pressed={paused} aria-keyshortcuts="M">
              {paused ? <Mic className="size-4" aria-hidden /> : <MicOff className="size-4" aria-hidden />}
              {paused ? "Resume listening" : "Pause listening"}
              <kbd className="ml-1 rounded border border-current/30 px-1.5 font-mono text-xs opacity-70">M</kbd>
            </Button>
            <Button variant="secondary" size="lg" nativeButton={false} render={<Link href="/board" target="_blank" />}>
              Open wall board <ExternalLink className="size-4" aria-hidden />
            </Button>
            <Button variant="destructive" size="lg" onClick={stop} disabled={busy}>
              <Square className="size-4" aria-hidden /> Stop Vega
            </Button>
          </div>

          <details className="w-full text-left">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Rehearse without a microphone</summary>
            <form onSubmit={rehearse} className="mt-3 flex gap-2">
              <Label htmlFor="rehearsal" className="sr-only">Type a sentence as if it was spoken</Label>
              <Input id="rehearsal" value={rehearsal} onChange={(e) => setRehearsal(e.target.value)} placeholder="Vega, start time out" />
              <Button type="submit" variant="secondary">Send</Button>
            </form>
          </details>
        </section>
      )}
    </main>
  );
}
