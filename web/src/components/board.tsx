"use client";

// The wall board. Structure: a header (who, where, phase, ARNIE's state, the clock), a chart strip,
// a full-width alert banner when something is wrong, then the focus panel beside the conversation
// and the case log. Everything is white and grey on black; only an alert carries color.
// ARNIE's orb lives on the Room screen; here its state is one dot and one word.
import type * as React from "react";
import { useEffect, useState } from "react";
import { AlertTriangle, Check, OctagonAlert, PhoneCall, Volume2, VolumeX } from "lucide-react";
import { CtViewer, loadCt } from "@/components/ct-viewer";
import { Logo } from "@/components/vega-ring";
import { cn } from "@/lib/utils";
import { mmss, pad2, type ChecklistView, type EngineView, type Severity } from "@/lib/engine";
import { useEngineState } from "@/lib/use-engine";
import { useEarcons } from "@/lib/earcons";
import { MOOD, arnieMood } from "@/lib/vega";

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

const sectionTitle = "text-[15px] font-medium text-label-2";

// ---------- Header ----------
const STEPS: { key: keyof EngineView["checklists"] | "surgery"; label: string }[] = [
  { key: "signin", label: "Sign in" },
  { key: "timeout", label: "Time out" },
  { key: "surgery", label: "Surgery" },
  { key: "signout", label: "Sign out" },
];

