"use client";

// The wall board: a quiet bento read in a second from across the room. Everything is white and
// grey; only an alert carries color (system red / yellow), and the focus tile changes with the case.
import type * as React from "react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AlertTriangle, Check, OctagonAlert, PhoneCall, Volume2, VolumeX } from "lucide-react";
import { ArnieOrb } from "@/components/arnie-orb";
import { CtViewer, loadCt } from "@/components/ct-viewer";
import { Logo } from "@/components/vega-ring";
import { cn } from "@/lib/utils";
import { mmss, pad2, type ChecklistView, type EngineView, type Severity } from "@/lib/engine";
import { useEngineState } from "@/lib/use-engine";
import { useEarcons } from "@/lib/earcons";
import { MOOD, arnieMood, lastArnieLine } from "@/lib/vega";

const ALERT_MS = 15_000;
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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

function Tile({ area, label, className, children, style }: { area: string; label: string; className?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section aria-label={label} style={{ gridArea: area, ...style }} className={cn("tile flex min-h-0 min-w-0 flex-col p-6", className)}>
      {children}
    </section>
  );
}

const caption = "text-[15px] text-label-2";

// ---------- Patient ----------
function PatientTile({ v }: { v: EngineView }) {
  return (
    <Tile area="patient" label="Patient" className="justify-center">
      <h1 className="truncate text-[34px] font-semibold leading-tight tracking-[-0.02em]">{v.case.patient}</h1>
      <p className="mt-1 text-[17px] text-label-2 max-sm:line-clamp-2 sm:truncate">{v.case.summary}</p>
      <p className="mt-0.5 text-[17px] text-label-2 max-sm:line-clamp-2 sm:truncate">{v.case.procedure} · {v.case.site}</p>
    </Tile>
  );
}

// ---------- Operation clock ----------
function ClockTile({ v }: { v: EngineView }) {
  const op = v.operation;
  const tq = v.tourniquet;
  const tqLevel: Severity | null = !tq ? null : tq.seconds >= 7200 ? "critical" : tq.seconds >= 3600 ? "warning" : "info";
  return (
    <Tile area="clock" label="Operation" className="justify-center">
      {!op ? (
        <>
          <p className="text-[28px] font-semibold leading-tight text-label-2">Not started</p>
          <p className="mt-1 text-[13px] text-label-3">&ldquo;ARNIE, start the operation&rdquo;</p>
        </>
      ) : (
        <>
          <p className="text-[28px] font-semibold leading-tight tracking-[-0.01em]">{sentence(op.duration)}</p>
          <p className="tnum mt-1 text-[15px] text-label-2">{op.end ? `${op.start} – ${op.end} · done` : `Operating since ${op.start}`}</p>
        </>
      )}
      {tq && (
        <p className={cn("tnum mt-3 text-[15px]", tqLevel === "critical" ? "text-critical" : tqLevel === "warning" ? "text-amber" : "text-label-2")}>
          Tourniquet {tq.side} · {mmss(tq.seconds)}
        </p>
      )}
    </Tile>
  );
}

// ---------- ARNIE ----------
const subscribeWidth = (cb: () => void) => { window.addEventListener("resize", cb); return () => window.removeEventListener("resize", cb); };
/** The board orb follows the screen: 176 px on a laptop, about 250 px on a 1920 wall display. */
function useOrbSize() {
  const width = useSyncExternalStore(subscribeWidth, () => window.innerWidth, () => 1440);
  return Math.round(Math.min(300, Math.max(176, width * 0.13)));
}
function ArnieTile({ v, now, echo }: { v: EngineView; now: number | null; echo: boolean }) {
  const orbSize = useOrbSize();
  const mood = arnieMood(v, now);
  const m = MOOD[mood];
  const last = lastArnieLine(v);
  const heard = [...v.transcript].reverse().find((t) => t.who === "heard");
  const quiet = mood === "paused" || mood === "off";
  return (
    <Tile area="arnie" label="ARNIE" className="items-center text-center">
      <div className="flex flex-1 flex-col items-center justify-center">
        <ArnieOrb state={m.orb} size={orbSize} color={m.color} speed={quiet ? 0.25 : 1} label={`ARNIE: ${m.word}`} className={cn("transition-opacity duration-700", quiet && "opacity-35")} />
        <p className={cn("mt-6 text-[28px] font-semibold tracking-[-0.02em]", mood === "critical" && "text-critical", mood === "warning" && "text-amber", quiet && "text-label-2")} aria-live="polite">
          {m.word}
        </p>
        {!echo && (
          <p className={cn("mt-3 line-clamp-2 text-[19px] leading-relaxed text-label-2", last?.severity === "critical" && "text-critical", last?.severity === "warning" && "text-amber")}>
            {last?.text ?? "Ready when you are."}
          </p>
        )}
      </div>
      {heard && <p className="mt-4 line-clamp-1 w-full text-[13px] text-label-3" title="What ARNIE last heard">&ldquo;{heard.text}&rdquo;</p>}
    </Tile>
  );
}

