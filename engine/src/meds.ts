// Medication statements in room speech: doses, the case's ordered medications, and spotting
// "giving ampicillin" said to the team (not to Vega). Pure functions, no model involved.
import { matchDrug } from "./formulary.js";

/** A dose in a base unit: milligrams for anything by weight, otherwise units, millilitres or mEq. */
export type Dose = { amount: number; unit: "mg" | "units" | "ml" | "meq" };
export type Order = { drug: string; dose: Dose | null };

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

const UNITS: Record<string, { unit: Dose["unit"]; factor: number }> = {
  mg: { unit: "mg", factor: 1 }, mgs: { unit: "mg", factor: 1 }, milligram: { unit: "mg", factor: 1 }, milligrams: { unit: "mg", factor: 1 },
  g: { unit: "mg", factor: 1000 }, gm: { unit: "mg", factor: 1000 }, gms: { unit: "mg", factor: 1000 }, gram: { unit: "mg", factor: 1000 }, grams: { unit: "mg", factor: 1000 },
  mcg: { unit: "mg", factor: 0.001 }, ug: { unit: "mg", factor: 0.001 }, microgram: { unit: "mg", factor: 0.001 }, micrograms: { unit: "mg", factor: 0.001 },
  unit: { unit: "units", factor: 1 }, units: { unit: "units", factor: 1 }, iu: { unit: "units", factor: 1 },
  ml: { unit: "ml", factor: 1 }, mls: { unit: "ml", factor: 1 }, cc: { unit: "ml", factor: 1 }, ccs: { unit: "ml", factor: 1 },
  milliliter: { unit: "ml", factor: 1 }, milliliters: { unit: "ml", factor: 1 }, millilitre: { unit: "ml", factor: 1 }, millilitres: { unit: "ml", factor: 1 },
  meq: { unit: "meq", factor: 1 }, milliequivalents: { unit: "meq", factor: 1 },
};

const has = (o: object, k: string | undefined): k is string => k !== undefined && Object.hasOwn(o, k);

const tokens = (text: string): string[] =>
  text.toLowerCase().replace(/(\d),(\d{3})/g, "$1$2").replace(/(\d)([a-z])/g, "$1 $2").replace(/[^a-z0-9.\s]/g, " ").replace(/\s+/g, " ").trim()
    .split(" ").map((w) => w.replace(/^\.+|\.+$/g, "")).filter(Boolean);

/** Read a number at tokens[i]: digits ("2", "0.5", "5000") or words ("two", "five hundred", "one and a half", "half"). */
function numberAt(t: string[], i: number): { value: number; next: number } | null {
  const w = t[i];
  if (w === undefined) return null;
  let value: number;
  let next = i + 1;
  if (/^\d+(\.\d+)?$/.test(w)) {
    value = Number(w);
  } else if (w === "half") {
    return { value: 0.5, next };
  } else if (has(ONES, w) || has(TENS, w) || w === "hundred" || w === "thousand" || ((w === "a" || w === "an") && (t[i + 1] === "hundred" || t[i + 1] === "thousand"))) {
    let total = 0;
    let cur = 0;
    let j = i;
    for (; j < t.length; j++) {
      const x = t[j];
      if (has(ONES, x)) cur += ONES[x];
      else if (has(TENS, x)) cur += TENS[x];
      else if (x === "a" || x === "an") cur += 1;
      else if (x === "hundred") cur = (cur || 1) * 100;
      else if (x === "thousand") { total += (cur || 1) * 1000; cur = 0; }
      else if (x === "and" && (has(ONES, t[j + 1]) || has(TENS, t[j + 1]))) continue;
      else break;
    }
    value = total + cur;
    next = j;
  } else {
    return null;
  }
  if (t[next] === "point") { // "one point five"
    let frac = "";
    let j = next + 1;
    while (j < t.length && has(ONES, t[j]) && ONES[t[j]] < 10) frac += ONES[t[j++]];
    if (frac) { value += Number(`0.${frac}`); next = j; }
  } else if (t[next] === "and" && (t[next + 1] === "a" || t[next + 1] === "an") && t[next + 2] === "half") { // "one and a half"
    value += 0.5;
    next += 3;
  }
  return { value, next };
}

/** The first dose in a phrase: "2 grams", "five hundred milligrams", "5,000 units", "half a gram". */
export function parseDose(text: string): Dose | null {
  const t = tokens(text);
  for (let i = 0; i < t.length; i++) {
    const n = (t[i] === "a" || t[i] === "an") && has(UNITS, t[i + 1]) ? { value: 1, next: i + 1 } : numberAt(t, i); // "a gram"
    if (!n) continue;
    let k = n.next;
    if ((t[i] === "half" || t[k - 1] === "half") && (t[k] === "a" || t[k] === "an")) k += 1; // "half a gram"
    const u = has(UNITS, t[k]) ? UNITS[t[k]] : null;
    if (u) return { amount: Math.round(n.value * u.factor * 1e6) / 1e6, unit: u.unit };
  }
  return null;
}

