// Operon brain (voice agent "ARNIE"): the deterministic state machine behind the voice agent.
// Agora's agent sends every heard sentence here (via the custom LLM endpoint).
//
// Flow for a command:  heard text → ruleIntent() → (fallback: LLM → same Intent shape) → applyIntent()
// The LLM may only produce an Intent. Every spoken reply is a template in this file, and
// confirmations / checklist answers are never interpreted by a model.
import { matchDrug, allergyConflict } from "./formulary.js";
import { normalizeHeard } from "./asr.js";
import { ctCommand, currentSlice, newImaging, LANDMARK_RE, PLAY_MS, type CtAction, type Imaging } from "./ct.js";
import { findMedMention, fmtDose, parseDose, parseOrders, sameDose, unknownDrugWord, type Dose, type Order } from "./meds.js";

export type ChecklistName = "signin" | "timeout" | "signout";
type Item = { id: string; spoken: string; label: string; ask: string };

export const CHECKLISTS: Record<ChecklistName, { title: string; items: Item[] }> = {
  signin: {
    title: "Sign in",
    items: [
      { id: "identity", spoken: "identity check", label: "Identity, site, procedure", ask: "Nurse, has the patient confirmed identity, site and procedure?" },
      { id: "anesthesia", spoken: "anesthesia check", label: "Anesthesia check", ask: "Anesthesia, is the machine and medication check complete?" },
    ],
  },
  timeout: {
    title: "Time out",
    items: [
      { id: "patient", spoken: "patient confirmation", label: "Patient & procedure", ask: "Team, confirm patient name and procedure." },
      { id: "site", spoken: "site marking", label: "Site marked", ask: "Surgeon, is the site marked?" },
      { id: "antibiotic", spoken: "antibiotic check", label: "Antibiotic within 60 min", ask: "Anesthesia, was antibiotic prophylaxis given within the last 60 minutes?" },
      { id: "events", spoken: "critical events review", label: "Anticipated critical events", ask: "Surgeon, any anticipated critical events?" },
    ],
  },
  signout: {
    title: "Sign out",
    items: [
      { id: "counts", spoken: "count check", label: "Counts correct", ask: "Nurse, are instrument and sponge counts correct?" },
      { id: "specimen", spoken: "specimen labelling", label: "Specimen labelled", ask: "Is the specimen labelled?" },
      { id: "tourniquet", spoken: "tourniquet removal", label: "Tourniquet off", ask: "Surgeon, is the tourniquet off?" },
    ],
  },
};

/** Default on-call roster, used when the case setup doesn't list one. */
export const SPECIALISTS: Record<string, string> = {
  vascular: "Dr. Valdez",
  anesthesia: "Dr. Ramos",
  orthopedics: "Dr. Lim",
  neurosurgery: "Dr. Cruz",
};
export type OnCall = { specialty: string; doctor: string };

/** "vascular: Dr. Valdez; orthopedics: Dr. Lim" -> the on-call roster for this case. */
export function parseRoster(text: string | undefined): OnCall[] {
  const typed = (text ?? "").split(/[;\n]+/).map((p) => p.split(/[:=]/)).filter((p) => p.length >= 2)
    .map(([s, ...d]) => ({ specialty: s.toLowerCase().replace(/[^a-z\s]/g, "").trim(), doctor: d.join(":").trim() }))
    .filter((r) => r.specialty && r.doctor);
  return typed.length ? typed : Object.entries(SPECIALISTS).map(([specialty, doctor]) => ({ specialty, doctor }));
}

/** Who to call for what was heard: a specialty ("vascular", "ortho") or a doctor's name ("Valdez"). */
function findOnCall(state: State, heard: string): OnCall | null {
  const h = heard.toLowerCase().replace(/^dr\.?\s+/, "").replace(/[^a-z\s]/g, "").trim();
  if (h.length < 3) return null;
  const last = h.split(/\s+/).at(-1)!;
  const roster = state.case.specialists;
  const stem = (x: string) => x.replace(/[^a-z]/g, "").replace(/ae/g, "e").slice(0, 5);
  return roster.find((r) => r.specialty === h)
    ?? roster.find((r) => r.specialty.startsWith(h) || h.startsWith(r.specialty))
    ?? roster.find((r) => h.split(/\s+/)[0].length >= 4 && stem(h.split(/\s+/)[0]) === stem(r.specialty))
    ?? roster.find((r) => r.doctor.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).includes(last))
    ?? null;
}

export const MILESTONES = { incision: "Incision", closure: "Closure" } as const;
export type Milestone = keyof typeof MILESTONES;
export type CountItem = "sponge" | "needle";

/** The only thing the LLM is allowed to produce. Flat, with "none"/""/-1 defaults, for strict JSON schemas. */
export type Intent = {
  intent:
    | "start_checklist" | "tourniquet_on" | "tourniquet_off" | "give_drug" | "antibiotic_time"
    | "preop_value" | "call_specialist" | "tourniquet_time"
    | "open_items" | "final_count" | "milestone" | "imaging" | "lookup" | "conversation" | "unknown";
  checklist: ChecklistName | "none";
  side: "left" | "right" | "none";
  limb: "thigh" | "arm" | "leg" | "forearm" | "calf" | "none";
  drug: string;
  /** give_drug: the dose as heard ("2 grams"), or empty. */
  dose: string;
  value: "potassium" | "hemoglobin" | "none";
  /** call_specialist: the specialty or doctor's name as heard, or "none". */
  specialty: string;
  /** lookup: what the team asked to hear from the case record. */
  topic: "allergies" | "orders" | "procedure" | "patient" | "counts" | "given" | "milestones" | "briefing" | "time" | "elapsed" | "summary" | "none";
  /** open_items: what was opened, how many, and a description (e.g. "4-0 Prolene", "6 mm PTFE graft"). */
  item: "sponge" | "needle" | "suture" | "implant" | "none";
  quantity: number;
  detail: string;
  /** final_count: counted totals, -1 when not said. */
  sponges: number;
  needles: number;
  milestone: Milestone | "none";
  /** imaging: what to do with the CT. A slice number or scroll amount goes in "quantity", a landmark in "detail". */
  imaging: CtAction;
};

export const EMPTY_INTENT: Intent = {
  intent: "unknown", checklist: "none", side: "none", limb: "none", drug: "", dose: "", value: "none", specialty: "none", topic: "none",
  item: "none", quantity: 0, detail: "", sponges: -1, needles: -1, milestone: "none", imaging: "none",
};

export type CaseSetup = {
  patient?: string; summary?: string; procedure?: string; site?: string; room?: string;
  allergies?: string[]; preop?: Record<string, string>; antibioticGiven?: { drug: string; at: number } | null;
  /** Ordered medications from the chart, e.g. "cefazolin 2 g; heparin 5000 units". Doses heard are checked against these. */
  orders?: string;
  /** On-call roster, e.g. "vascular: Dr. Valdez; orthopedics: Dr. Lim". */
  specialists?: string;
};
export type Severity = "info" | "warning" | "critical";
export type LogEntry = {
  at: number; time: string; text: string;
  kind: "event" | "alert" | "check" | "consult" | "drug" | "count" | "implant" | "milestone" | "imaging";
  severity?: Severity; drug?: string;
};
type Pending =
  | { kind: "tourniquet-on" | "tourniquet-off"; side: string; at: number }
  | { kind: "drug"; drug: string; dose: Dose | null; at: number }
  | { kind: "items"; item: CountItem | "suture"; quantity: number; detail: string; at: number }
  | { kind: "implant"; detail: string; at: number }
  | { kind: "final-count"; sponges: number; needles: number; at: number }
  | { kind: "milestone"; milestone: Milestone; at: number };