// ---------- Alerts: calm until something is wrong ----------
function activeAlert(v: EngineView, now: number | null): { sev: Exclude<Severity, "info">; text: string; time?: string } | null {
  const last = [...v.transcript].reverse().find((t) => t.who === "sv" && t.severity && t.severity !== "info");
  if (last && now && now - last.at < ALERT_MS) {
    return { sev: last.severity as Exclude<Severity, "info">, text: sentence(last.text.replace(/^(Caution|Please verify):\s*/, "").replace(/^Logged\.\s*/, "")) };
  }
  if (v.counts.status === "mismatch") return { sev: "critical", text: `Count not reconciled: ${v.counts.missing.join(", ")}.` };
  return null;
}

function AlertTile({ v, now }: { v: EngineView; now: number | null }) {
  const a = activeAlert(v, now);
  const caught = v.log.filter((l) => l.kind === "alert" && /held|flagged/.test(l.text)).length;
  if (!a) {
    return (
      <Tile area="alerts" label="Alerts" className="justify-center">
        <p className="flex items-center gap-2 text-[22px] font-semibold"><Check className="size-6 text-label-2" aria-hidden />All clear</p>
        <p className="mt-1 text-[15px] text-label-2">
          {caught ? `${caught} ${caught === 1 ? "mistake" : "mistakes"} caught this case.` : "Listening for allergy and dose conflicts."}
        </p>
      </Tile>
    );
  }
  const critical = a.sev === "critical";
  const Icon = critical ? OctagonAlert : AlertTriangle;
  return (
    <Tile
      area="alerts"
      label={critical ? "Critical alert" : "Warning"}
      className={cn("tile-alert-in justify-center", critical ? "text-white" : "text-black")}
      style={{ background: critical ? "var(--critical)" : "var(--amber)" }}
    >
      <div role="alert" key={a.text}>
        <p className="flex items-center gap-2 text-[19px] font-bold"><Icon className="size-5" aria-hidden />{critical ? "Critical" : "Warning"}</p>
        <p className="mt-2 line-clamp-4 text-[24px] font-semibold leading-snug tracking-[-0.01em]">{a.text}</p>
      </div>
    </Tile>
  );
}

// ---------- Chart: what ARNIE checks what it hears against ----------
function ChartTile({ v }: { v: EngineView }) {
  const labs = Object.entries(v.case.preop).filter(([, val]) => val);
  const rows: [string, React.ReactNode][] = [
    ["Allergies", v.case.allergies.length
      ? <span className="flex flex-wrap justify-end gap-x-3">{v.case.allergies.map((a) => (
        <span key={a} className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-critical" />{sentence(a)}</span>
      ))}</span>
      : "None recorded"],
    ["Ordered", v.case.orders.length ? v.case.orders.join(", ") : "None recorded"],
    ...labs.map(([k, val]) => [`Pre-op ${k}`, val] as [string, React.ReactNode]),
  ];
  return (
    <Tile area="chart" label="Chart" className="justify-center">
      <dl className="divide-y divide-white/[0.08]">
        {rows.map(([k, val]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0">
            <dt className={caption}>{k}</dt>
            <dd className="text-right text-[17px]">{val}</dd>
          </div>
        ))}
      </dl>
    </Tile>
  );
}

