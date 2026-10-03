import { describe, test, expect } from "vitest";
import { createState, handle, consultJoined, applyIntent, parseRoster, EMPTY_INTENT, type Intent } from "./brain.js";

const T0 = new Date("2026-10-04T14:20:00+08:00").getTime();
const MIN = 60000;
const opts = { minuteMs: MIN };
const intent = (p: Partial<Intent>): Intent => ({ ...EMPTY_INTENT, ...p });

describe("pulling up the case record on request", () => {
  const chart = () => createState({
    patient: "Maria Santos", summary: "64-year-old female, right hip fracture", procedure: "right hip hemiarthroplasty", site: "right hip",
    allergies: ["penicillin", "latex"], orders: "cefazolin 2 g; tranexamic acid 1 g",
  });

  test("allergies, orders and a drug's ordered dose", () => {
    const s = chart();
    expect(handle(s, "ARNIE, what are the allergies?", T0, opts)).toBe("Allergies on record: penicillin and latex.");
    expect(handle(s, "ARNIE, any allergies?", T0, opts)).toBe("Allergies on record: penicillin and latex.");
    expect(handle(s, "ARNIE, what's ordered?", T0, opts)).toBe("Ordered: cefazolin 2 grams and tranexamic acid 1 gram.");
    expect(handle(s, "ARNIE, what's the dose of cefazolin?", T0, opts)).toBe("Cefazolin is ordered at 2 grams.");
    expect(handle(s, "ARNIE, what's the ordered dose for tranexamic acid?", T0, opts)).toBe("Tranexamic acid is ordered at 1 gram.");
    expect(handle(s, "ARNIE, what's the dose of heparin?", T0, opts)).toBe("No order for heparin on record.");
    expect(handle(createState({ allergies: [] }), "ARNIE, any allergies?", T0, opts)).toBe("No allergies recorded.");
  });

  test("patient, procedure and site come from setup", () => {
    const s = chart();
    expect(handle(s, "ARNIE, what's the procedure?", T0, opts)).toBe("Right hip hemiarthroplasty, right hip.");
    expect(handle(s, "ARNIE, which side?", T0, opts)).toBe("Right hip hemiarthroplasty, right hip.");
    expect(handle(s, "ARNIE, who's the patient?", T0, opts)).toBe("Maria Santos. 64-year-old female, right hip fracture.");
  });

  test("what has been given, counts and milestones follow the case as it goes", () => {
    const s = chart();
    expect(handle(s, "ARNIE, what's been given so far?", T0, opts)).toBe("No medications logged yet.");
    expect(handle(s, "ARNIE, how many sponges are on the field?", T0, opts)).toBe("No sponges or needles recorded yet.");
    expect(handle(s, "ARNIE, when was incision?", T0, opts)).toBe("No incision recorded yet.");
    expect(s.pending).toBeNull(); // a question is never taken as a milestone to log

    handle(s, "ARNIE, give cefazolin 2 grams", T0, opts); handle(s, "Confirmed", T0, opts);
    handle(s, "ARNIE, opening 10 sponges", T0, opts); handle(s, "Confirmed", T0, opts);
    handle(s, "ARNIE, incision", T0 + 2 * MIN, opts); handle(s, "Confirmed", T0 + 2 * MIN, opts);

    expect(handle(s, "ARNIE, what's been given so far?", T0, opts)).toBe("Given: Cefazolin 2 grams at 14:20.");
    expect(handle(s, "ARNIE, how many sponges are on the field?", T0, opts)).toBe("On the field: 10 sponges, 0 needles.");
    expect(handle(s, "ARNIE, when was incision?", T0, opts)).toBe("Incision at 14:22.");

    handle(s, "ARNIE, final count 9 sponges", T0, opts); handle(s, "Confirmed", T0, opts);
    expect(handle(s, "ARNIE, what's the count?", T0, opts)).toBe("On the field: 10 sponges, 0 needles. Final count not reconciled: 1 sponge unaccounted.");
  });

  test("the questions that already had answers keep them", () => {
    const s = chart();
    expect(handle(s, "ARNIE, what's the potassium?", T0, opts)).toBe("Pre-op potassium 3.9, from the case record.");
    expect(handle(s, "ARNIE, when was the antibiotic given?", T0, opts)).toBe("No antibiotic is recorded for this case.");
    expect(handle(s, "ARNIE, how long has the tourniquet been on?", T0, opts)).toBe("No tourniquet is recorded.");
  });

  test("looking things up never changes the record", () => {
    const s = chart();
    for (const q of ["ARNIE, what are the allergies?", "ARNIE, what's ordered?", "ARNIE, what's the procedure?", "ARNIE, how many sponges?"]) handle(s, q, T0, opts);
    expect(s.log).toHaveLength(0);
    expect(s.pending).toBeNull();
  });

  test("the LLM path can ask too", () => {
    const s = chart();
    expect(applyIntent(s, intent({ intent: "lookup", topic: "orders", drug: "cefazolin" }), T0, opts)).toBe("Cefazolin is ordered at 2 grams.");
    expect(applyIntent(s, intent({ intent: "lookup", topic: "none" }), T0, opts)).toBe("Sorry, say that again.");
  });
});

