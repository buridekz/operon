"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, OctagonAlert, PhoneCall, Volume2, VolumeX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CtViewer } from "@/components/ct-viewer";
import { Logo, VegaRing } from "@/components/vega-ring";
import { cn } from "@/lib/utils";
import { mmss, pad2, type ChecklistView, type EngineView, type Severity } from "@/lib/engine";
import { useEngineState } from "@/lib/use-engine";
import { useEarcons } from "@/lib/earcons";
import { phaseTicks, vegaState } from "@/lib/vega";

type ChecklistKey = keyof EngineView["checklists"];
const ALERT_MS = 12_000;

const severityText: Record<Severity, string> = { info: "text-teal", warning: "text-amber", critical: "text-critical" };
const severityBorder: Record<Severity, string> = { info: "border-teal", warning: "border-amber", critical: "border-critical" };

function useNow() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tickNow = () => setNow(Date.now());
    const first = setTimeout(tickNow, 0);
    const id = setInterval(tickNow, 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);
  return now;
}

// ---------- Header ----------
const STEPS: { key: ChecklistKey | "surgery"; label: string }[] = [
  { key: "signin", label: "Sign in" },
  { key: "timeout", label: "Time out" },
  { key: "surgery", label: "Surgery" },
  { key: "signout", label: "Sign out" },
];

function PhaseStepper({ v }: { v: EngineView }) {
  const done = (key: (typeof STEPS)[number]["key"]) =>
    key === "surgery" ? v.checklists.signout.complete || v.phase === "signout" : v.checklists[key].complete;
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Case phase">
      {STEPS.map((s, i) => {
        const current = v.phase === s.key;
        return (
          <li key={s.key} className="flex items-center gap-1.5">
            <span
              aria-current={current ? "step" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1 font-mono text-xs font-semibold uppercase tracking-[0.08em]",
                current ? "bg-teal text-background" : done(s.key) ? "bg-teal-soft text-teal" : "text-muted-foreground",
              )}
            >
              {done(s.key) && !current ? "✓ " : ""}{s.label}
            </span>
            {i < STEPS.length - 1 && <span aria-hidden className="text-muted-foreground">›</span>}
          </li>
        );
      })}
    </ol>
  );
}

function AlertBanner({ v, now }: { v: EngineView; now: number | null }) {
  const last = [...v.transcript].reverse().find((t) => t.who === "sv" && t.severity && t.severity !== "info");
  if (!last || !now || now - last.at > ALERT_MS) return null;
  const critical = last.severity === "critical";
  const Icon = critical ? OctagonAlert : AlertTriangle;
  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-4 rounded-xl border-2 px-5 py-4",
        critical ? "alarm-pulse border-critical bg-critical-soft text-critical" : "border-amber bg-amber-soft text-amber",
      )}
    >
      <Icon className="size-9 shrink-0" aria-hidden />
      <div>
        <p className="font-mono text-xs font-bold uppercase tracking-[0.14em]">{critical ? "Critical" : "Warning"}</p>
        <p className="font-heading text-2xl font-semibold leading-tight sm:text-3xl">{last.text.replace(/^Logged.s*/, "")}</p>
      </div>
    </div>
  );
}

