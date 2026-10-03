import { describe, test, expect } from "vitest";
import { createState, handle, consultJoined, applyIntent, applyScreen, severityOf, EMPTY_INTENT, type State, type Intent } from "./brain.js";

const T0 = new Date("2026-10-04T14:20:00+08:00").getTime();
const MIN = 60000;
const opts = { minuteMs: MIN };
const GAP = 5000;
const intent = (p: Partial<Intent>): Intent => ({ ...EMPTY_INTENT, ...p });

function runTimeout(s: State) {
  handle(s, "ARNIE, start time out", T0, opts);
  handle(s, "Juan Cruz, exploration of the left femoral. Confirmed.", T0 + GAP, opts);
  return T0 + GAP;
}

describe("overhearing the team (no wake word)", () => {
  const chart = () => createState({ allergies: ["penicillin"], orders: "cefazolin 2 g" });

  test("a stated drug that conflicts with a recorded allergy is flagged without being asked", () => {
    const s = chart();
    expect(handle(s, "Nurse, giving ampicillin, one gram", T0, opts)).toBe("Caution: penicillin allergy recorded at sign-in. Ampicillin not logged.");
    expect(s.log.at(-1)).toMatchObject({ kind: "alert", severity: "critical" });
    expect(s.pending).toBeNull();
  });

  test("brand names, class names and spoken variations are understood", () => {
    expect(handle(chart(), "We're pushing Augmentin now", T0, opts)).toMatch(/^Caution: penicillin allergy .* Amoxicillin not logged\./);
    expect(handle(createState({ allergies: ["sulfa drugs"] }), "Giving Bactrim", T0, opts)).toMatch(/^Caution: sulfa drugs allergy/);
    expect(handle(createState({ allergies: ["NSAIDs"] }), "Starting ketorolac thirty milligrams", T0, opts)).toMatch(/^Caution: nsaids allergy/);
    expect(handle(createState({ allergies: ["Opiates"] }), "Giving fentanyl", T0, opts)).toMatch(/^Caution: opiates allergy/);
    expect(handle(createState({ allergies: ["codeine"] }), "Giving codeine", T0, opts)).toMatch(/^Caution: codeine allergy/);
  });

  test("non-drug allergens: latex and iodine prep", () => {
    expect(handle(createState({ allergies: ["latex"] }), "Using latex gloves", T0, opts)).toBe("Caution: latex allergy recorded at sign-in. Latex flagged.");
    expect(handle(createState({ allergies: ["iodine"] }), "Prepping with Betadine", T0, opts)).toBe("Caution: iodine allergy recorded at sign-in. Betadine flagged.");
  });

  test("a dose that differs from the ordered dose is flagged; the same dose is not", () => {
    const s = chart();
    expect(handle(s, "Giving cefazolin 20 grams", T0, opts)).toBe("Caution: cefazolin is ordered at 2 grams in the case record. 20 grams was stated. Not logged.");
    // the matching dose is not a conflict: it is read back to be logged (2 g = 2000 mg)
    expect(handle(s, "Pushing cefazolin, two grams", T0, opts)).toBe("Cefazolin 2 grams, 14:20. Confirm?");
    expect(handle(s, "Cancel", T0, opts)).toBe("Cancelled. Say it again.");
    expect(handle(s, "Giving cefazolin 2000 milligrams", T0, opts)).toBe("Cefazolin 2 grams, 14:20. Confirm?");
    expect(handle(s, "Cancel", T0, opts)).toBe("Cancelled. Say it again.");
    expect(handle(s, "Giving cefazolin 200 mg", T0, opts)).toMatch(/^Caution: cefazolin is ordered at 2 grams/);
    expect(handle(s, "Giving cefazolin", T0, opts)).toBe("Cefazolin, 14:20. Confirm?"); // no dose said: nothing to compare
  });

  test("a drug given with no conflict is read back, and logged once confirmed", () => {
    const s = chart();
    expect(handle(s, "Giving vancomycin one gram", T0, opts)).toBe("Vancomycin 1 gram, 14:20. Confirm?");
    expect(s.log).toHaveLength(0); // nothing logged until a person confirms
    expect(handle(s, "Confirmed.", T0, opts)).toBe("Logged.");
    expect(s.log.at(-1)).toMatchObject({ kind: "drug", text: "Vancomycin 1 gram given" });
    expect(handle(s, "Can I get more suction here?", T0, opts)).toBeNull();
    expect(handle(s, "Hand me the scalpel", T0, opts)).toBeNull();
  });

  test("a drug isn't read back over another read-back or a checklist question", () => {
    const s = chart();
    handle(s, "Giving vancomycin one gram", T0, opts);
    expect(handle(s, "Giving metronidazole 500 mg", T0, opts)).toBeNull();
    expect(handle(s, "Confirmed", T0, opts)).toBe("Logged.");
    const c = chart();
    handle(c, "ARNIE, start time out", T0, opts);
    expect(handle(c, "Giving vancomycin one gram", T0 + GAP, opts)).toBeNull();
  });

  test("starting and ending the operation, announced to the room", () => {
    const s = chart();
    expect(handle(s, "Okay team, starting the operation.", T0, opts)).toBe("Operation start, incision, 14:20. Confirm?");
    expect(handle(s, "Confirmed.", T0, opts)).toBe("Logged. Operation started at 14:20.");
    expect(handle(s, "Starting the operation", T0 + MIN, opts)).toBeNull(); // already started
    expect(handle(s, "Alright, closing.", T0 + 30 * MIN, opts)).toBeNull(); // "closing" with words before it isn't the announcement
    expect(handle(s, "Closing.", T0 + 30 * MIN, opts)).toBe("Operation end, closure, 14:50. Confirm?");
    expect(handle(s, "Confirmed.", T0 + 30 * MIN, opts)).toBe("Logged. Operation ended at 14:50, after 30 minutes, from 14:20 to 14:50.");
    const t = chart();
    expect(handle(t, "Incision.", T0, opts)).toBe("Operation start, incision, 14:20. Confirm?");
    const u = chart();
    handle(u, "Beginning the surgery now", T0, opts); handle(u, "Confirmed", T0, opts);
    expect(handle(u, "We're ending the procedure", T0 + 5 * MIN, opts)).toBe("Operation end, closure, 14:25. Confirm?");
  });

  test("ordinary talk doesn't start or end anything", () => {
    const s = chart();
    for (const t of ["The incision looks clean", "We're starting to see some bleeding", "Closing the gap on that vessel",
      "Is the surgery room ready?", "Let's start", "The patient is done with the scan"]) {
      expect(handle(s, t, T0, opts)).toBeNull();
    }
    expect(s.pending).toBeNull();
    expect(s.milestones).toEqual({});
  });

  test("the team talking a drug down is not an order", () => {
    const s = chart();
    expect(handle(s, "Don't give ampicillin, she's allergic", T0, opts)).toBeNull();
    expect(handle(s, "Do not give ampicillin", T0, opts)).toBeNull();
    expect(handle(s, "Not sure but giving ampicillin", T0, opts)).toMatch(/^Caution/);
  });

  test("it still speaks up mid-checklist and during a live consult", () => {
    const s = chart();
    const t = runTimeout(s);
    expect(handle(s, "Giving ampicillin", t + GAP, opts)).toMatch(/^Caution: penicillin allergy/);
    expect(s.checklist!.index).toBe(1); // not taken as the checklist answer

    const c = chart();
    handle(c, "ARNIE, call vascular", T0, opts);
    consultJoined(c, T0, opts);
    expect(handle(c, "Giving ampicillin", T0 + MIN, opts)).toMatch(/^Caution: penicillin allergy/);
    expect(handle(c, "What do you see on the angiogram?", T0 + MIN, opts)).toBeNull();
  });

  test("a drug we don't list is sent to be screened, only when allergies are recorded", () => {
    expect(handle(chart(), "Giving cefadroxil now", T0, opts)).toEqual({ screen: "Giving cefadroxil now" });
    expect(handle(createState({ allergies: [] }), "Giving cefadroxil now", T0, opts)).toBeNull();
    expect(handle(chart(), "Give me the scalpel", T0, opts)).toBeNull();
    expect(handle(chart(), "Starting the microscope", T0, opts)).toBeNull();
  });

  test("the model can only raise a verify warning", () => {
    const s = chart();
    const said = applyScreen(s, "cefadroxil", "penicillin", T0);
    expect(said).toBe("Please verify: Cefadroxil may conflict with the recorded penicillin allergy.");
    expect(severityOf(said)).toBe("warning");
    expect(s.log.at(-1)).toMatchObject({ kind: "alert", severity: "warning" });
  });

  test("ARNIE's own sentences never trigger it (the mic may hear the speaker)", () => {
    const s = chart();
    for (const said of [
      "Caution: penicillin allergy recorded at sign-in. Ampicillin not logged.",
      "Caution: cefazolin is ordered at 2 grams in the case record. 20 grams was stated. Not logged.",
      "Please verify: Cefadroxil may conflict with the recorded penicillin allergy.",
      "Anesthesia, was antibiotic prophylaxis given within the last 60 minutes?",
      "Time out not complete: antibiotic check not confirmed. Anesthesia, was antibiotic prophylaxis given within the last 60 minutes?",
      "Dr. Valdez, this is OR 3. 58-year-old male, left femoral bleed. Tourniquet 22 minutes. Penicillin allergy.",
      "Cefazolin 2 grams, 14:20. Confirm?", "Logged.", "Calling Dr. Valdez, vascular.", "Tourniquet time: 60 minutes.",
      "Showing the CT.", "Stopped. Slice 60 of 267.", "Bone window.", "Coronal view.", "Final count: 9 sponges, 2 needles. Confirm?",
    ]) expect(handle(s, said, T0, opts)).toBeNull();
  });
});