export type State = {
  case: Required<Omit<CaseSetup, "antibioticGiven" | "orders" | "specialists">> & {
    antibioticGiven: { drug: string; at: number } | null; orders: Order[]; specialists: OnCall[];
  };
  phase: "idle" | ChecklistName | "surgery" | "done";
  checklist: { name: ChecklistName; index: number; done: Record<string, boolean>; blocked: boolean; askedAt: number; settleMs: number } | null;
  completed: Partial<Record<ChecklistName, number>>;
  pending: Pending | null;
  log: LogEntry[];
  tourniquet: { side: string; start: number; alerts: number[] } | null;
  consult: { specialty: string; doctor: string; state: "ringing" | "live" | "ended"; start: number } | null;
  counts: Record<CountItem, number>; // opened onto the field
  finalCount: Record<CountItem, number> | null;
  implants: { time: string; name: string }[];
  milestones: Partial<Record<Milestone, number>>;
  imaging: Imaging | null;
  signedAt: number | null;
  /** Not listening: the team is talking about ARNIE (a briefing, a demo), not to it. Alarms still sound. */
  paused: boolean;
  /** Until when a sentence without the wake word still counts as addressed to ARNIE (after "Hey ARNIE" alone). */
  attentionUntil: number;
  /** The last end-of-case summary ARNIE spoke (model-written from summaryFacts, or the template). */
  summary: { text: string; at: number } | null;
};

export type Opts = { minuteMs: number; alertMinutes?: number[] };
/** handle() result: words to speak, null for silence, a request to parse a command with the LLM,
 *  or room speech naming a drug we don't list, to be screened against the recorded allergies. */
export type Turn = string | null | { parse: string } | { screen: string } | { chat: string } | { summarize: true };

// Wake word: "ARNIE" (Always Ready Nurse, In Emergencies), Operon's voice agent. Speech recognition
// may spell it Arnie, Arney, Arny, Arni or hear "Ernie"; all of these wake it. Whole word only, and
// everyday words that sound close ("army", "Annie", "honey") never do.
// Live Agora test with synthesized speech: ARES wrote "Arnie" about half the time and "Arne" the rest.
const WAKE = /\b(?:arnie|arne|arney|arny|arni|arnee|arnay|ardi|ardie|ernie|earnie|ahnie|arnies)(?:'s)?\b/i;
/** After "Hey ARNIE" on its own, the next sentence within this window is for ARNIE (people pause after the name). */
export const ATTENTION_MS = 10_000;
/** What "ARNIE" also comes through as, but that is everyday talk too ("I need more suction"). At the start
 *  of a sentence it only counts as the wake word when the rest is a clear command for the rules (never a
 *  chat or a model guess), so "I need, what time is it?" works and "I need more suction" stays silent. */
const SOFT_WAKE = /^\s*(?:i need|i knee|are knee|r knee|our knee|honey|and he)\b[\s,.:;-]*/i;
const YES = /\b(confirm(ed)?|yes|yep|correct|complete(d)?|done|affirmative|marked|given|none|no concerns?|labell?ed|off)\b/i;
const CONFIRM = /\b(confirm(ed)?|yes|correct|affirmative)\b/i;
const NO = /\b(cancel|no,? wait|wrong|correction|negative|scratch that)\b/i;
const QUESTION = /^(what|whats|what's|which|how many|how much|when|who|tell me|remind me|read( me)? back|any|is there|are there|do we have|list|check)\b|\?$/i;
const ABOUT_ARNIE = /\b(your name|who are you|what are you|stand for|name mean|who(?:'s| is) arnie|what(?:'s| is) arnie|who made you|who built you|what can you do|how can you help|what do you do|introduce yourself|tell (?:me|us) about yourself|how are you|are you (?:there|listening|ready|awake)|thank(?:s| you)|good (?:morning|afternoon|evening|job)|hello|hi there)\b/i;
const SKIP = /\b(skip|let'?s (just )?start|move on|later|no time|we'?re late|go ahead without)\b/i;
export const SAY_AGAIN = "Sorry, say that again.";

const WORD_NUM: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
};
const num = (s: string | undefined): number => (s ? (/^\d+$/.test(s) ? Number(s) : WORD_NUM[s.toLowerCase()] ?? NaN) : NaN);
const NUM = String.raw`(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)`;

// Times are spoken and logged in the hospital's time zone, not the server's
// (the engine runs on a UTC host; found when ARNIE said 18:05 at 02:05 Manila time).
const TIME_ZONE = process.env.CASE_TIMEZONE || "Asia/Manila";
const hhmm = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TIME_ZONE });
export const clock = (ms: number) => hhmm.format(new Date(ms));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const minutesSince = (ms: number, now: number, minuteMs: number) => Math.floor((now - ms) / minuteMs);

export function createState(setup: CaseSetup = {}): State {
  return {
    case: {
      patient: setup.patient ?? "Juan Cruz",
      summary: setup.summary ?? "58-year-old male, left femoral bleed",
      procedure: setup.procedure ?? "Exploration and repair, left femoral artery",
      site: setup.site ?? "left thigh",
      room: setup.room ?? "OR 3",
      allergies: (setup.allergies ?? ["penicillin"]).map((a) => a.toLowerCase().trim()).filter(Boolean),
      preop: setup.preop ?? { potassium: "3.9", hemoglobin: "9.8" },
      antibioticGiven: setup.antibioticGiven ?? null,
      orders: parseOrders(setup.orders),
      specialists: parseRoster(setup.specialists),
    },
    phase: "idle",
    checklist: null,
    completed: {},
    pending: null,
    log: [],
    tourniquet: null,
    consult: null,
    counts: { sponge: 0, needle: 0 },
    finalCount: null,
    implants: [],
    milestones: {},
    imaging: null,
    signedAt: null,
    paused: false,
    attentionUntil: 0,
    summary: null,
  };
}

function addLog(state: State, now: number, text: string, kind: LogEntry["kind"] = "event", extra: Partial<LogEntry> = {}) {
  state.log.push({ at: now, time: clock(now), text, kind, ...extra });
}
const alert = (state: State, now: number, text: string, severity: Severity) => addLog(state, now, text, "alert", { severity });

/** Severity of something ARNIE says, for the board's colors (IEC 60601-1-8 style). */
export function severityOf(text: string): Severity {
  if (/^(Caution|Count mismatch|Count not reconciled)|Logged\. Count mismatch|Caution: counts not reconciled|Tourniquet time: 1[2-9]\d minutes/.test(text)) return "critical";
  if (/not complete|^Tourniquet time:|^Please verify/.test(text)) return "warning";
  return "info";
}

