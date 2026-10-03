import { describe, test, expect } from "vitest";
import { createState, handle, tick, consultJoined, view, applyIntent, EMPTY_INTENT, SAY_AGAIN, type State, type Intent } from "./brain.js";
import { matchDrug } from "./formulary.js";

const T0 = new Date("2026-10-04T14:20:00").getTime();
const MIN = 60000;
const opts = { minuteMs: MIN };
const GAP = 5000; // answers come a few seconds after each question has been spoken

function runTimeout(s: State) {
  expect(handle(s, "Vega, start time out", T0, opts)).toMatch(/^Time out\. Team, confirm patient/);
  expect(handle(s, "Juan Cruz, exploration of the left femoral. Confirmed.", T0 + GAP, opts)).toBe("Surgeon, is the site marked?");
  return T0 + GAP;
}
const intent = (p: Partial<Intent>): Intent => ({ ...EMPTY_INTENT, ...p });

describe("wake word: Vega", () => {
  test.each(["Vega", "vega", "VEGA", "Vega.", "Vegas", "Hey Vega", "Okay Vega"])("'%s' wakes the agent", (w) => {
    const s = createState();
    expect(handle(s, `${w}, read back the potassium`, T0, opts)).toBe("Pre-op potassium 3.9, from the case record.");
  });

  test("similar words and the old name never wake the agent", () => {
    const s = createState();
    for (const heard of [
      "Surgeon, read back the potassium",
      "Sir John, read back the potassium",
      "Pass the vegetable broth, read back the potassium",
      "She's vegan, give ampicillin",
      "The surgeon wants the tourniquet on, left thigh",
    ]) expect(handle(s, heard, T0, opts)).toBeNull();
    expect(s.pending).toBeNull();
    expect(s.log).toHaveLength(0);
  });
});

describe("checklists", () => {
  test("ordinary OR talk without the wake phrase is ignored", () => {
    const s = createState();
    expect(handle(s, "Can I get more suction here?", T0, opts)).toBeNull();
    expect(handle(s, "Tourniquet on, left thigh", T0, opts)).toBeNull();
    expect(s.log).toHaveLength(0);
  });

  test("time-out blocks a skipped item, then completes", () => {
    const s = createState();
    let t = runTimeout(s);
    expect(handle(s, "Skip it, let's start.", (t += GAP), opts)).toMatch(/^Time out not complete: site marking not confirmed\./);
    expect(view(s, t, opts).checklists.timeout.blocked).toBe(true);
    expect(view(s, t, opts).checklists.timeout.items[1].status).toBe("blocked");
    expect(handle(s, "Site marked, left thigh. Confirmed.", (t += 8000), opts)).toMatch(/^Anesthesia, was antibiotic/);
    expect(handle(s, "Given.", (t += 6000), opts)).toMatch(/^Surgeon, any anticipated/);
    expect(handle(s, "None expected, confirmed.", (t += GAP), opts)).toBe("Time out complete.");
    expect(s.phase).toBe("surgery");
    expect(view(s, t, opts).checklists.timeout.complete).toBe(true);
    expect(s.log.some((l) => l.kind === "alert" && /blocked/.test(l.text))).toBe(true);
  });

  test("non-answers during a checklist stay silent and do not advance", () => {
    const s = createState();
    const t = runTimeout(s);
    expect(handle(s, "Pass me the retractor.", t + GAP, opts)).toBeNull();
    expect(s.checklist!.index).toBe(1);
  });

  test("a split 'Confirmed.' cannot confirm the next question (found in live Agora test)", () => {
    const s = createState();
    const t = runTimeout(s) + GAP;
    expect(handle(s, "Site marked, left thigh.", t, opts)).toMatch(/^Anesthesia, was antibiotic/);
    expect(handle(s, "Confirmed.", t + 700, opts)).toBeNull(); // question still being spoken
    expect(s.checklist!.done.antibiotic).toBeFalsy();
    expect(handle(s, "Given.", t + 6000, opts)).toMatch(/^Surgeon, any anticipated/);
  });
});

