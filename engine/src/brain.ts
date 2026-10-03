// Operon brain (voice agent "Vega"): the deterministic state machine behind the voice agent.
// Agora's agent sends every heard sentence here (via the custom LLM endpoint).
//
// Flow for a command:  heard text → ruleIntent() → (fallback: LLM → same Intent shape) → applyIntent()
// The LLM may only produce an Intent. Every spoken reply is a template in this file, and
// confirmations / checklist answers are never interpreted by a model.
import { matchDrug } from "./formulary.js";

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

// An order for any drug in a class conflicts with that recorded allergy.
export const ALLERGY_CLASSES: Record<string, string[]> = {
  penicillin: ["penicillin", "amoxicillin", "ampicillin", "piperacillin"],
  cephalosporin: ["cefazolin", "ceftriaxone", "cefuroxime"],
  sulfa: [],
};

export const SPECIALISTS = {
  vascular: "Dr. Valdez",
  anesthesia: "Dr. Ramos",
  orthopedics: "Dr. Lim",
  neurosurgery: "Dr. Cruz",
} as const;
export type Specialty = keyof typeof SPECIALISTS;

export const MILESTONES = { incision: "Incision", closure: "Closure" } as const;
export type Milestone = keyof typeof MILESTONES;
export type CountItem = "sponge" | "needle";
export const CT_SLICES = 40;

/** The only thing the LLM is allowed to produce. Flat, with "none"/""/-1 defaults, for strict JSON schemas. */
export type Intent = {
  intent:
    | "start_checklist" | "tourniquet_on" | "tourniquet_off" | "give_drug" | "antibiotic_time"
    | "preop_value" | "call_specialist" | "tourniquet_time"
    | "open_items" | "final_count" | "milestone" | "imaging" | "unknown";
  checklist: ChecklistName | "none";
  side: "left" | "right" | "none";
  limb: "thigh" | "arm" | "leg" | "forearm" | "calf" | "none";
  drug: string;
  value: "potassium" | "hemoglobin" | "none";
  specialty: Specialty | "none";
  /** open_items: what was opened, how many, and a description (e.g. "4-0 Prolene", "6 mm PTFE graft"). */
  item: "sponge" | "needle" | "suture" | "implant" | "none";
  quantity: number;
  detail: string;
  /** final_count: counted totals, -1 when not said. */
  sponges: number;
  needles: number;
  milestone: Milestone | "none";
  imaging: "show" | "hide" | "next" | "previous" | "zoom_in" | "zoom_out" | "rotate" | "none";
};

export const EMPTY_INTENT: Intent = {
  intent: "unknown", checklist: "none", side: "none", limb: "none", drug: "", value: "none", specialty: "none",
  item: "none", quantity: 0, detail: "", sponges: -1, needles: -1, milestone: "none", imaging: "none",
};

export type CaseSetup = {
  patient?: string; summary?: string; procedure?: string; site?: string; room?: string;
  allergies?: string[]; preop?: Record<string, string>; antibioticGiven?: { drug: string; at: number } | null;
};
export type Severity = "info" | "warning" | "critical";
export type LogEntry = {
  at: number; time: string; text: string;
  kind: "event" | "alert" | "check" | "consult" | "drug" | "count" | "implant" | "milestone" | "imaging";
  severity?: Severity; drug?: string;
};
type Pending =
  | { kind: "tourniquet-on" | "tourniquet-off"; side: string; at: number }
  | { kind: "drug"; drug: string; at: number }
  | { kind: "items"; item: CountItem | "suture"; quantity: number; detail: string; at: number }
  | { kind: "implant"; detail: string; at: number }
  | { kind: "final-count"; sponges: number; needles: number; at: number }
  | { kind: "milestone"; milestone: Milestone; at: number };