// Roughly how long the agent takes to say a line. An answer cannot belong to a question the
// room has not finished hearing, so answers inside this window are ignored. (Found in a live
// Agora test: "Site marked... Confirmed." was split into two turns, and the trailing
// "Confirmed." would otherwise have confirmed the next item.)
export const speakingMs = (text: string) => text.split(/\s+/).length * 330 + 500;

function asked(state: State, text: string, now: number) {
  if (state.checklist) { state.checklist.askedAt = now; state.checklist.settleMs = speakingMs(text); }
  return text;
}

function startChecklist(state: State, name: ChecklistName, now: number) {
  state.phase = name;
  state.checklist = { name, index: 0, done: {}, blocked: false, askedAt: now, settleMs: 0 };
  return asked(state, `${CHECKLISTS[name].title}. ${CHECKLISTS[name].items[0].ask}`, now);
}

/** Opened vs counted, for items that were opened at all. */
export function reconcile(state: State): { ok: boolean; missing: string[]; needsCount: boolean } {
  const opened = (Object.keys(state.counts) as CountItem[]).filter((k) => state.counts[k] > 0);
  if (!opened.length) return { ok: true, missing: [], needsCount: false };
  if (!state.finalCount) return { ok: false, missing: [], needsCount: true };
  const missing = opened
    .filter((k) => state.finalCount![k] !== state.counts[k])
    .map((k) => {
      const diff = state.counts[k] - state.finalCount![k];
      return diff > 0 ? `${plural(diff, k)} unaccounted` : `${plural(-diff, k)} over the count`;
    });
  return { ok: missing.length === 0, missing, needsCount: false };
}

function answerChecklist(state: State, text: string, now: number): string | null {
  const cl = state.checklist!;
  const list = CHECKLISTS[cl.name];
  const item = list.items[cl.index];
  if (now < cl.askedAt + cl.settleMs) return null; // the question is still being spoken

  if (SKIP.test(text)) {
    cl.blocked = true;
    alert(state, now, `${list.title} blocked: ${item.label} not confirmed`, "warning");
    return asked(state, `${list.title} not complete: ${item.spoken} not confirmed. ${item.ask}`, now);
  }
  if (!YES.test(text)) return null; // not an answer: stay quiet and keep waiting

  // The count item cannot be confirmed by voice alone if the logged counts don't reconcile.
  if (item.id === "counts") {
    const r = reconcile(state);
    if (!r.ok) {
      cl.blocked = true;
      const why = r.needsCount ? "say the final count first" : r.missing.join(", ");
      alert(state, now, `Count not reconciled: ${why}`, "critical");
      return asked(state, `Count not reconciled: ${why}. ${item.ask}`, now);
    }
  }

  cl.done[item.id] = true;
  cl.blocked = false;
  cl.index += 1;
  if (cl.index < list.items.length) return asked(state, list.items[cl.index].ask, now);

  state.completed[cl.name] = now;
  addLog(state, now, `${list.title} complete`, "check");
  state.checklist = null;
  state.phase = cl.name === "signout" ? "done" : "surgery";
  return `${list.title} complete.`;
}

/** The first listed drug named anywhere in a sentence, or "". */
function drugNamedIn(t: string): string {
  const w = t.replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  for (let i = 0; i < w.length; i++) {
    const hit = matchDrug(w.slice(i, i + 2).join(" "), 6) ?? matchDrug(w[i], 6);
    if (hit) return hit;
  }
  return "";
}