describe("commands during a checklist", () => {
  test("a wake-phrase command still works mid-checklist (allergy catch)", () => {
    const s = createState({ allergies: ["penicillin"] });
    const t = runTimeout(s);
    expect(handle(s, "Vega, give ampicillin.", t + GAP, opts)).toMatch(/^Caution: penicillin allergy/);
    expect(s.checklist!.index).toBe(1); // the time-out question is still open
    expect(handle(s, "Site marked, confirmed.", t + 2 * GAP, opts)).toMatch(/^Anesthesia, was antibiotic/);
  });

  test("restarting a checklist by voice still works mid-checklist", () => {
    const s = createState();
    const t = runTimeout(s);
    expect(handle(s, "Vega, start time out", t + GAP, opts)).toMatch(/^Time out\. Team, confirm/);
    expect(s.checklist!.index).toBe(0);
  });

  test("'Vega, confirmed' still answers the checklist", () => {
    const s = createState();
    const t = runTimeout(s);
    expect(handle(s, "Vega, site marked, confirmed", t + GAP, opts)).toMatch(/^Anesthesia, was antibiotic/);
  });
});

describe("read-back and logging", () => {
  test("tourniquet is logged only after read-back confirmation", () => {
    const s = createState();
    const at = T0 + 2 * MIN;
    expect(handle(s, "Vega, tourniquet on, left thigh.", at, opts)).toBe("Tourniquet on, left thigh, 14:22. Confirm?");
    expect(s.log).toHaveLength(0);
    expect(handle(s, "Confirmed.", at + 1000, opts)).toBe("Logged.");
    expect(s.tourniquet!.side).toBe("left thigh");
    expect(s.log.at(-1)!.text).toBe("Tourniquet on, left thigh");
  });

  test("a correction cancels the pending event", () => {
    const s = createState();
    expect(handle(s, "Vega tourniquet on right arm", T0, opts)).toMatch(/right arm/);
    expect(handle(s, "No, wait, wrong side", T0, opts)).toBe("Cancelled. Say it again.");
    expect(s.tourniquet).toBeNull();
  });

  test("the record contains only logged events", () => {
    const s = createState();
    handle(s, "Vega, tourniquet on, left thigh", T0, opts);
    expect(view(s, T0, opts).record.entries).toHaveLength(0);
    handle(s, "Confirmed", T0, opts);
    expect(view(s, T0, opts).record.entries).toHaveLength(1);
  });
});

describe("drugs and allergies", () => {
  test("allergy guard holds a conflicting drug and logs an alert", () => {
    const s = createState({ allergies: ["Penicillin"] });
    expect(handle(s, "Vega, give ampicillin.", T0, opts)).toBe("Caution: penicillin allergy recorded at sign-in. Ampicillin not logged.");
    expect(s.pending).toBeNull();
    expect(s.log.at(-1)!.kind).toBe("alert");
  });

  test("a misheard drug name resolves through the formulary, allergy still caught", () => {
    const s = createState({ allergies: ["penicillin"] });
    expect(handle(s, "Vega, give ampicilin", T0, opts)).toMatch(/^Caution: penicillin allergy/);
  });

  test("an unclear drug is never guessed (live test heard 'give a')", () => {
    const s = createState();
    expect(handle(s, "Vega, give a.", T0, opts)).toBe("Which drug? Say the name again.");
    expect(s.pending).toBeNull();
    expect(s.log).toHaveLength(0);
  });

  test("a safe drug is read back and logged on confirm, then can be looked up", () => {
    const s = createState({ allergies: ["penicillin"] });
    expect(handle(s, "Vega, give cefazolin", T0, opts)).toBe("Cefazolin, 14:20. Confirm?");
    expect(handle(s, "Yes, confirmed", T0, opts)).toBe("Logged.");
    expect(handle(s, "Vega, when was the antibiotic given?", T0 + 38 * MIN, opts)).toBe("Cefazolin at 14:20, 38 minutes ago.");
  });

  test("matchDrug is strict about short or ambiguous words", () => {
    expect(matchDrug("ampicillin")).toBe("ampicillin");
    expect(matchDrug("ampicilin")).toBe("ampicillin");
    expect(matchDrug("tranexamic acid please")).toBe("tranexamic acid");
    expect(matchDrug("a")).toBeNull();
    expect(matchDrug("amp")).toBeNull();
    expect(matchDrug("water")).toBeNull();
  });
});