export type State = {
  case: Required<Omit<CaseSetup, "antibioticGiven">> & { antibioticGiven: { drug: string; at: number } | null };
  phase: "idle" | ChecklistName | "surgery" | "done";
  checklist: { name: ChecklistName; index: number; done: Record<string, boolean>; blocked: boolean; askedAt: number; settleMs: number } | null;
  completed: Partial<Record<ChecklistName, number>>;
  pending: Pending | null;
  log: LogEntry[];
  tourniquet: { side: string; start: number; alerts: number[] } | null;
  consult: { specialty: Specialty; doctor: string; state: "ringing" | "live" | "ended"; start: number } | null;
  counts: Record<CountItem, number>; // opened onto the field
  finalCount: Record<CountItem, number> | null;
  implants: { time: string; name: string }[];
  milestones: Partial<Record<Milestone, number>>;
  imaging: { visible: boolean; study: string; slice: number; zoom: number; rotation: number } | null;
  signedAt: number | null;
};

export type Opts = { minuteMs: number; alertMinutes?: number[] };
/** handle() result: words to speak, null for silence, or a request to parse a command with the LLM. */
export type Turn = string | null | { parse: string };

// Wake word: "Vega", Operon's voice agent. Chosen after a live Agora test: ARES transcribed
// "Vega" exactly every time (unlike "Vega" -> "Sir John", one sound from "surgeon", or
// "Sentry" -> "Century"). Whole word only, so "vegetable" or "vegan" never wake it.
const WAKE = /\bvegas?\b/i;
const YES = /\b(confirm(ed)?|yes|yep|correct|complete(d)?|done|affirmative|marked|given|none|no concerns?|labell?ed|off)\b/i;
const CONFIRM = /\b(confirm(ed)?|yes|correct|affirmative)\b/i;
const NO = /\b(cancel|no,? wait|wrong|correction|negative|scratch that)\b/i;
const SKIP = /\b(skip|let'?s (just )?start|move on|later|no time|we'?re late|go ahead without)\b/i;
export const SAY_AGAIN = "Sorry, say that again.";

const WORD_NUM: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
};
const num = (s: string | undefined): number => (s ? (/^\d+$/.test(s) ? Number(s) : WORD_NUM[s.toLowerCase()] ?? NaN) : NaN);
const NUM = String.raw`(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)`;

export const clock = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
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
  };
}

function addLog(state: State, now: number, text: string, kind: LogEntry["kind"] = "event", extra: Partial<LogEntry> = {}) {
  state.log.push({ at: now, time: clock(now), text, kind, ...extra });
}
const alert = (state: State, now: number, text: string, severity: Severity) => addLog(state, now, text, "alert", { severity });