function PhaseSteps({ v }: { v: EngineView }) {
  const done = (k: (typeof STEPS)[number]["key"]) =>
    k === "surgery" ? v.milestones.closure != null || v.checklists.signout.complete : v.checklists[k].complete;
  const current = (k: (typeof STEPS)[number]["key"]) => (k === "surgery" ? v.phase === "surgery" : v.phase === k);
  return (
    <ol className="flex items-center gap-1 rounded-full bg-tile p-1" aria-label="Case phase">
      {STEPS.map((s) => (
        <li
          key={s.key}
          aria-current={current(s.key) ? "step" : undefined}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px]",
            current(s.key) ? "bg-foreground font-semibold text-black" : done(s.key) ? "text-foreground" : "text-label-3",
          )}
        >
          {done(s.key) && !current(s.key) && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function ArnieStatus({ v, now }: { v: EngineView; now: number | null }) {
  const mood = arnieMood(v, now);
  const dot = mood === "critical" ? "bg-critical" : mood === "warning" ? "bg-amber" : mood === "paused" || mood === "off" ? "bg-label-3" : "bg-teal";
  return (
    <p className="flex items-center gap-2 text-[15px]" aria-live="polite">
      <span aria-hidden className={cn("size-2.5 rounded-full", dot, (mood === "listening" || mood === "thinking" || mood === "speaking") && "motion-safe:animate-pulse")} />
      <span className="text-label-2">ARNIE</span>
      <span className={cn("font-medium", mood === "critical" && "text-critical", mood === "warning" && "text-amber")}>{MOOD[mood].word}</span>
    </p>
  );
}

// ---------- Chart strip: what ARNIE checks what it hears against ----------
function ChartStrip({ v }: { v: EngineView }) {
  const { allergies, orders } = v.case;
  const chip = "rounded-full bg-tile px-3 py-1 text-[15px]";
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-2" aria-label="Chart">
      <p className="flex flex-wrap items-center gap-2">
        <span className={sectionTitle}>Allergies</span>
        {allergies.length
          ? allergies.map((a) => (
            <span key={a} className={cn(chip, "inline-flex items-center gap-1.5")}><span aria-hidden className="size-2 rounded-full bg-critical" />{sentence(a)}</span>
          ))
          : <span className="text-[15px] text-label-3">None recorded</span>}
      </p>
      {orders.length > 0 && (
        <p className="flex flex-wrap items-center gap-2">
          <span className={sectionTitle}>Ordered</span>
          {orders.map((o) => <span key={o} className={chip}>{o}</span>)}
        </p>
      )}
    </div>
  );
}

// ---------- Alert banner: only when something is wrong ----------
function activeAlert(v: EngineView, now: number | null): { sev: Exclude<Severity, "info">; text: string } | null {
  const last = [...v.transcript].reverse().find((t) => t.who === "sv" && t.severity && t.severity !== "info");
  if (last && now && now - last.at < ALERT_MS) {
    return { sev: last.severity as Exclude<Severity, "info">, text: sentence(last.text.replace(/^(Caution|Please verify):\s*/, "").replace(/^Logged\.\s*/, "")) };
  }
  if (v.counts.status === "mismatch") return { sev: "critical", text: `Count not reconciled: ${v.counts.missing.join(", ")}.` };
  return null;
}

function AlertBanner({ v, now }: { v: EngineView; now: number | null }) {
  const a = activeAlert(v, now);
  if (!a) return null;
  const critical = a.sev === "critical";
  const Icon = critical ? OctagonAlert : AlertTriangle;
  return (
    <div
      role="alert"
      key={a.text}
      className={cn("tile tile-alert-in flex items-center gap-5 px-7 py-5", critical ? "text-white" : "text-black")}
      style={{ background: critical ? "var(--critical)" : "var(--amber)" }}
    >
      <Icon className="size-10 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="text-[19px] font-bold">{critical ? "Critical" : "Warning"}</p>
        <p className="text-[28px] font-semibold leading-tight tracking-[-0.01em]">{a.text}</p>
      </div>
    </div>
  );
}

// ---------- Focus panels ----------
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

/** One cell of the surgery panel: a quiet label, then the value. */
function Cell({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col justify-center p-6", className)}>
      <p className={sectionTitle}>{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function SurgeryFocus({ v }: { v: EngineView }) {
  const op = v.operation;
  const tq = v.tourniquet;
  const tqLevel: Severity | null = !tq ? null : tq.seconds >= 7200 ? "critical" : tq.seconds >= 3600 ? "warning" : "info";
  const c = v.counts;
  const big = "tnum text-[44px] font-semibold leading-none tracking-[-0.03em]";
  const quiet = "text-[22px] text-label-3";
  return (
    <div className="-m-6 grid h-[calc(100%+3rem)] grid-cols-1 divide-white/[0.08] sm:grid-cols-2 sm:grid-rows-2 max-sm:divide-y sm:[&>*:nth-child(-n+2)]:border-b sm:[&>*:nth-child(odd)]:border-r sm:[&>*]:border-white/[0.08]">
      <Cell label="Operation">
        {op ? (
          <>
            <p className={big}>{sentence(op.duration)}</p>
            <p className="tnum mt-2 text-[17px] text-label-2">{op.end ? `${op.start} – ${op.end} · done` : `Since ${op.start}`}</p>
          </>
        ) : (
          <p className={quiet}>Not started</p>
        )}
      </Cell>
      <Cell label={tq ? `Tourniquet · ${tq.side}` : "Tourniquet"}>
        {tq ? (
          <>
            <p className={cn(big, tqLevel === "critical" && "text-critical", tqLevel === "warning" && "text-amber")}>{mmss(tq.seconds)}</p>
            <p className="mt-2 text-[17px] text-label-2">Alerts at 60, 90 and 120 minutes</p>
          </>
        ) : (
          <p className={quiet}>Not on</p>
        )}
      </Cell>
      <Cell label="Counts">
        {c.status === "none" ? (
          <p className={quiet}>Nothing opened</p>
        ) : (
          <>
            <p className={cn("tnum text-[28px] font-semibold", c.status === "mismatch" && "text-critical")}>
              {c.final ? `${c.final.sponge} of ${c.opened.sponge} sponges` : `${c.opened.sponge} sponges opened`}
            </p>
            <p className={cn("mt-1 text-[17px]", c.status === "mismatch" ? "text-critical" : "text-label-2")}>
              {c.status === "reconciled" ? "Reconciled" : c.status === "mismatch" ? c.missing.join(", ") : "Final count pending"}
              {c.opened.needle ? ` · ${c.opened.needle} needles` : ""}
            </p>
          </>
        )}
      </Cell>
      <Cell label="Implants">
        {v.implants.length === 0 ? (
          <p className={quiet}>None recorded</p>
        ) : (
          <ul className="space-y-1">
            {v.implants.map((im) => (
              <li key={`${im.time}-${im.name}`} className="flex gap-3 text-[19px]"><span className="tnum text-label-3">{im.time}</span>{im.name}</li>
            ))}
          </ul>
        )}
      </Cell>
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

type FocusKey = "ct" | "consult" | "signin" | "timeout" | "signout" | "summary" | "surgery" | "ready";
function focusOf(v: EngineView): FocusKey {
  if (v.imaging?.visible) return "ct";
  if (v.consult && v.consult.state !== "ended") return "consult";
  if (v.phase === "signin" || v.phase === "timeout" || v.phase === "signout") return v.phase;
  if (v.summary) return "summary";
  if (v.operation || v.phase === "surgery" || v.phase === "done" || v.tourniquet || v.counts.status !== "none") return "surgery";
  return "ready";
}

function Focus({ v }: { v: EngineView }) {
  const key = focusOf(v);
  const body: React.ReactNode =
    key === "ct" ? <div className="mx-auto aspect-square h-full max-h-full max-w-full"><CtViewer imaging={v.imaging!} /></div>
      : key === "consult" ? <ConsultFocus v={v} />
        : key === "signin" || key === "timeout" || key === "signout" ? <ChecklistFocus list={v.checklists[key]} />
          : key === "summary" ? <SummaryFocus v={v} />
            : key === "surgery" ? <SurgeryFocus v={v} />
              : <ReadyFocus />;
  return (
    <section aria-label="Focus" className={cn("tile min-h-[420px] overflow-hidden p-6 lg:min-h-0", key === "ct" && "bg-black! p-3")}>
      <div key={key} className="focus-in h-full min-h-0">{body}</div>
    </section>
  );
}

// ---------- Right column: the conversation, then the case log ----------
function Conversation({ v }: { v: EngineView }) {
  const lines = v.transcript.slice(-3);
  return (
    <section aria-label="Conversation" className="tile flex-none p-6">
      <h2 className={sectionTitle}>Conversation</h2>
      {lines.length === 0 ? (
        <p className="mt-3 text-[17px] text-label-3">Waiting for the room…</p>
      ) : (
        <ol className="mt-3 space-y-3" aria-live="polite">
          {lines.map((t) => {
            const sev = t.severity ?? "info";
            return (
              <li key={`${t.at}-${t.text}`}>
                <p className="text-[13px] text-label-3">{t.who === "heard" ? "Heard" : "ARNIE"}</p>
                <p
                  className={cn(
                    "line-clamp-2 text-[17px] leading-snug",
                    t.who === "heard" ? "text-label-2" : "text-foreground",
                    t.who === "sv" && sev === "critical" && "text-critical",
                    t.who === "sv" && sev === "warning" && "text-amber",
                  )}
                >
                  {t.text}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function CaseLog({ v }: { v: EngineView }) {
  // Newest first: when the tile is full, the oldest entries are the ones that drop off.
  const rows = v.log.slice(-10).reverse();
  return (
    <section aria-label="Case log" className="tile flex min-h-0 flex-1 flex-col p-6">
      <h2 className={sectionTitle}>Case log · newest first</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-[17px] text-label-3">Nothing logged yet.</p>
      ) : (
        <ol className="mt-2 min-h-0 flex-1 divide-y divide-white/[0.08] overflow-hidden [mask-image:linear-gradient(to_bottom,black_85%,transparent)]">
          {rows.map((l) => {
            const sev = l.severity ?? (l.kind === "alert" ? "warning" : null);
            return (
              <li key={`${l.at}-${l.text}`} className="flex items-baseline gap-4 py-2.5">
                <span className="tnum w-12 shrink-0 text-[15px] text-label-3">{l.time}</span>
                <span className={cn("text-[17px] leading-snug", sev === "critical" && "text-critical", sev === "warning" && "text-amber")}>{l.text}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
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

  return (
    <main className="flex min-h-dvh w-full flex-1 flex-col gap-5 p-4 sm:p-6 lg:h-dvh lg:min-h-0 lg:flex-none lg:overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-1">
        <div className="flex min-w-0 items-center gap-4">
          <Logo size={24} />
          <span aria-hidden className="h-6 w-px bg-white/15 max-sm:hidden" />
          <h1 className="min-w-0 truncate text-[20px]">
            <span className="font-semibold">{v.case.room}</span>
            <span className="text-label-2"> · {v.case.patient}</span>
            <span className="text-label-2 max-lg:hidden"> · {v.case.procedure}</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <PhaseSteps v={v} />
          <ArnieStatus v={v} now={now} />
          <button
            type="button"
            onClick={() => (audio ? (audio.close(), setAudio(null)) : setAudio(new AudioContext()))}
            aria-pressed={!!audio}
            aria-label={audio ? "Alert tones on" : "Alert tones off"}
            title={audio ? "Alert tones on" : "Turn on alert tones"}
            className="inline-flex size-9 items-center justify-center rounded-full bg-tile text-label-2 transition-colors hover:text-foreground"
          >
            {audio ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
          </button>
          <span aria-label={connected ? "Connected" : "Reconnecting"} className={cn("size-2 rounded-full", connected ? "bg-teal" : "bg-amber")} />
          <span className="tnum text-[34px] font-semibold tracking-[-0.02em]">{d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : "--:--"}</span>
        </div>
      </header>

      <ChartStrip v={v} />

      <AlertBanner v={v} now={now} />

      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[2fr_1fr]">
        <Focus v={v} />
        <aside className="flex min-h-0 flex-col gap-5" aria-label="Conversation and case log">
          <Conversation v={v} />
          <CaseLog v={v} />
        </aside>
      </div>
    </main>
  );
}