describe("lookups, timers and consults", () => {
  test("pre-op values are read back from the case record only", () => {
    const s = createState({ preop: { potassium: "3.9" } });
    expect(handle(s, "Vega, read back the potassium", T0, opts)).toBe("Pre-op potassium 3.9, from the case record.");
    expect(handle(s, "Vega, read back the hemoglobin", T0, opts)).toBe("No pre-op hemoglobin is recorded.");
  });

  test("tourniquet alerts fire once at 60 minutes", () => {
    const s = createState();
    handle(s, "Vega, tourniquet on, left thigh", T0, opts);
    handle(s, "Confirmed", T0, opts);
    const o = { ...opts, alertMinutes: [60] };
    expect(tick(s, T0 + 59 * MIN, o)).toBeNull();
    expect(tick(s, T0 + 60 * MIN, o)).toEqual({ text: "Tourniquet time: 60 minutes.", urgent: false });
    expect(tick(s, T0 + 61 * MIN, o)).toBeNull();
  });

  test("call vascular: rings, briefs from the log, stays silent until ended", () => {
    const s = createState({ summary: "58-year-old male, left femoral bleed", allergies: ["penicillin"] });
    handle(s, "Vega, tourniquet on, left thigh", T0, opts);
    handle(s, "Confirmed", T0, opts);
    expect(handle(s, "Vega, call vascular.", T0 + 22 * MIN, opts)).toBe("Calling Dr. Valdez, vascular.");
    expect(s.consult!.state).toBe("ringing");
    expect(consultJoined(s, T0 + 22 * MIN, opts)).toBe("Dr. Valdez, this is OR 3. 58-year-old male, left femoral bleed. Tourniquet 22 minutes. Penicillin allergy.");
    expect(handle(s, "What do you see on the angiogram?", T0 + 23 * MIN, opts)).toBeNull();
    expect(handle(s, "Vega, give ampicillin", T0 + 23 * MIN, opts)).toBeNull();
    expect(handle(s, "Vega, end consult", T0 + 25 * MIN, opts)).toBe("Consult ended.");
  });
});

describe("counts and implants", () => {
  test("sponges and sutures are logged only after read-back confirmation", () => {
    const s = createState();
    expect(handle(s, "Vega, opening 10 sponges", T0, opts)).toBe("10 sponges opened. Confirm?");
    expect(s.counts.sponge).toBe(0);
    expect(handle(s, "Confirmed", T0, opts)).toBe("Logged.");
    expect(s.counts.sponge).toBe(10);
    expect(handle(s, "Vega, opening a 4-0 Prolene", T0, opts)).toBe("4-0 Prolene opened, 1 needle. Confirm?");
    handle(s, "Confirmed", T0, opts);
    expect(s.counts.needle).toBe(1);
    expect(s.log.at(-1)!.text).toBe("4-0 Prolene opened · needles on field 1");
  });

  test("word numbers and lap pads count as sponges", () => {
    const s = createState();
    expect(handle(s, "Vega, add three lap pads", T0, opts)).toBe("3 sponges opened. Confirm?");
  });

  test("implants are read back and recorded for the chart", () => {
    const s = createState();
    expect(handle(s, "Vega, implant a 6 millimeter PTFE graft", T0, opts)).toBe("Implant: 6 millimeter PTFE graft, 14:20. Confirm?");
    handle(s, "Confirmed", T0, opts);
    expect(s.implants).toEqual([{ time: "14:20", name: "6 millimeter PTFE graft" }]);
  });

  test("a final count that doesn't match is a critical alert", () => {
    const s = createState();
    handle(s, "Vega, opening 10 sponges", T0, opts); handle(s, "Confirmed", T0, opts);
    handle(s, "Vega, opening two 3-0 vicryl", T0, opts); handle(s, "Confirmed", T0, opts);
    expect(handle(s, "Vega, final count 9 sponges, 2 needles", T0, opts)).toBe("Final count: 9 sponges, 2 needles. Confirm?");
    expect(handle(s, "Confirmed", T0, opts)).toBe("Logged. Count mismatch: 1 sponge unaccounted.");
    expect(s.log.at(-1)).toMatchObject({ kind: "alert", severity: "critical" });
    expect(view(s, T0, opts).counts.status).toBe("mismatch");
  });

  test("sign-out cannot confirm counts that don't reconcile, and passes once they do", () => {
    const s = createState();
    handle(s, "Vega, opening 10 sponges", T0, opts); handle(s, "Confirmed", T0, opts);
    expect(handle(s, "Vega, sign out", T0 + GAP, opts)).toMatch(/^Sign out\. Nurse, are instrument and sponge counts correct\?/);
    expect(handle(s, "Correct.", T0 + 2 * GAP, opts)).toMatch(/^Count not reconciled: say the final count first\./);
    expect(view(s, T0, opts).checklists.signout.blocked).toBe(true);
    // The final count is a wake-phrase command, so it works mid-checklist.
    expect(handle(s, "Vega, final count 10 sponges", T0 + 3 * GAP, opts)).toMatch(/^Final count: 10 sponges/);
    expect(handle(s, "Confirmed", T0 + 3 * GAP + 1000, opts)).toBe("Logged. Counts reconciled.");
    expect(handle(s, "Counts correct.", T0 + 5 * GAP, opts)).toBe("Is the specimen labelled?");
  });
});