const trim = (n: number) => String(Math.round(n * 100) / 100);
const noun = (n: number, singular: string, plural: string) => `${trim(n)} ${n === 1 ? singular : plural}`;

/** A dose as Vega says it: "2 grams", "500 milligrams", "50 micrograms", "5000 units". */
export function fmtDose(d: Dose): string {
  switch (d.unit) {
    case "mg":
      if (d.amount >= 1000) return noun(d.amount / 1000, "gram", "grams");
      if (d.amount < 1) return noun(d.amount * 1000, "microgram", "micrograms");
      return noun(d.amount, "milligram", "milligrams");
    case "units": return noun(d.amount, "unit", "units");
    case "ml": return noun(d.amount, "milliliter", "milliliters");
    case "meq": return noun(d.amount, "milliequivalent", "milliequivalents");
  }
}

export const sameDose = (a: Dose, b: Dose) => a.unit === b.unit && Math.abs(a.amount - b.amount) <= Math.max(a.amount, b.amount) * 1e-6;

/** "cefazolin 2 g; heparin 5000 units" -> the case's ordered medications. Unrecognised drugs are skipped. */
export function parseOrders(text: string | undefined): Order[] {
  if (!text) return [];
  const out: Order[] = [];
  for (const part of text.replace(/(\d),(\d{3})/g, "$1$2").split(/[;\n,]+/)) {
    const drug = matchDrug(part);
    if (drug) out.push({ drug, dose: parseDose(part) });
  }
  return out;
}

// ----- Spotting a medication in room speech -----

const VERB = new RegExp(
  String.raw`\b(?:giv(?:e|ing)|gave|push(?:ing)?|inject(?:ing)?|administer(?:ing)?|start(?:ing)?|hang(?:ing)?|infus(?:e|ing)|bolus(?:ing)?|us(?:e|ing)|` +
    String.raw`appl(?:y|ying)|prep(?:ping)?(?:\s+with)?|paint(?:ing)?(?:\s+with)?|(?:scrub|swab)(?:bing)?\s+with|going\s+in\s+with|draw(?:ing)?\s+up|put(?:ting)?\s+in|add(?:ing)?)\b`,
  "i",
);
/** The team is talking this one down ("no ampicillin, she's allergic"): not an order. */
const NEGATED = /\b(don'?t|do not|not|no|never|avoid|stop|without|hold off|cancel|instead of)\b/i;
const FILLER = new Set([
  "the", "a", "an", "some", "more", "another", "that", "this", "it", "him", "her", "me", "you", "us", "them", "now", "just", "please", "also", "then",
  "of", "to", "with", "in", "on", "about", "extra", "additional", "one", "two", "three", "four", "five", "ten", "half", "point", "and",
  "mg", "g", "gram", "grams", "milligram", "milligrams", "mcg", "units", "ml", "cc", "patient", "dose", "bolus", "iv", "slowly", "now",
]);
const NOT_DRUG = new Set([
  "scalpel", "forceps", "retractor", "suction", "cautery", "irrigation", "instrument", "instruments", "sponge", "sponges", "needle", "needles", "suture",
  "sutures", "clamp", "scissors", "towel", "drapes", "light", "minute", "moment", "second", "seconds", "advice", "everything", "something", "anything",
  "gloves", "table", "position", "anesthesia", "oxygen", "water", "saline", "the", "tourniquet", "microscope", "camera", "monitor", "hands",
]);

export type MedMention = { drug: string; dose: Dose | null; negated: boolean };

/** A drug named after an "administering" verb, with any dose in the sentence. Null if none is clearly named. */
export function findMedMention(text: string): MedMention | null {
  const m = VERB.exec(text);
  if (!m) return null;
  const after = tokens(text.slice(m.index + m[0].length)).slice(0, 8);
  for (let k = 0; k < after.length; k++) {
    const drug = matchDrug(after.slice(k, k + 2).join(" "), 7) ?? matchDrug(after[k], 7);
    if (drug) {
      const lead = text.slice(Math.max(0, m.index - 10), m.index + m[0].length); // "don't give", "do not give"
      return { drug, dose: parseDose(text), negated: NEGATED.test(lead) || NEGATED.test(after.slice(0, k).join(" ")) };
    }
  }
  return null;
}

/** A word that might be an unlisted drug right after an "administering" verb ("giving cefepime"), else null. */
export function unknownDrugWord(text: string): string | null {
  const m = VERB.exec(text);
  if (!m || NEGATED.test(text)) return null;
  const after = tokens(text.slice(m.index + m[0].length)).slice(0, 6);
  const word = after.find((w) => !FILLER.has(w) && !/^\d/.test(w));
  return word && /^[a-z]{6,}$/.test(word) && !NOT_DRUG.has(word) ? word : null;
}