describe("doses on commanded drugs", () => {
  test("the read-back includes the dose and the log keeps it", () => {
    const s = createState({ orders: "cefazolin 2 g" });
    expect(handle(s, "ARNIE, give cefazolin 2 grams", T0, opts)).toBe("Cefazolin 2 grams, 14:20. Confirm?");
    expect(handle(s, "Confirmed", T0, opts)).toBe("Logged.");
    expect(s.log.at(-1)).toMatchObject({ kind: "drug", drug: "cefazolin", text: "Cefazolin 2 grams given" });
  });

  test("a different dose than ordered is held, not logged", () => {
    const s = createState({ orders: "cefazolin 2 g" });
    expect(handle(s, "ARNIE, giving cefazolin twenty grams", T0, opts)).toMatch(/^Caution: cefazolin is ordered at 2 grams in the case record\. 20 grams was stated/);
    expect(s.pending).toBeNull();
    expect(s.log.at(-1)).toMatchObject({ kind: "alert", severity: "critical" });
  });

  test("a dose with no order on file is just read back", () => {
    const s = createState();
    expect(handle(s, "ARNIE, give heparin 5000 units", T0, opts)).toBe("Heparin 5000 units, 14:20. Confirm?");
  });

  test("the LLM path carries the dose too", () => {
    const s = createState({ orders: "cefazolin 2 g" });
    expect(applyIntent(s, intent({ intent: "give_drug", drug: "cefazolin", dose: "20 grams" }), T0, opts)).toMatch(/^Caution: cefazolin is ordered at 2 grams/);
  });
});