/** Severity of something Vega says, for the board's colors (IEC 60601-1-8 style). */
export function severityOf(text: string): Severity {
  if (/^(Caution|Count mismatch|Count not reconciled)|Logged\. Count mismatch|Tourniquet time: 1[2-9]\d minutes/.test(text)) return "critical";
  if (/not complete|^Tourniquet time:/.test(text)) return "warning";
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

/** Fast, deterministic command parsing. Returns null when the rules cannot tell what was meant. */
export function ruleIntent(body: string): Intent | null {
  const t = body.toLowerCase();
  const I = (p: Partial<Intent>): Intent => ({ ...EMPTY_INTENT, ...p });
  let m: RegExpMatchArray | null;

  if (/\bsign[\s-]?in\b/.test(t)) return I({ intent: "start_checklist", checklist: "signin" });
  if (/\btime[\s-]?out\b/.test(t)) return I({ intent: "start_checklist", checklist: "timeout" });
  if (/\bsign[\s-]?out\b/.test(t)) return I({ intent: "start_checklist", checklist: "signout" });

  // Imaging (display only): needs an imaging word, so "open 3 sponges" is never read as imaging.
  if (/\b(hide|close|clear)\b.*\b(ct|scan|images?|imaging)\b/.test(t)) return I({ intent: "imaging", imaging: "hide" });
  if (/\b(show|display|pull up|bring up|open)\b.*\b(ct|scan|images?|imaging)\b/.test(t)) return I({ intent: "imaging", imaging: "show" });
  if (/\bnext (slice|image)\b|\bscroll down\b/.test(t)) return I({ intent: "imaging", imaging: "next" });
  if (/\b(previous|last|back one) (slice|image)\b|\bscroll up\b/.test(t)) return I({ intent: "imaging", imaging: "previous" });
  if (/\bzoom in\b|\benlarge\b/.test(t)) return I({ intent: "imaging", imaging: "zoom_in" });
  if (/\bzoom out\b/.test(t)) return I({ intent: "imaging", imaging: "zoom_out" });
  if (/\brotate\b/.test(t)) return I({ intent: "imaging", imaging: "rotate" });

  if (/tourniquet/.test(t) && /(how long|time)\b/.test(t) && !/\b(on|off)\b/.test(t)) return I({ intent: "tourniquet_time" });
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

  // Milestones
  if (/\b(skin\s+)?incision\b/.test(t)) return I({ intent: "milestone", milestone: "incision" });
  if (/\bclos(ure|ing)\b/.test(t)) return I({ intent: "milestone", milestone: "closure" });

  m = t.match(/\b(?:give|administer|push)\s+(.+)$/);
  if (m) return I({ intent: "give_drug", drug: m[1].replace(/[.,!?]+$/, "").trim() });

  if (/antibiotic/.test(t) && /(when|time|given)/.test(t)) return I({ intent: "antibiotic_time" });
  m = t.match(/\b(potassium|hemoglobin|haemoglobin)\b/);
  if (m) return I({ intent: "preop_value", value: m[1].replace("haemo", "hemo") as Intent["value"] });

  m = t.match(/\bcall\s+(?:dr\.?\s+)?([a-z]+)/);
  if (m && m[1] in SPECIALISTS) return I({ intent: "call_specialist", specialty: m[1] as Specialty });

  return null;
}

function drugConflict(state: State, drug: string): string | null {
  for (const allergy of state.case.allergies) {
    const cls = ALLERGY_CLASSES[allergy] ?? [allergy];
    if (cls.includes(drug) || drug === allergy) return allergy;
  }
  return null;
}

function imaging(state: State, action: Intent["imaging"]): string {
  const img = (state.imaging ??= { visible: false, study: "Pre-op CT · lower limb angiogram", slice: 18, zoom: 1, rotation: 0 });
  switch (action) {
    case "show": img.visible = true; return "Showing the pre-op CT.";
    case "hide": img.visible = false; return "Images closed.";
    case "next": img.visible = true; img.slice = Math.min(CT_SLICES, img.slice + 1); return `Slice ${img.slice}.`;
    case "previous": img.visible = true; img.slice = Math.max(1, img.slice - 1); return `Slice ${img.slice}.`;
    case "zoom_in": img.visible = true; img.zoom = Math.min(3, img.zoom + 0.5); return `Zoom ${img.zoom} times.`;
    case "zoom_out": img.visible = true; img.zoom = Math.max(1, img.zoom - 0.5); return `Zoom ${img.zoom} times.`;
    case "rotate": img.visible = true; img.rotation = (img.rotation + 90) % 360; return `Rotated to ${img.rotation} degrees.`;
    default: return SAY_AGAIN;
  }
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
      const allergy = drugConflict(state, drug);
      if (allergy) {
        alert(state, now, `${cap(drug)} held: ${allergy} allergy recorded at sign-in`, "critical");
        return `Caution: ${allergy} allergy recorded at sign-in. ${cap(drug)} not logged.`;
      }
      state.pending = { kind: "drug", drug, at: now };
      return `${cap(drug)}, ${clock(now)}. Confirm?`;
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
      return `Final count: ${plural(sponges, "sponge")}, ${plural(needles, "needle")}. Confirm?`;
    }

    case "milestone": {
      if (intent.milestone === "none") return SAY_AGAIN;
      state.pending = { kind: "milestone", milestone: intent.milestone, at: now };
      return `${MILESTONES[intent.milestone]}, ${clock(now)}. Confirm?`;
    }

    case "imaging":
      return imaging(state, intent.imaging);

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
      if (intent.specialty === "none") return "Which specialist?";
      const doctor = SPECIALISTS[intent.specialty];
      state.consult = { specialty: intent.specialty, doctor, state: "ringing", start: now };
      addLog(state, now, `Consult requested: ${intent.specialty}`, "consult");
      return `Calling ${doctor}, ${intent.specialty}.`;
    }

    case "tourniquet_time":
      if (!state.tourniquet) return "No tourniquet is recorded.";
      return `Tourniquet, ${state.tourniquet.side}, ${minutesSince(state.tourniquet.start, now, opts.minuteMs)} minutes.`;

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
      addLog(state, p.at, `${cap(p.drug)} given`, "drug", { drug: p.drug });
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
      addLog(state, p.at, `Final count: ${plural(p.sponges, "sponge")}, ${plural(p.needles, "needle")}`, "count");
      const r = reconcile(state);
      if (!r.ok) {
        alert(state, now, `Count mismatch: ${r.missing.join(", ")}`, "critical");
        return `Logged. Count mismatch: ${r.missing.join(", ")}.`;
      }
      return "Logged. Counts reconciled.";
    }
    case "milestone":
      state.milestones[p.milestone] = p.at;
      addLog(state, p.at, MILESTONES[p.milestone], "milestone");
      break;
  }
  return "Logged.";
}