// ---------- Hero panels ----------
function ChecklistHero({ list, active }: { list: ChecklistView; active: boolean }) {
  const status = list.complete ? "Complete" : list.blocked ? "Blocked" : active ? "In progress" : "Not started";
  return (
    <Card className={cn("h-full", list.blocked && "ring-2 ring-amber")}>
      <CardHeader>
        <CardTitle className="font-heading text-4xl font-semibold">{list.title}</CardTitle>
        <CardAction>
          <Badge variant="secondary" className={cn("h-7 px-3 font-mono text-sm", list.complete && "bg-teal-soft text-teal", list.blocked && "bg-amber-soft text-amber")}>
            {status}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {list.items.map((it) => (
            <li
              key={it.label}
              className={cn(
                "flex items-center gap-4 rounded-lg px-3 py-2.5 text-2xl",
                it.status === "active" && "bg-secondary ring-2 ring-teal",
                it.status === "blocked" && "bg-amber-soft text-amber ring-2 ring-amber",
                it.status === "pending" && "text-muted-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-lg border-2 text-lg font-bold",
                  it.status === "ok" && "border-teal bg-teal text-background",
                  it.status === "blocked" && "border-amber",
                  it.status === "active" && "border-teal text-teal",
                )}
              >
                {it.status === "ok" ? "✓" : it.status === "blocked" ? "!" : it.status === "active" ? "•" : ""}
              </span>
              <span className="flex-1">{it.label}</span>
              {it.status === "active" && <span className="font-mono text-sm text-teal">◀ now</span>}
              {it.status === "blocked" && <span className="font-mono text-sm font-bold">NOT CONFIRMED</span>}
              <span className="sr-only">{it.status}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function CountRow({ label, opened, counted }: { label: string; opened: number; counted?: number }) {
  const mismatch = counted !== undefined && counted !== opened;
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-6 py-2">
      <span className="text-lg">{label}</span>
      <span className="font-mono text-sm text-muted-foreground">opened <b className="text-2xl text-foreground">{opened}</b></span>
      <span className={cn("font-mono text-sm text-muted-foreground", mismatch && "text-critical")}>
        counted <b className={cn("text-2xl", mismatch ? "text-critical" : "text-foreground")}>{counted ?? "—"}</b>
      </span>
    </div>
  );
}

function SurgeryHero({ v }: { v: EngineView }) {
  const tq = v.tourniquet;
  const tqLevel: Severity | null = !tq ? null : tq.seconds >= 7200 ? "critical" : tq.seconds >= 3600 ? "warning" : "info";
  const c = v.counts;
  return (
    <div className="grid h-full gap-4 md:grid-cols-2">
      <Card className={cn(tqLevel === "warning" && "ring-2 ring-amber", tqLevel === "critical" && "ring-2 ring-critical")}>
        <CardHeader><CardTitle className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Tourniquet{tq ? ` · ${tq.side}` : ""}</CardTitle></CardHeader>
        <CardContent>
          <p className={cn("font-mono text-7xl font-semibold tabular-nums", tqLevel ? severityText[tqLevel] : "text-muted-foreground")}>
            {tq ? mmss(tq.seconds) : "--:--"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">Alerts at 60, 90 and 120 minutes</p>
        </CardContent>
      </Card>

      <Card className={cn(c.status === "mismatch" && "ring-2 ring-critical")}>
        <CardHeader>
          <CardTitle className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Counts</CardTitle>
          <CardAction>
            <Badge
              variant="secondary"
              className={cn("font-mono", c.status === "reconciled" && "bg-teal-soft text-teal", c.status === "mismatch" && "bg-critical-soft text-critical")}
            >
              {c.status === "none" ? "Nothing opened" : c.status === "open" ? "Final count pending" : c.status === "reconciled" ? "Reconciled" : "Mismatch"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="divide-y">
          <CountRow label="Sponges" opened={c.opened.sponge} counted={c.final?.sponge} />
          <CountRow label="Needles" opened={c.opened.needle} counted={c.final?.needle} />
          {c.missing.length > 0 && <p className="pt-2 font-semibold text-critical">⚠ {c.missing.join(", ")}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Milestones</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {(["incision", "closure"] as const).map((m) => (
            <div key={m}>
              <p className="text-sm capitalize text-muted-foreground">{m}</p>
              <p className="font-mono text-3xl font-semibold">{v.milestones[m] ?? "--:--"}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Implants</CardTitle></CardHeader>
        <CardContent>
          {v.implants.length === 0 ? (
            <p className="text-muted-foreground">None recorded.</p>
          ) : (
            <ul className="space-y-1.5">
              {v.implants.map((im) => (
                <li key={`${im.time}-${im.name}`} className="flex gap-3 text-lg">
                  <span className="font-mono text-sm text-muted-foreground">{im.time}</span>
                  <span>{im.name}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ConsultHero({ v }: { v: EngineView }) {
  const c = v.consult!;
  const brief = [...v.transcript].reverse().find((t) => t.who === "sv" && t.text.startsWith(c.doctor));
  return (
    <Card className="h-full ring-2 ring-teal">
      <CardHeader>
        <CardTitle className="flex items-center gap-3 font-heading text-4xl font-semibold">
          <PhoneCall className="size-8 text-teal" aria-hidden />
          {c.doctor}
        </CardTitle>
        <CardAction>
          <Badge className="h-7 bg-teal-soft px-3 font-mono text-sm text-teal">{c.state === "ringing" ? "Ringing…" : "Live consult"}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-xl capitalize text-muted-foreground">{c.specialty} · {v.case.room}</p>
        {brief ? (
          <blockquote className="rounded-lg bg-teal-soft px-5 py-4 text-2xl leading-snug">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-teal">Briefing from the confirmed log</span>
            {brief.text}
          </blockquote>
        ) : (
          <p className="text-xl text-muted-foreground">The specialist&apos;s phone is ringing. Vega will brief them when they answer.</p>
        )}
      </CardContent>
    </Card>
  );
}

function IdleHero() {
  return (
    <Card className="h-full justify-center">
      <CardContent className="space-y-3 text-center">
        <p className="font-heading text-4xl font-semibold">Ready</p>
        <p className="text-xl text-muted-foreground">Say &ldquo;Vega, sign in&rdquo; or &ldquo;Vega, start time out&rdquo;.</p>
      </CardContent>
    </Card>
  );
}

function Hero({ v }: { v: EngineView }) {
  if (v.imaging?.visible) {
    return (
      <Card className="h-full">
        <CardContent className="mx-auto w-full max-w-[min(100%,72vh)]">
          <CtViewer study={v.imaging.study} slice={v.imaging.slice} zoom={v.imaging.zoom} rotation={v.imaging.rotation} />
          <p className="mt-3 text-center text-sm text-muted-foreground">&ldquo;Vega, next slice · zoom in · rotate · close the images&rdquo;</p>
        </CardContent>
      </Card>
    );
  }
  if (v.consult && v.consult.state !== "ended") return <ConsultHero v={v} />;
  if (v.phase === "signin" || v.phase === "timeout" || v.phase === "signout") return <ChecklistHero list={v.checklists[v.phase]} active />;
  if (v.phase === "surgery" || v.phase === "done") return <SurgeryHero v={v} />;
  return <IdleHero />;
}

// ---------- Board ----------
export function Board() {
  const { view: v, connected } = useEngineState();
  const now = useNow();
  const d = now ? new Date(now) : null;
  const [audio, setAudio] = useState<AudioContext | null>(null);
  useEarcons(v, audio);
  const vs = vegaState(v, now);

  if (!v) {
    return <main className="grid flex-1 place-items-center text-muted-foreground">Connecting to the Operon engine…</main>;
  }

  return (
    <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div className="flex min-w-0 items-center gap-4">
          <Logo size={30} />
          <span aria-hidden className="h-7 w-px bg-border" />
          <h1 className="truncate text-lg">
            <span className="font-semibold">{v.case.room}</span>
            <span className="text-muted-foreground"> · {v.case.patient} · {v.case.procedure}</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <PhaseStepper v={v} />
          <div className="flex items-center gap-2.5">
            <VegaRing state={vs} ticks={phaseTicks(v)} size={46} />
            <span className={cn("w-20 font-mono text-xs font-semibold uppercase tracking-[0.08em]", vs === "off" ? "text-muted-foreground" : vs === "warning" ? "text-amber" : vs === "critical" ? "text-critical" : "text-teal")}>
              {vs === "off" ? "Vega off" : vs === "listening" ? "Listening" : vs === "speaking" ? "Speaking" : vs === "warning" ? "Warning" : "Critical"}
            </span>
          </div>
          <span className="font-mono text-4xl font-semibold tabular-nums">{d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : "--:--"}</span>
        </div>
      </header>

      <AlertBanner v={v} now={now} />

      <div className="grid flex-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <section aria-label="Current focus" className="min-h-[420px]">
          <Hero v={v} />
        </section>

        <aside className="flex flex-col gap-5" aria-label="Conversation and case log">
          <section aria-label="Live conversation" className="flex flex-col">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Live conversation</h2>
            <ol className="flex flex-col gap-2.5" aria-live="polite">
              {v.transcript.slice(-6).map((t) => {
                const sev = t.severity ?? "info";
                return (
                  <li
                    key={`${t.at}-${t.text}`}
                    className={cn("text-[15px] leading-snug", t.who === "heard" ? "text-surgeon" : cn("border-l-[3px] pl-2.5", severityBorder[sev], sev !== "info" && severityText[sev]))}
                  >
                    <span className={cn("block text-[10px] font-semibold uppercase tracking-[0.1em]", t.who === "heard" ? "text-muted-foreground" : severityText[sev])}>
                      {t.who === "heard" ? "Heard" : `Vega${sev === "critical" ? " · critical" : sev === "warning" ? " · warning" : ""}`}
                      {t.via === "llm" && " · parsed by LLM"}
                    </span>
                    {t.text}
                  </li>
                );
              })}
              {v.transcript.length === 0 && <li className="text-muted-foreground">Waiting for the room…</li>}
            </ol>
          </section>

          <section aria-label="Case log">
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Case log</h2>
            {v.log.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
            ) : (
              <ul className="divide-y">
                {v.log.slice(-7).map((l) => {
                  const sev = l.severity ?? (l.kind === "alert" ? "warning" : null);
                  return (
                    <li key={`${l.at}-${l.text}`} className="flex items-baseline gap-3 py-1.5 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">{l.time}</span>
                      <span className={cn("flex-1", sev && sev !== "info" && severityText[sev])}>{l.text}</span>
                      {sev && sev !== "info" ? (
                        <span className={cn("text-[10px] font-bold uppercase", severityText[sev])}>{sev}</span>
                      ) : (
                        <CheckCircle2 className="size-3.5 text-teal" aria-label="logged" />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <footer className="flex items-center justify-between gap-4 font-mono text-xs text-muted-foreground">
        <span>{v.agent.running ? "Vega listening" : "Vega stopped"}{v.llm ? " · LLM fallback on" : ""}</span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => (audio ? (audio.close(), setAudio(null)) : setAudio(new AudioContext()))}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-pressed={!!audio}
          >
            {audio ? <Volume2 className="size-3.5" aria-hidden /> : <VolumeX className="size-3.5" aria-hidden />}
            Alert tones {audio ? "on" : "off"}
          </button>
          <span>{connected ? "live" : "reconnecting…"}</span>
        </div>
      </footer>
    </main>
  );
}