describe("milestones and imaging", () => {
  test("incision and closure are read back and recorded", () => {
    const s = createState();
    expect(handle(s, "Vega, skin incision", T0 + 5 * MIN, opts)).toBe("Incision, 14:25. Confirm?");
    handle(s, "Confirmed", T0 + 5 * MIN, opts);
    expect(view(s, T0, opts).milestones).toEqual({ incision: "14:25" });
    expect(s.log.at(-1)).toMatchObject({ kind: "milestone", text: "Incision" });
  });

  test("imaging commands drive the viewer without confirmation (display only)", () => {
    const s = createState();
    expect(handle(s, "Vega, show the pre-op CT", T0, opts)).toBe("Showing the pre-op CT.");
    expect(s.imaging).toMatchObject({ visible: true, slice: 18 });
    expect(handle(s, "Vega, next slice", T0, opts)).toBe("Slice 19.");
    expect(handle(s, "Vega, zoom in", T0, opts)).toBe("Zoom 1.5 times.");
    expect(handle(s, "Vega, rotate", T0, opts)).toBe("Rotated to 90 degrees.");
    expect(handle(s, "Vega, close the images", T0, opts)).toBe("Images closed.");
    expect(s.pending).toBeNull();
  });

  test("'open' with a count is never mistaken for imaging", () => {
    const s = createState();
    expect(handle(s, "Vega, opening 5 sponges", T0, opts)).toBe("5 sponges opened. Confirm?");
    expect(s.imaging).toBeNull();
  });
});

describe("LLM fallback boundary", () => {
  test("commands the rules can't parse are handed to the LLM, not guessed", () => {
    const s = createState();
    expect(handle(s, "Vega, put the cuff up on her left leg", T0, opts)).toEqual({ parse: "put the cuff up on her left leg" });
    expect(s.pending).toBeNull();
  });

  test("an LLM intent goes through the same read-back and confirmation", () => {
    const s = createState();
    expect(applyIntent(s, intent({ intent: "tourniquet_on", side: "left", limb: "leg" }), T0, opts)).toBe("Tourniquet on, left leg, 14:20. Confirm?");
    expect(s.log).toHaveLength(0); // nothing logged until a human confirms
    expect(handle(s, "Confirmed", T0, opts)).toBe("Logged.");
  });

  test("an LLM drug name is still checked against the formulary and allergies", () => {
    const s = createState({ allergies: ["penicillin"] });
    expect(applyIntent(s, intent({ intent: "give_drug", drug: "amoxicilin" }), T0, opts)).toMatch(/^Caution: penicillin allergy/);
    expect(applyIntent(s, intent({ intent: "give_drug", drug: "unicorn juice" }), T0, opts)).toBe("Which drug? Say the name again.");
  });

  test("unknown or incomplete LLM intents fail closed", () => {
    const s = createState();
    expect(applyIntent(s, EMPTY_INTENT, T0, opts)).toBe(SAY_AGAIN);
    expect(applyIntent(s, intent({ intent: "call_specialist" }), T0, opts)).toBe("Which specialist?");
    expect(s.consult).toBeNull();
  });

  test("confirmations never go to the LLM", () => {
    const s = createState();
    handle(s, "Vega, tourniquet on, left thigh", T0, opts);
    expect(handle(s, "uh huh sounds about right", T0, opts)).toBeNull(); // not a clear "confirmed": stays pending, silent
    expect(s.pending).not.toBeNull();
  });
});