/** Handle one heard sentence. See Turn. */
export function handle(state: State, text: string, now: number, opts: Opts): Turn {
  const heard = (text ?? "").trim();
  if (!heard) return null;
  const woke = WAKE.test(heard);
  const body = heard.replace(WAKE, "").replace(/^[\s,.:;-]+/, "").replace(/^(hey|ok|okay)[\s,]+/i, "");

  // During a live consult, stay silent unless asked to end it.
  if (state.consult && state.consult.state !== "ended") {
    if (woke && /\bend\b.*\bconsult\b|\bhang up\b/i.test(body)) {
      state.consult.state = "ended";
      addLog(state, now, `Consult ended: ${state.consult.specialty}`, "consult");
      return "Consult ended.";
    }
    return null;
  }

  if (state.pending) {
    const r = resolvePending(state, body, now);
    if (r) return r;
    if (!woke) return null;
  }

  if (state.checklist) {
    // A recognised wake-phrase command still works mid-checklist (e.g. an allergy catch);
    // anything else is treated as an answer to the current checklist question.
    const cmd = woke ? ruleIntent(body) : null;
    if (cmd) return applyIntent(state, cmd, now, opts);
    return answerChecklist(state, body, now);
  }

  if (!woke) return null; // ordinary OR conversation: ignore
  if (!body) return "Listening.";
  const intent = ruleIntent(body);
  return intent ? applyIntent(state, intent, now, opts) : { parse: body };
}

/** Specialist joined the channel: the briefing Vega speaks to them. */
export function consultJoined(state: State, now: number, opts: Opts): string | null {
  if (!state.consult) return null;
  state.consult.state = "live";
  addLog(state, now, `Consult live: ${state.consult.doctor}`, "consult");
  const c = state.case;
  const parts = [`${state.consult.doctor}, this is ${c.room}. ${cap(c.summary)}.`];
  if (state.tourniquet) parts.push(`Tourniquet ${minutesSince(state.tourniquet.start, now, opts.minuteMs)} minutes.`);
  if (c.allergies.length) parts.push(`${c.allergies.map(cap).join(" and ")} allergy.`);
  return parts.join(" ");
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
    case: state.case,
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
    imaging: state.imaging,
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