// ---------- Focus: the one thing that matters now ----------
function ChecklistFocus({ list }: { list: ChecklistView }) {
  return (
    <div className="flex h-full flex-col">
      <h2 className="text-[34px] font-semibold tracking-[-0.02em]">{list.title}</h2>
      <p className={cn("mt-1 text-[17px]", list.blocked ? "text-amber" : "text-label-2")}>
        {list.complete ? "Complete" : list.blocked ? "Blocked until confirmed" : "ARNIE is asking each item out loud"}
      </p>
      <ul className="mt-6 divide-y divide-white/[0.08]">
        {list.items.map((it) => (
          <li key={it.label} className={cn("flex items-center gap-4 py-4 text-[24px]", it.status === "pending" && "text-label-3", it.status === "blocked" && "text-amber")}>
            <span
              aria-hidden
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-full border-2",
                it.status === "ok" ? "border-foreground bg-foreground text-black" : it.status === "blocked" ? "border-amber" : it.status === "active" ? "border-foreground" : "border-label-3",
              )}
            >
              {it.status === "ok" && <Check className="size-5" strokeWidth={3} />}
              {it.status === "active" && <span className="size-2.5 rounded-full bg-foreground" />}
            </span>
            <span className="flex-1">{it.label}</span>
            <span className="sr-only">{it.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConsultFocus({ v }: { v: EngineView }) {
  const c = v.consult!;
  const brief = [...v.transcript].reverse().find((t) => t.who === "sv" && t.text.startsWith(c.doctor));
  return (
    <div className="flex h-full flex-col justify-center">
      <PhoneCall className={cn("size-10", c.state === "ringing" && "motion-safe:animate-pulse")} aria-hidden />
      <h2 className="mt-6 text-[44px] font-semibold leading-tight tracking-[-0.03em]">{c.doctor}</h2>
      <p className="mt-1 text-[20px] text-label-2">{sentence(c.specialty)} · {c.state === "ringing" ? "calling…" : "on the line"}</p>
      <p className="mt-8 max-w-2xl text-[22px] leading-relaxed text-label-2">
        {brief ? brief.text : "ARNIE will brief them from the chart when they answer."}
      </p>
    </div>
  );
}

function SummaryFocus({ v }: { v: EngineView }) {
  const op = v.operation;
  return (
    <div className="flex h-full flex-col justify-center">
      <h2 className="text-[34px] font-semibold tracking-[-0.02em]">Case summary</h2>
      {op && <p className="tnum mt-2 text-[22px] text-label-2">{op.start} – {op.end ?? "now"} · {sentence(op.duration)}</p>}
      <p className="mt-6 max-w-3xl text-[22px] leading-relaxed">{v.summary!.text}</p>
    </div>
  );
}

function TimelineFocus({ v }: { v: EngineView }) {
  const rows = v.log.slice(-8);
  const c = v.counts;
  return (
    <div className="flex h-full flex-col">
      <h2 className="text-[34px] font-semibold tracking-[-0.02em]">Case log</h2>
      <ol className="mt-4 flex-1 divide-y divide-white/[0.08]">
        {rows.map((l) => {
          const sev = l.severity ?? (l.kind === "alert" ? "warning" : null);
          return (
            <li key={`${l.at}-${l.text}`} className="flex items-baseline gap-5 py-3">
              <span className="tnum w-14 shrink-0 text-[15px] text-label-3">{l.time}</span>
              <span className={cn("text-[20px]", sev === "critical" && "text-critical", sev === "warning" && "text-amber")}>{l.text}</span>
            </li>
          );
        })}
      </ol>
      {c.status !== "none" && (
        <p className={cn("tnum mt-4 text-[17px]", c.status === "mismatch" ? "text-critical" : "text-label-2")}>
          Sponges {c.opened.sponge} opened{c.final ? ` · ${c.final.sponge} counted` : ""} · needles {c.opened.needle}
          {c.status === "reconciled" ? " · reconciled" : ""}
        </p>
      )}
    </div>
  );
}

function ReadyFocus() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <h2 className="text-[44px] font-semibold tracking-[-0.03em]">Ready</h2>
      <p className="mt-2 text-[20px] text-label-2">&ldquo;ARNIE, brief me&rdquo; · &ldquo;ARNIE, start the operation&rdquo;</p>
    </div>
  );
}

type FocusKey = "ct" | "consult" | "signin" | "timeout" | "signout" | "summary" | "log" | "ready";
function focusOf(v: EngineView): FocusKey {
  if (v.imaging?.visible) return "ct";
  if (v.consult && v.consult.state !== "ended") return "consult";
  if (v.phase === "signin" || v.phase === "timeout" || v.phase === "signout") return v.phase;
  if (v.summary) return "summary";
  return v.log.length ? "log" : "ready";
}

function FocusTile({ v }: { v: EngineView }) {
  const key = focusOf(v);
  const body: React.ReactNode =
    key === "ct" ? <div className="mx-auto aspect-square h-full max-h-full max-w-full"><CtViewer imaging={v.imaging!} /></div>
      : key === "consult" ? <ConsultFocus v={v} />
        : key === "signin" || key === "timeout" || key === "signout" ? <ChecklistFocus list={v.checklists[key]} />
          : key === "summary" ? <SummaryFocus v={v} />
            : key === "log" ? <TimelineFocus v={v} />
              : <ReadyFocus />;
  return (
    <Tile area="focus" label="Focus" className={cn(key === "ct" && "bg-black! p-3")}>
      <div key={key} className="focus-in h-full min-h-0">{body}</div>
    </Tile>
  );
}

// ---------- Board ----------
export function Board() {
  const { view: v, connected } = useEngineState();
  const now = useNow();
  const d = now ? new Date(now) : null;
  const [audio, setAudio] = useState<AudioContext | null>(null);
  useEarcons(v, audio);
  useEffect(() => { void loadCt().catch(() => {}); }, []); // fetch the CT in the background so it shows instantly

  if (!v) {
    return <main className="grid flex-1 place-items-center text-[17px] text-label-2">Connecting to the Operon engine…</main>;
  }

  const alerting = !!activeAlert(v, now);
  // The ARNIE tile stays quiet when another tile already shows its words (the alert, the summary).
  const echo = alerting || focusOf(v) === "summary" || focusOf(v) === "consult";

  return (
    <main className="flex min-h-dvh w-full flex-1 flex-col gap-4 p-4 sm:p-6 lg:h-dvh lg:min-h-0 lg:flex-none lg:overflow-hidden">
      <header className="flex items-center justify-between gap-4 px-2">
        <div className="flex min-w-0 items-center gap-4">
          <Logo size={24} />
          <span aria-hidden className="h-5 w-px bg-white/15 max-sm:hidden" />
          <p className="truncate text-[17px] font-medium max-sm:hidden">{v.case.room}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => (audio ? (audio.close(), setAudio(null)) : setAudio(new AudioContext()))}
            aria-pressed={!!audio}
            aria-label={audio ? "Alert tones on" : "Alert tones off"}
            title={audio ? "Alert tones on" : "Turn on alert tones"}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-tile px-3.5 text-[13px] text-label-2 transition-colors hover:text-foreground"
          >
            {audio ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
            <span className="hidden sm:inline">{audio ? "Tones on" : "Tones off"}</span>
          </button>
          <span aria-label={connected ? "Connected" : "Reconnecting"} className={cn("size-2 rounded-full", connected ? "bg-teal" : "bg-amber")} />
          <span className="tnum text-[34px] font-semibold tracking-[-0.02em]">{d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : "--:--"}</span>
        </div>
      </header>

      <div
        className={cn(
          "grid min-h-0 flex-1 gap-4",
          "[grid-template-areas:'patient'_'arnie'_'alerts'_'clock'_'focus'_'chart'] grid-cols-1",
          "md:grid-cols-2 md:[grid-template-areas:'patient_patient'_'arnie_alerts'_'arnie_clock'_'focus_focus'_'chart_chart']",
          "lg:grid-cols-[1fr_1fr_0.95fr_1.05fr] transition-[grid-template-rows] duration-500 ease-out",
          alerting ? "lg:grid-rows-[auto_minmax(0,1.3fr)_minmax(0,0.9fr)]" : "lg:grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)]",
          "lg:[grid-template-areas:'patient_patient_clock_arnie'_'focus_focus_alerts_arnie'_'focus_focus_chart_arnie']",
        )}
      >
        <PatientTile v={v} />
        <ClockTile v={v} />
        <ArnieTile v={v} now={now} echo={echo} />
        <FocusTile v={v} />
        <AlertTile v={v} now={now} />
        <ChartTile v={v} />
      </div>
    </main>
  );
}