describe("the on-call roster comes from setup", () => {
  const roster = "orthopedics: Dr. Reyes; anesthesia: Dr. Tan";

  test("parsed from free text; the default roster when nothing is typed", () => {
    expect(parseRoster(roster)).toEqual([{ specialty: "orthopedics", doctor: "Dr. Reyes" }, { specialty: "anesthesia", doctor: "Dr. Tan" }]);
    expect(parseRoster("")).toContainEqual({ specialty: "vascular", doctor: "Dr. Valdez" });
    expect(parseRoster("nonsense")).toContainEqual({ specialty: "vascular", doctor: "Dr. Valdez" });
  });

  test("called by specialty, a short form, or the doctor's name", () => {
    expect(handle(createState({ specialists: roster }), "ARNIE, call orthopedics", T0, opts)).toBe("Calling Dr. Reyes, orthopedics.");
    expect(handle(createState({ specialists: roster }), "ARNIE, call ortho", T0, opts)).toBe("Calling Dr. Reyes, orthopedics.");
    expect(handle(createState({ specialists: roster }), "ARNIE, call Dr. Tan", T0, opts)).toBe("Calling Dr. Tan, anesthesia.");
    expect(handle(createState({ specialists: roster }), "ARNIE, page Reyes", T0, opts)).toBe("Calling Dr. Reyes, orthopedics.");
  });

  test("someone not on the roster is not called", () => {
    const s = createState({ specialists: roster });
    expect(handle(s, "ARNIE, call vascular", T0, opts)).toBe("No on-call vascular is listed for this case.");
    expect(s.consult).toBeNull();
  });

  test("the briefing and phone use the doctor from the roster", () => {
    const s = createState({ specialists: roster, summary: "64-year-old female, right hip fracture", allergies: [] });
    handle(s, "ARNIE, call ortho", T0, opts);
    expect(s.consult).toMatchObject({ specialty: "orthopedics", doctor: "Dr. Reyes", state: "ringing" });
    expect(consultJoined(s, T0, opts)).toBe("Dr. Reyes, this is OR 3. 64-year-old female, right hip fracture.");
  });

  test("the LLM path matches the roster the same way", () => {
    const s = createState({ specialists: roster });
    expect(applyIntent(s, intent({ intent: "call_specialist", specialty: "cardiology" }), T0, opts)).toBe("No on-call cardiology is listed for this case.");
    expect(applyIntent(s, intent({ intent: "call_specialist", specialty: "Dr. Reyes" }), T0, opts)).toBe("Calling Dr. Reyes, orthopedics.");
  });
});

describe("smaller cases found in the live check", () => {
  test("a question names one drug, including common abbreviations", () => {
    const s = createState({ orders: "cefazolin 2 g; tranexamic acid 1 g" });
    expect(handle(s, "ARNIE, how much TXA did we order", T0, opts)).toBe("Tranexamic acid is ordered at 1 gram.");
    expect(handle(s, "ARNIE, what dose of cefazolin is ordered?", T0, opts)).toBe("Cefazolin is ordered at 2 grams.");
  });

  test("specialty word forms reach the roster", () => {
    const roster = "orthopedics: Dr. Reyes; anesthesia: Dr. Tan; neurosurgery: Dr. Cruz";
    expect(applyIntent(createState({ specialists: roster }), intent({ intent: "call_specialist", specialty: "orthopaedic surgeon" }), T0, opts)).toBe("Calling Dr. Reyes, orthopedics.");
    expect(applyIntent(createState({ specialists: roster }), intent({ intent: "call_specialist", specialty: "anesthesiologist" }), T0, opts)).toBe("Calling Dr. Tan, anesthesia.");
    expect(applyIntent(createState({ specialists: roster }), intent({ intent: "call_specialist", specialty: "neurosurgeon" }), T0, opts)).toBe("Calling Dr. Cruz, neurosurgery.");
    expect(applyIntent(createState({ specialists: roster }), intent({ intent: "call_specialist", specialty: "cardiology" }), T0, opts)).toBe("No on-call cardiology is listed for this case.");
  });

  test("ending a consult when there is none", () => {
    expect(handle(createState(), "ARNIE, end consult", T0, opts)).toBe("No consult in progress.");
  });
});