/** Fast, deterministic command parsing. Returns null when the rules cannot tell what was meant. */
export function ruleIntent(body: string): Intent | null {
  const t = body.toLowerCase();
  const I = (p: Partial<Intent>): Intent => ({ ...EMPTY_INTENT, ...p });
  let m: RegExpMatchArray | null;

  if (/\bsign[\s-]?in\b/.test(t)) return I({ intent: "start_checklist", checklist: "signin" });
  if (/\btime[\s-]?out\b/.test(t)) return I({ intent: "start_checklist", checklist: "timeout" });
  if (/\bsign[\s-]?out\b/.test(t)) return I({ intent: "start_checklist", checklist: "signout" });

  // Imaging (display only): needs an imaging word or a CT-only phrase, so "open 3 sponges" is never read as imaging.
  const ct = (imaging: CtAction, p: Partial<Intent> = {}) => I({ intent: "imaging", imaging, ...p });
  if (/\b(hide|close|clear|dismiss)\b.*\b(ct|scan|images?|imaging)\b/.test(t)) return ct("hide");
  if ((m = t.match(new RegExp(`\\b(?:go to|jump to|show(?: me)?|take me to|bring up)\\s+(?:the\\s+)?(?:slice\\s+(?:at|for)\\s+the\\s+)?${LANDMARK_RE.source}`)))) return ct("landmark", { detail: m[1] });
  if ((m = t.match(/\b(?:go to|jump to|show(?: me)?)?\s*slice\s+(?:number\s+)?(\d+)\b/))) return ct("goto", { quantity: Number(m[1]) });
  if ((m = t.match(new RegExp(`\\b(?:scroll|go|move|skip)\\s+(down|forward|ahead|up|back)\\s+${NUM}\\b|\\b(next|back|previous)\\s+${NUM}\\s+(?:slices|images)\\b`)))) {
    const down = /down|forward|ahead|next/.test(m[1] ?? m[3]);
    return ct(down ? "scroll_down" : "scroll_up", { quantity: num(m[2] ?? m[4]) });
  }
  if (/\b(show|display|pull up|bring up|open)\b.*\b(ct|scan|images?|imaging)\b/.test(t)) return ct("show");
  if (/\bnext (slice|image)\b|\bscroll down\b/.test(t)) return ct("next");
  if (/\b(previous|last|back one) (slice|image)\b|\bscroll up\b/.test(t)) return ct("previous");
  if (/\bzoom in\b|\benlarge\b|\bcloser\b|\bmagnify\b/.test(t)) return ct("zoom_in");
  if (/\bzoom out\b/.test(t)) return ct("zoom_out");
  if ((m = t.match(/\b(?:pan|move|shift|slide)\s+(?:the\s+(?:image|view)\s+)?(left|right|up|down)\b/))) return ct(`pan_${m[1]}` as CtAction);
  if (/\breset (the )?(view|image|zoom)\b|\bfit (it )?(to )?(the )?(screen|window)\b/.test(t)) return ct("reset");
  if (/\bbone window\b|\bbone setting\b|\bshow (me )?the bones?\b/.test(t)) return ct("window_bone");
  if (/\bsoft[- ]tissue\b|\bmuscle window\b/.test(t)) return ct("window_soft");
  if (/\b(wide|full|lung) window\b/.test(t)) return ct("window_wide");
  if (/\bcoronal\b|\bfront view\b|\bfrom the front\b|\bwhole leg\b/.test(t)) return ct("view_coronal");
  if (/\bsagittal\b|\bside view\b|\bfrom the side\b/.test(t)) return ct("view_sagittal");
  if (/\baxial\b|\bcross[- ]section\b/.test(t)) return ct("view_axial");
  if (/\b(play|cine|loop)\b|\b(scroll|run|go|flip) through\b/.test(t)) return ct("play");
  if (/^(stop|pause|freeze|hold it|hold there)\b|\bstop (the )?(scan|scrolling|playing|images?|ct)\b/.test(t)) return ct("stop");
  if (/\brotate\b/.test(t)) return ct("rotate");

  if (/tourniquet/.test(t) && /\b(how long|minutes|time)\b/.test(t) && (QUESTION.test(t) || !/\b(on|off)\b/.test(t))) return I({ intent: "tourniquet_time" });
  m = t.match(/tourniquet\s+(on|off)(?:[,\s]+(?:the\s+)?(left|right)\s+(thigh|arm|leg|forearm|calf))?/);
  if (m) return I({ intent: m[1] === "on" ? "tourniquet_on" : "tourniquet_off", side: (m[2] as Intent["side"]) ?? "none", limb: (m[3] as Intent["limb"]) ?? "none" });

  // Counts: "final count 12 sponges, 2 needles"
  if (/\bfinal count\b|\bcount is\b/.test(t)) {
    const s = t.match(new RegExp(`${NUM}\\s+(?:sponges?|lap(?:arotomy)? pads?|gauzes?)`));
    const n = t.match(new RegExp(`${NUM}\\s+needles?`));
    return I({ intent: "final_count", sponges: s ? num(s[1]) : -1, needles: n ? num(n[1]) : -1 });
  }
  // Sutures: "opening a 4-0 Prolene", "open two 3-0 vicryl"
  m = t.match(new RegExp(`\\bopen(?:ing|ed)?\\s+(?:${NUM}\\s+)?(\\d|one|two|three|four|five|six)\\s*[-\\s]?\\s*(?:0|o|oh|zero)\\s+(prolene|vicryl|nylon|silk|monocryl|pds|ethilon)`));
  if (m) {
    const qty = m[1] ? num(m[1]) : 1;
    const gauge = /^\d$/.test(m[2]) ? m[2] : String(num(m[2]));
    return I({ intent: "open_items", item: "suture", quantity: qty, detail: `${gauge}-0 ${cap(m[3])}` });
  }
  // Sponges / needles: "opening 3 sponges", "add ten lap pads"
  m = t.match(new RegExp(`\\b(?:open(?:ing|ed)?|add(?:ing)?)\\s+${NUM}\\s+(sponges?|lap(?:arotomy)? pads?|gauzes?|needles?)\\b`));
  if (m) return I({ intent: "open_items", item: /needle/.test(m[2]) ? "needle" : "sponge", quantity: num(m[1]) });
  // Implants: "implant a 6 millimeter PTFE graft"
  // (matched on the original text so the name keeps its case, e.g. "PTFE")
  m = body.match(/\bimplant(?:ing|ed)?\s+(?:(?:a|an|the|one)\s+)?(.+)$/i);
  if (m) return I({ intent: "open_items", item: "implant", quantity: 1, detail: m[1].replace(/[.,!?]+$/, "").trim() });

  // The time, and how long the operation has run (read from the clock and the confirmed log).
  if (/\bwhat(?:'s| is)? (?:the )?time(?: is it)?\b|\bcurrent time\b|\btime check\b|\bwhat time is it\b/.test(t) && !/\b(incision|closure|antibiotic|tourniquet|given)\b/.test(t)) {
    return I({ intent: "lookup", topic: "time" });
  }
  if (/\bhow long\b.*\b(operating|operation|surgery|procedure|case|been going|in here|been at it)\b|\b(operating|operation|surgical) time\b|\bhow long have we been\b/.test(t) && !/\btourniquet\b/.test(t)) {
    return I({ intent: "lookup", topic: "elapsed" });
  }
  // A heads-up on the patient and where things stand (after scrubbing in, or when someone joins).
  if (/\bbrief(?:ing)? (?:me|us|the team)\b|\bbriefing\b|\bheads[- ]up\b|\b(?:give me|what's|whats|what is) (?:the |a )?(?:rundown|run down|status|update)\b|\bstatus update\b|\bcatch (?:me|us) up\b|\bpatient status\b|\bwhere are we\b/.test(t)) {
    return I({ intent: "lookup", topic: "briefing" });
  }
  // End-of-case summary.
  if (/\b(?:summar(?:y|ize|ise)|recap|debrief|sum (?:it )?up|wrap(?:-| )?up)\b/.test(t)) return I({ intent: "lookup", topic: "summary" });
  // Start and end of the operation (the incision and closure times).
  if (/\b(?:start|begin|starting|beginning|commence)\s+(?:the\s+)?(?:operation|surgery|procedure|case)\b|\bwe(?:'re| are) starting\b|\boperation (?:is )?(?:starting|started|begins)\b/.test(t)) {
    return I({ intent: "milestone", milestone: "incision" });
  }
  if (/\b(?:end|finish|ending|finishing|complete|close out|conclude)\s+(?:the\s+)?(?:operation|surgery|procedure|case)\b|\b(?:operation|surgery|procedure|case) (?:is )?(?:done|over|complete|completed|finished)\b|\bwe(?:'re| are) (?:done|finished)\b/.test(t)) {
    return I({ intent: "milestone", milestone: "closure" });
  }

  // Talking to ARNIE about ARNIE, or small talk: answered in its own words, never a lookup.
  if (ABOUT_ARNIE.test(t)) return I({ intent: "conversation" });

  // Questions about the case record: read back, never logged. (Antibiotic time, pre-op labs and the
  // tourniquet clock have their own answers below.)
  if (QUESTION.test(t) && !/\b(antibiotic|potassium|hemoglobin|haemoglobin|tourniquet)\b/.test(t)) {
    if (/\ballerg/.test(t)) return I({ intent: "lookup", topic: "allergies" });
    if (/\b(ordered|orders?|dose|how much)\b/.test(t)) return I({ intent: "lookup", topic: "orders", drug: drugNamedIn(t) });
    if (/\b(given|meds|medications|drugs)\b/.test(t)) return I({ intent: "lookup", topic: "given" });
    if (/\b(sponges?|needles?|counts?)\b/.test(t) && !/\bfinal count\b/.test(t)) return I({ intent: "lookup", topic: "counts" });
    if (/\b(incision|closure|closing)\b/.test(t)) return I({ intent: "lookup", topic: "milestones" });
    if (/\b(procedure|operation|surgery|site|side)\b/.test(t)) return I({ intent: "lookup", topic: "procedure" });
    // Only "who is it" questions; anything else about the patient ("is the patient diabetic?") is a conversation.
    if (/\bwho(?:'s| is)\s+(?:the\s+)?(?:patient|on the table|this)\b|\bpatient'?s name\b|\bname of the patient\b|\b(?:which|what) patient\b|\babout the patient\b/.test(t)) {
      return I({ intent: "lookup", topic: "patient" });
    }
  }

  // Milestones
  if (/\b(skin\s+)?incision\b/.test(t)) return I({ intent: "milestone", milestone: "incision" });
  if (/\bclos(ure|ing)\b/.test(t)) return I({ intent: "milestone", milestone: "closure" });

  // "Should we give more heparin?" asks for a decision, not an order: answered by conversation (which hands it back to the team).
  if (/^(?:should|shall|do we|can we|could we|would|is it (?:ok|okay|safe)|how much should|what (?:dose|should))\b/.test(t) && /\b(?:give|push|start|use|dose)\b/.test(t)) {
    return I({ intent: "conversation" });
  }
  m = t.match(/\b(?:give|giving|gave|administer(?:ing)?|push(?:ing)?|inject(?:ing)?)\s+(.+)$/);
  if (m) {
    const drug = m[1].replace(/[.,!?]+$/, "").replace(/^(?:(?:the|some|a|an|him|her|them|it|patient|more|extra|another)\s+)+/, "").replace(/(?:\s+(?:for me|please|now))+$/, "").trim();
    return I({ intent: "give_drug", drug });
  }

  if (/antibiotic/.test(t) && /(when|time|given)/.test(t)) return I({ intent: "antibiotic_time" });
  m = t.match(/\b(potassium|hemoglobin|haemoglobin)\b/);
  if (m) return I({ intent: "preop_value", value: m[1].replace("haemo", "hemo") as Intent["value"] });

  m = t.match(/\b(?:call|page)\s+((?:dr\.?\s+)?[a-z]+(?:\s+[a-z]+)?)/);
  if (m && !/^(me|the|a|it|him|her|them|back)\b/.test(m[1])) {
    return I({ intent: "call_specialist", specialty: m[1].replace(/\s+(please|now|in|for|to)$/, "") });
  }

  return null;
}

const SUBSTANCES = new Set(["povidone", "iodine", "betadine", "chlorhexidine", "latex", "contrast"]);

/**
 * What the team named, checked against the case record: the allergies recorded at sign-in and the
 * ordered dose. ARNIE compares with the record; it never judges a dose on its own.
 * Returns the warning to speak, or null when nothing conflicts.
 */
function checkMed(state: State, drug: string, dose: Dose | null, now: number): string | null {
  const allergy = allergyConflict(drug, state.case.allergies);
  if (allergy) {
    alert(state, now, `${cap(drug)} held: ${allergy} allergy recorded at sign-in`, "critical");
    return `Caution: ${allergy} allergy recorded at sign-in. ${cap(drug)} ${SUBSTANCES.has(drug) ? "flagged" : "not logged"}.`;
  }
  const ordered = state.case.orders.filter((o) => o.drug === drug && o.dose);
  if (dose && ordered.length && !ordered.some((o) => sameDose(o.dose!, dose))) {
    const want = fmtDose(ordered[0].dose!);
    alert(state, now, `${cap(drug)} held: ${fmtDose(dose)} stated, ${want} ordered`, "critical");
    return `Caution: ${drug} is ordered at ${want} in the case record. ${cap(fmtDose(dose))} was stated. Not logged.`;
  }
  return null;
}

/** Room speech not addressed to ARNIE. Silent unless a medication that was named conflicts with the record. */
function overhear(state: State, heard: string, now: number): Turn {
  const med = findMedMention(heard);
  if (med) return med.negated ? null : checkMed(state, med.drug, med.dose, now);
  if (state.case.allergies.length && unknownDrugWord(heard)) return { screen: heard };
  return null;
}

/** A drug we don't list was named and the model thinks it may conflict with a recorded allergy.
 *  This only asks the team to verify; a model can raise a warning here, never clear one. */
export function applyScreen(state: State, drug: string, allergy: string, now: number): string {
  alert(state, now, `${cap(drug)} flagged: may conflict with ${allergy} allergy (verify)`, "warning");
  return `Please verify: ${cap(drug)} may conflict with the recorded ${allergy} allergy.`;
}

function imaging(state: State, intent: Intent, now: number): string {
  const img = (state.imaging ??= newImaging());
  return ctCommand(img, intent.imaging, now, intent.quantity, intent.detail);
}

/** Execute a parsed intent. All replies are templates; nothing here comes from a model. */
export function applyIntent(state: State, intent: Intent, now: number, opts: Opts): string {
  switch (intent.intent) {
    case "start_checklist":
      return intent.checklist === "none" ? SAY_AGAIN : startChecklist(state, intent.checklist, now);

    case "tourniquet_on":
    case "tourniquet_off": {
      const on = intent.intent === "tourniquet_on";
      const side = intent.side !== "none" && intent.limb !== "none" ? `${intent.side} ${intent.limb}`
        : state.tourniquet?.side ?? state.case.site;
      state.pending = { kind: on ? "tourniquet-on" : "tourniquet-off", side, at: now };
      return `Tourniquet ${on ? "on" : "off"}, ${side}, ${clock(now)}. Confirm?`;
    }

    case "give_drug": {
      const drug = matchDrug(intent.drug);
      if (!drug) return "Which drug? Say the name again.";
      const dose = parseDose(intent.dose) ?? parseDose(intent.drug);
      const warning = checkMed(state, drug, dose, now);
      if (warning) return warning;
      state.pending = { kind: "drug", drug, dose, at: now };
      return `${cap(drug)}${dose ? ` ${fmtDose(dose)}` : ""}, ${clock(now)}. Confirm?`;
    }

    case "open_items": {
      if (intent.item === "implant") {
        if (!intent.detail) return "Which implant?";
        state.pending = { kind: "implant", detail: intent.detail, at: now };
        return `Implant: ${intent.detail}, ${clock(now)}. Confirm?`;
      }
      if (intent.item === "none") return SAY_AGAIN;
      const qty = Number.isFinite(intent.quantity) && intent.quantity > 0 ? Math.floor(intent.quantity) : 0;
      if (!qty) return "How many?";
      if (intent.item === "suture") {
        const detail = intent.detail || "suture";
        state.pending = { kind: "items", item: "suture", quantity: qty, detail, at: now };
        return `${qty === 1 ? "" : `${qty} `}${detail} opened, ${plural(qty, "needle")}. Confirm?`;
      }
      state.pending = { kind: "items", item: intent.item, quantity: qty, detail: "", at: now };
      return `${plural(qty, intent.item)} opened. Confirm?`;
    }

    case "final_count": {
      if (intent.sponges < 0 && intent.needles < 0) return "Say the final count, for example: twelve sponges, two needles.";
      const sponges = intent.sponges < 0 ? state.counts.sponge : intent.sponges;
      const needles = intent.needles < 0 ? state.counts.needle : intent.needles;
      state.pending = { kind: "final-count", sponges, needles, at: now };
      return `Final count: ${countText(sponges, needles, state)}. Confirm?`;
    }

    case "milestone": {
      if (intent.milestone === "none") return SAY_AGAIN;
      if (state.milestones[intent.milestone] != null) {
        return `${intent.milestone === "incision" ? "The operation started" : "The operation ended"} at ${clock(state.milestones[intent.milestone]!)}.`;
      }
      state.pending = { kind: "milestone", milestone: intent.milestone, at: now };
      return `${intent.milestone === "incision" ? "Operation start, incision" : "Operation end, closure"}, ${clock(now)}. Confirm?`;
    }

    case "imaging":
      return imaging(state, intent, now);

    case "antibiotic_time": {
      const ab = state.case.antibioticGiven ?? lastDrug(state);
      if (!ab) return "No antibiotic is recorded for this case.";
      return `${cap(ab.drug)} at ${clock(ab.at)}, ${minutesSince(ab.at, now, opts.minuteMs)} minutes ago.`;
    }

    case "preop_value": {
      if (intent.value === "none") return SAY_AGAIN;
      const v = state.case.preop[intent.value];
      return v ? `Pre-op ${intent.value} ${v}, from the case record.` : `No pre-op ${intent.value} is recorded.`;
    }

    case "call_specialist": {
      if (!intent.specialty || intent.specialty === "none") return "Which specialist?";
      const who = findOnCall(state, intent.specialty);
      if (!who) return `No on-call ${intent.specialty.replace(/^dr\.?\s+/i, "")} is listed for this case.`;
      state.consult = { specialty: who.specialty, doctor: who.doctor, state: "ringing", start: now };
      addLog(state, now, `Consult requested: ${who.specialty}`, "consult");
      return `Calling ${who.doctor}, ${who.specialty}.`;
    }

    case "lookup":
      return lookup(state, intent, now, opts);

    case "tourniquet_time":
      if (!state.tourniquet) return "No tourniquet is recorded.";
      return `Tourniquet, ${state.tourniquet.side}, ${minutesSince(state.tourniquet.start, now, opts.minuteMs)} minutes.`;

    default:
      return SAY_AGAIN;
  }
}

const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const withDose = (o: Order) => `${o.drug}${o.dose ? ` ${fmtDose(o.dose)}` : ""}`;

/** "9 sponges, 2 needles", or just the sponges when no needles were opened or counted. */
const countText = (sponges: number, needles: number, state: State) =>
  needles || state.counts.needle ? `${plural(sponges, "sponge")}, ${plural(needles, "needle")}` : plural(sponges, "sponge");

/** "1 hour 5 minutes", "29 minutes", "less than a minute". */
export function duration(from: number, to: number): string {
  const mins = Math.max(0, Math.round((to - from) / 60000));
  if (mins < 1) return "less than a minute";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h ? plural(h, "hour") : "", m ? plural(m, "minute") : ""].filter(Boolean).join(" ");
}

/** The heads-up after scrubbing in: who, what, what to watch for, and where things stand. All from the record. */
function briefing(state: State, now: number, opts: Opts): string {
  const c = state.case;
  const labs = Object.entries(c.preop).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`);
  const given = state.log.filter((l) => l.kind === "drug").map((l) => l.text.replace(/ given$/, ""));
  const status = [
    state.milestones.closure != null ? `operation ended at ${clock(state.milestones.closure)}`
      : state.milestones.incision != null ? `operating ${duration(state.milestones.incision, now)}, since ${clock(state.milestones.incision)}`
        : "not started yet",
    state.tourniquet ? `tourniquet on ${state.tourniquet.side}, ${minutesSince(state.tourniquet.start, now, opts.minuteMs)} minutes` : "",
    given.length ? `given: ${list(given)}` : "",
  ].filter(Boolean);
  return [
    `${c.patient}, ${c.summary}, for ${c.procedure}, ${c.site}.`,
    c.allergies.length ? `Allergic to ${list(c.allergies)}.` : "No allergies recorded.",
    c.orders.length ? `Ordered: ${list(c.orders.map(withDose))}.` : "",
    labs.length ? `Pre-op ${list(labs)}.` : "",
    `Status: ${status.join("; ")}.`,
  ].filter(Boolean).join(" ");
}

/** Read back what the case record holds. Facts only: nothing here is advice or inferred. */
function lookup(state: State, intent: Intent, now: number, opts: Opts): string {
  const c = state.case;
  switch (intent.topic) {
    case "allergies":
      return c.allergies.length ? `Allergies on record: ${list(c.allergies)}.` : "No allergies recorded.";
    case "orders": {
      const drug = intent.drug ? matchDrug(intent.drug) : null;
      if (drug) {
        const o = c.orders.find((x) => x.drug === drug);
        if (!o) return `No order for ${drug} on record.`;
        return o.dose ? `${cap(drug)} is ordered at ${fmtDose(o.dose)}.` : `${cap(drug)} is ordered, with no dose on record.`;
      }
      return c.orders.length ? `Ordered: ${list(c.orders.map(withDose))}.` : "No medication orders on record.";
    }
    case "given": {
      const given = state.log.filter((l) => l.kind === "drug").map((l) => `${l.text.replace(/ given$/, "")} at ${l.time}`);
      return given.length ? `Given: ${list(given)}.` : "No medications logged yet.";
    }
    case "counts": {
      const { sponge, needle } = state.counts;
      if (!sponge && !needle) return "No sponges or needles recorded yet.";
      const field = `On the field: ${plural(sponge, "sponge")}, ${plural(needle, "needle")}.`;
      if (!state.finalCount) return field;
      const r = reconcile(state);
      return `${field} Final count ${r.ok ? "reconciled" : `not reconciled: ${r.missing.join(", ")}`}.`;
    }
    case "milestones": {
      const done = (Object.keys(MILESTONES) as Milestone[]).filter((k) => state.milestones[k] != null)
        .map((k) => `${MILESTONES[k]} at ${clock(state.milestones[k]!)}`);
      return done.length ? `${list(done)}.` : "No incision recorded yet.";
    }
    case "procedure":
      return `${cap(c.procedure)}, ${c.site}.`;
    case "briefing":
      return briefing(state, now, opts);
    case "time":
      return `It's ${clock(now)}.`;
    case "elapsed": {
      const start = state.milestones.incision;
      if (start == null) return "The operation hasn't started. Say: ARNIE, start the operation.";
      const end = state.milestones.closure;
      if (end != null) return `The operation ran ${duration(start, end)}, from ${clock(start)} to ${clock(end)}.`;
      return `${cap(duration(start, now))}, since ${clock(start)}.`;
    }
    case "patient":
      return `${c.patient}. ${cap(c.summary)}.`;
    default:
      return SAY_AGAIN;
  }
}

function lastDrug(state: State) {
  const d = [...state.log].reverse().find((l) => l.kind === "drug");
  return d?.drug ? { drug: d.drug, at: d.at } : null;
}

function resolvePending(state: State, text: string, now: number): string | null {
  const p = state.pending!;
  if (NO.test(text)) {
    state.pending = null;
    return "Cancelled. Say it again.";
  }
  if (!CONFIRM.test(text)) return null;
  state.pending = null;
  switch (p.kind) {
    case "tourniquet-on":
      state.tourniquet = { side: p.side, start: p.at, alerts: [] };
      addLog(state, p.at, `Tourniquet on, ${p.side}`);
      break;
    case "tourniquet-off":
      addLog(state, p.at, `Tourniquet off, ${p.side}`);
      state.tourniquet = null;
      break;
    case "drug":
      addLog(state, p.at, `${cap(p.drug)}${p.dose ? ` ${fmtDose(p.dose)}` : ""} given`, "drug", { drug: p.drug });
      break;
    case "items": {
      if (p.item === "suture") {
        state.counts.needle += p.quantity;
        addLog(state, p.at, `${p.quantity > 1 ? `${p.quantity} × ` : ""}${p.detail} opened · needles on field ${state.counts.needle}`, "count");
      } else {
        state.counts[p.item] += p.quantity;
        addLog(state, p.at, `${plural(p.quantity, p.item)} opened · on field ${state.counts[p.item]}`, "count");
      }
      break;
    }
    case "implant":
      state.implants.push({ time: clock(p.at), name: p.detail });
      addLog(state, p.at, `Implant: ${p.detail}`, "implant");
      break;
    case "final-count": {
      state.finalCount = { sponge: p.sponges, needle: p.needles };
      addLog(state, p.at, `Final count: ${countText(p.sponges, p.needles, state)}`, "count");
      const r = reconcile(state);
      if (!r.ok) {
        alert(state, now, `Count mismatch: ${r.missing.join(", ")}`, "critical");
        return `Logged. Count mismatch: ${r.missing.join(", ")}.`;
      }
      return "Logged. Counts reconciled.";
    }
    case "milestone": {
      state.milestones[p.milestone] = p.at;
      addLog(state, p.at, MILESTONES[p.milestone], "milestone");
      if (p.milestone === "incision") {
        if (state.phase === "idle") state.phase = "surgery";
        return `Logged. Operation started at ${clock(p.at)}.`;
      }
      const start = state.milestones.incision;
      const ran = start != null ? `, after ${duration(start, p.at)}, from ${clock(start)} to ${clock(p.at)}` : "";
      const r = reconcile(state);
      if (!r.ok) {
        const why = r.needsCount ? "no final count recorded" : r.missing.join(", ");
        alert(state, now, `Closed with counts not reconciled: ${why}`, "critical");
        return `Logged. Operation ended at ${clock(p.at)}${ran}. Caution: counts not reconciled, ${why}.`;
      }
      return `Logged. Operation ended at ${clock(p.at)}${ran}.`;
    }
  }
  return "Logged.";
}

/** Handle one heard sentence. See Turn. */
export function handle(state: State, text: string, now: number, opts: Opts): Turn {
  const heard = (text ?? "").trim();
  if (!heard) return null;
  let woke = WAKE.test(heard);
  // What's left after the name, without "hey"/"okay" and punctuation on either side of it.
  let body = heard.replace(WAKE, "").replace(/^[\s,.:;!?-]*(?:(?:hey|hi|ok|okay)\b[\s,.:;!?-]*)*/i, "");
  // Just said "Hey ARNIE" a moment ago and paused: this sentence is for ARNIE too.
  if (!woke && now < state.attentionUntil) { woke = true; body = heard; }
  if (woke) state.attentionUntil = 0;
  const soft = !woke && heard.match(SOFT_WAKE);
  if (soft) {
    const rest = heard.slice(soft[0].length);
    const cmd = rest ? ruleIntent(normalizeHeard(rest)) : null;
    if (cmd && cmd.intent !== "conversation") { woke = true; body = rest; }
  }

  // Paused: everything is ignored. Pausing and resuming are manual only (the Room's Pause button or
  // M key), so nothing said in the room, a narration included, can pause or resume ARNIE.
  if (state.paused) return null;
  // Only the name ("Hey ARNIE."): answer, and take the next sentence as addressed to ARNIE.
  if (woke && !/[a-z0-9]/i.test(body)) {
    state.attentionUntil = now + ATTENTION_MS;
    return "I'm here.";
  }

  // The team talking to each other, not to ARNIE: it stays out of it unless a medication that was
  // named conflicts with the case record (an allergy, or a dose that differs from the order).
  if (!woke) {
    const heardMed = overhear(state, heard, now);
    if (heardMed) return heardMed;
  }

  // A consult in progress: "ARNIE, end consult" ends it. While the specialist is on the line, only
  // speech addressed to ARNIE is handled, so the team's talk with them is never taken as an answer.
  // While it is still ringing, ARNIE works as usual.
  if (woke && END_CONSULT.test(body) && (!state.consult || state.consult.state === "ended")) return "No consult in progress.";
  if (state.consult && state.consult.state !== "ended") {
    if (woke && END_CONSULT.test(body)) return endConsult(state, now, "room");
    if (state.consult.state === "live" && !woke) return null;
  }

  if (state.pending) {
    const r = resolvePending(state, body, now);
    if (r) return r;
    if (!woke) return null;
  }

  if (state.checklist) {
    // A recognised wake-phrase command still works mid-checklist (e.g. an allergy catch);
    // anything else is treated as an answer to the current checklist question.
    const cmd = woke ? ruleIntent(normalizeHeard(body)) : null;
    if (cmd) return applyIntent(state, cmd, now, opts);
    return answerChecklist(state, body, now);
  }

  if (!woke) return null; // ordinary OR conversation: ignore
  if (!body) return "Listening.";
  const cmd = normalizeHeard(body); // speech-recognition sound-alikes ("city" -> CT, "got to the name" -> go to the knee)
  const intent = ruleIntent(cmd);
  if (intent?.intent === "conversation") return { chat: cmd };
  if (intent?.intent === "lookup" && intent.topic === "summary") return { summarize: true };
  return intent ? applyIntent(state, intent, now, opts) : { parse: cmd };
}

/** Everything an end-of-case summary may say, computed from the confirmed log. Nothing inferred. */
export function summaryFacts(state: State, now: number) {
  const c = state.case;
  const start = state.milestones.incision ?? null;
  const end = state.milestones.closure ?? null;
  const r = reconcile(state);
  const alerts = state.log.filter((l) => l.kind === "alert");
  return {
    patient: c.patient, procedure: c.procedure, site: c.site, room: c.room,
    start: start != null ? clock(start) : null,
    end: end != null ? clock(end) : null,
    duration: start != null ? duration(start, end ?? now) : null,
    ongoing: start != null && end == null,
    given: state.log.filter((l) => l.kind === "drug").map((l) => `${l.text.replace(/ given$/, "")} at ${l.time}`),
    caught: alerts.filter((l) => /held|flagged/.test(l.text)).map((l) => `${l.text} at ${l.time}`),
    otherAlerts: alerts.filter((l) => !/held|flagged/.test(l.text)).map((l) => `${l.text} at ${l.time}`),
    consults: state.log.filter((l) => l.kind === "consult").map((l) => `${l.text} at ${l.time}`),
    implants: state.implants.map((i) => i.name),
    counts: state.counts.sponge + state.counts.needle === 0 ? "no counts recorded"
      : r.ok ? "final count reconciled" : r.needsCount ? "no final count recorded" : `not reconciled: ${r.missing.join(", ")}`,
    countsOk: r.ok,
    checklists: Object.keys(state.completed),
  };
}

/** The summary without a model: same facts, plain sentences. */
export function summaryTemplate(f: ReturnType<typeof summaryFacts>): string {
  const when = f.start ? (f.end ? `from ${f.start} to ${f.end}, ${f.duration}` : `started ${f.start}, ${f.duration} so far`) : "not started";
  // Caught mistakes were stopped before anything was given; only an unreconciled count is still open.
  return [
    `${cap(f.procedure)} for ${f.patient}, ${when}.`,
    f.given.length ? `Given: ${list(f.given)}.` : "No medications logged.",
    f.caught.length ? `Caught: ${list(f.caught)}.` : "",
    f.consults.some((x) => /live/.test(x)) ? "A specialist was consulted." : "",
    `Counts: ${f.counts}.`,
    !f.countsOk ? "Resolve the count before sign-off." : f.end ? "No unresolved issues." : "",
  ].filter(Boolean).join(" ");
}

/** The case record as plain text, for the conversation model. Read-only facts; nothing inferred. */
export function chatContext(state: State, now: number, opts: Opts): string {
  const c = state.case;
  const lines = [
    `Room: ${c.room}. Patient: ${c.patient}. Summary: ${c.summary}. Procedure: ${c.procedure}. Site: ${c.site}.`,
    `Allergies: ${c.allergies.length ? c.allergies.join(", ") : "none recorded"}.`,
    `Ordered medications: ${c.orders.length ? c.orders.map(withDose).join(", ") : "none recorded"}.`,
    `Pre-op labs: ${Object.entries(c.preop).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(", ") || "none recorded"}.`,
    `On-call specialists: ${c.specialists.map((s) => `${s.specialty}: ${s.doctor}`).join("; ")}.`,
    `Phase: ${state.phase}. Checklists done: ${Object.keys(state.completed).join(", ") || "none"}.`,
    state.tourniquet ? `Tourniquet on ${state.tourniquet.side}, ${minutesSince(state.tourniquet.start, now, opts.minuteMs)} minutes.` : "No tourniquet on.",
    `Sponges on field: ${state.counts.sponge}, needles: ${state.counts.needle}.`,
    state.consult && state.consult.state !== "ended" ? `Consult with ${state.consult.doctor} (${state.consult.specialty}) is ${state.consult.state}.` : "",
    `Confirmed log (latest last): ${state.log.slice(-12).map((l) => `${l.time} ${l.text}`).join("; ") || "nothing yet"}.`,
  ];
  return lines.filter(Boolean).join("\n");
}

/** Specialist joined the channel: the briefing ARNIE speaks to them. Only a ringing call can be
 *  answered, so a late join can't reopen a consult the room already ended. */
export function consultJoined(state: State, now: number, opts: Opts): string | null {
  if (state.consult?.state !== "ringing") return null;
  state.consult.state = "live";
  addLog(state, now, `Consult live: ${state.consult.doctor}`, "consult");
  const c = state.case;
  const parts = [`${state.consult.doctor}, this is ${c.room}. ${cap(c.summary)}.`];
  if (state.tourniquet) parts.push(`Tourniquet ${minutesSince(state.tourniquet.start, now, opts.minuteMs)} minutes.`);
  if (c.allergies.length) parts.push(`${c.allergies.map(cap).join(" and ")} allergy.`);
  return parts.join(" ");
}

const END_CONSULT = /\bend\b.*\b(consult|call)\b|\bhang up\b|\bcancel\b.*\bcall\b/i;

/** End the consult, from the room ("ARNIE, end consult") or the specialist's phone (hang up or
 *  decline). Returns what ARNIE says, or null if there was nothing to end. */
export function endConsult(state: State, now: number, by: "room" | "specialist"): string | null {
  const c = state.consult;
  if (!c || c.state === "ended") return null;
  const declined = by === "specialist" && c.state === "ringing";
  c.state = "ended";
  addLog(state, now, `Consult ${declined ? "declined" : "ended"}: ${c.specialty}`, "consult");
  if (by === "room") return "Consult ended.";
  return declined ? `${c.doctor} declined the call.` : `${c.doctor} left the call.`;
}

/** Called every second: an alert to speak, or null. */
export function tick(state: State, now: number, opts: Opts): { text: string; urgent: boolean } | null {
  const tq = state.tourniquet;
  if (!tq) return null;
  const mins = minutesSince(tq.start, now, opts.minuteMs);
  const due = (opts.alertMinutes ?? [60, 90, 120]).find((m) => mins >= m && !tq.alerts.includes(m));
  if (due == null) return null;
  tq.alerts.push(due);
  alert(state, now, `Tourniquet alert: ${due} minutes`, due >= 120 ? "critical" : "warning");
  return { text: `Tourniquet time: ${due} minutes.`, urgent: due >= 120 };
}

/** The surgeon signs the drafted record (from the record screen, after leaving the sterile field). */
export function signRecord(state: State, now: number) {
  if (state.signedAt) return;
  state.signedAt = now;
  addLog(state, now, "Operative record signed by surgeon", "check");
}

/** Snapshot for the wall board and other clients. */
export function view(state: State, now: number, opts: Opts) {
  const cl = state.checklist;
  const checklists = Object.fromEntries(
    (Object.keys(CHECKLISTS) as ChecklistName[]).map((name) => {
      const list = CHECKLISTS[name];
      return [name, {
        title: list.title,
        complete: !!state.completed[name],
        blocked: cl?.name === name && cl.blocked,
        items: list.items.map((it, i) => ({
          label: it.label,
          status: state.completed[name] || (cl?.name === name && cl.done[it.id]) ? "ok"
            : cl?.name === name && i === cl.index ? (cl.blocked ? "blocked" : "active") : "pending",
        })),
      }];
    }),
  );
  const r = reconcile(state);
  return {
    phase: state.phase,
    paused: state.paused,
    case: { ...state.case, orders: state.case.orders.map((o) => `${cap(o.drug)}${o.dose ? ` ${fmtDose(o.dose)}` : ""}`) },
    checklists,
    pending: state.pending,
    log: state.log,
    tourniquet: state.tourniquet && {
      side: state.tourniquet.side,
      seconds: Math.floor(((now - state.tourniquet.start) / opts.minuteMs) * 60),
    },
    consult: state.consult,
    counts: {
      opened: state.counts,
      final: state.finalCount,
      status: state.counts.sponge + state.counts.needle === 0 ? "none" : r.ok ? "reconciled" : r.needsCount ? "open" : "mismatch",
      missing: r.missing,
    },
    implants: state.implants,
    milestones: Object.fromEntries(Object.entries(state.milestones).map(([k, v]) => [k, clock(v!)])),
    operation: state.milestones.incision != null ? {
      start: clock(state.milestones.incision),
      end: state.milestones.closure != null ? clock(state.milestones.closure) : null,
      duration: duration(state.milestones.incision, state.milestones.closure ?? now),
    } : null,
    summary: state.summary && { text: state.summary.text, time: clock(state.summary.at) },
    // While playing, the board keeps the scan moving on its own clock from this snapshot.
    imaging: state.imaging && {
      ...state.imaging,
      slice: currentSlice(state.imaging, now),
      playing: state.imaging.playing ? { everyMs: PLAY_MS } : null,
    },
    record: {
      title: "Operative record · draft",
      patient: state.case.patient,
      procedure: state.case.procedure,
      room: state.case.room,
      entries: state.log.map((l) => ({ time: l.time, text: l.text, kind: l.kind, severity: l.severity ?? null })),
      signedAt: state.signedAt ? clock(state.signedAt) : null,
      status: state.signedAt ? "Signed" : "Ready for surgeon sign-off",
    },
  };
}
export type View = ReturnType<typeof view>;
