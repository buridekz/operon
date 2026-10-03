import { describe, test, expect } from "vitest";
import { createState, handle, view, summaryFacts, summaryTemplate, duration, type State } from "./brain.js";

const T0 = new Date("2026-10-04T14:20:00+08:00").getTime();
const MIN = 60000;
const opts = { minuteMs: MIN };
const chart = () => createState({ allergies: ["penicillin"], orders: "cefazolin 2 g", preop: { hemoglobin: "9.8", potassium: "3.9" } });
const say = (s: State, text: string, t: number) => handle(s, text, t, opts);

/** The demo, up to closing: briefing, start, CT, the two catches, a correct dose, sponges opened. */
function middle(s: State) {
  expect(say(s, "ARNIE, brief me", T0)).toBe(
    "Juan Cruz, 58-year-old male, left femoral bleed, for Exploration and repair, left femoral artery, left thigh. Allergic to penicillin. " +
      "Ordered: cefazolin 2 grams. Pre-op hemoglobin 9.8 and potassium 3.9. Status: not started yet.",
  );
  expect(say(s, "ARNIE, start the operation", T0 + MIN)).toBe("Operation start, incision, 14:21. Confirm?");
  expect(say(s, "Confirmed.", T0 + MIN)).toBe("Logged. Operation started at 14:21.");
  expect(s.phase).toBe("surgery");
  expect(say(s, "ARNIE, show the CT", T0 + 2 * MIN)).toBe("Showing the CT.");
  expect(say(s, "ARNIE, zoom in", T0 + 2 * MIN)).toBe("Zoom 1.5 times.");
  expect(say(s, "ARNIE, close the images", T0 + 2 * MIN)).toBe("Images closed.");
  expect(say(s, "Giving ampicillin, one gram.", T0 + 5 * MIN)).toMatch(/^Caution: penicillin allergy/);
  expect(say(s, "Hang cefazolin twenty grams.", T0 + 6 * MIN)).toMatch(/^Caution: cefazolin is ordered at 2 grams/);
  expect(say(s, "ARNIE, give cefazolin two grams", T0 + 7 * MIN)).toBe("Cefazolin 2 grams, 14:27. Confirm?");
  expect(say(s, "Confirmed.", T0 + 7 * MIN)).toBe("Logged.");
  say(s, "ARNIE, opening 10 sponges", T0 + 8 * MIN);
  say(s, "Confirmed.", T0 + 8 * MIN);
  expect(say(s, "ARNIE, how long have we been operating?", T0 + 30 * MIN)).toBe("29 minutes, since 14:21.");
  expect(say(s, "ARNIE, what time is it?", T0 + 30 * MIN)).toBe("It's 14:50.");
}

describe("the demo flow", () => {
  test("ending A: counts reconciled, a clean close with start, end and duration", () => {
    const s = chart();
    middle(s);
    say(s, "ARNIE, final count 10 sponges", T0 + 40 * MIN);
    expect(say(s, "Confirmed.", T0 + 40 * MIN)).toBe("Logged. Counts reconciled.");
    expect(say(s, "ARNIE, end the operation", T0 + 46 * MIN)).toBe("Operation end, closure, 15:06. Confirm?");
    expect(say(s, "Confirmed.", T0 + 46 * MIN)).toBe("Logged. Operation ended at 15:06, after 45 minutes, from 14:21 to 15:06.");
    expect(say(s, "ARNIE, how long did the operation take?", T0 + 50 * MIN)).toBe("The operation ran 45 minutes, from 14:21 to 15:06.");
    expect(say(s, "ARNIE, give me the summary", T0 + 50 * MIN)).toEqual({ summarize: true });

    const f = summaryFacts(s, T0 + 50 * MIN);
    expect(f).toMatchObject({ start: "14:21", end: "15:06", duration: "45 minutes", countsOk: true, counts: "final count reconciled" });
    expect(f.caught).toHaveLength(2);
    expect(summaryTemplate(f)).toContain("from 14:21 to 15:06, 45 minutes");
    expect(summaryTemplate(f)).toContain("No unresolved issues.");
    expect(view(s, T0 + 50 * MIN, opts).operation).toEqual({ start: "14:21", end: "15:06", duration: "45 minutes" });
  });

  test("ending B: a sponge is missing at closing, and the summary says so", () => {
    const s = chart();
    middle(s);
    say(s, "ARNIE, final count 9 sponges", T0 + 40 * MIN);
    expect(say(s, "Confirmed.", T0 + 40 * MIN)).toBe("Logged. Count mismatch: 1 sponge unaccounted.");
    say(s, "ARNIE, we're done", T0 + 46 * MIN);
    expect(say(s, "Confirmed.", T0 + 46 * MIN)).toBe(
      "Logged. Operation ended at 15:06, after 45 minutes, from 14:21 to 15:06. Caution: counts not reconciled, 1 sponge unaccounted.",
    );
    expect(s.log.at(-1)).toMatchObject({ kind: "alert", severity: "critical" });
    const f = summaryFacts(s, T0 + 50 * MIN);
    expect(f).toMatchObject({ countsOk: false, counts: "not reconciled: 1 sponge unaccounted" });
    expect(summaryTemplate(f)).toContain("Resolve the count before sign-off.");
    expect(summaryTemplate(f)).not.toContain("No unresolved issues.");
  });

  test("closing with sponges opened but never counted is flagged too", () => {
    const s = chart();
    say(s, "ARNIE, start the operation", T0); say(s, "Confirmed", T0);
    say(s, "ARNIE, opening 5 sponges", T0); say(s, "Confirmed", T0);
    say(s, "ARNIE, finish the surgery", T0 + 10 * MIN);
    expect(say(s, "Confirmed", T0 + 10 * MIN)).toMatch(/Caution: counts not reconciled, no final count recorded\.$/);
  });
});

describe("time and status", () => {
  test("before the operation starts", () => {
    const s = chart();
    expect(say(s, "ARNIE, how long have we been operating?", T0)).toBe("The operation hasn't started. Say: ARNIE, start the operation.");
    expect(say(s, "ARNIE, what's the time?", T0)).toBe("It's 14:20.");
    expect(say(s, "ARNIE, give me a heads up", T0)).toMatch(/^Juan Cruz, .* Status: not started yet\.$/);
  });

  test("the briefing follows the case", () => {
    const s = chart();
    say(s, "ARNIE, start the operation", T0); say(s, "Confirmed", T0);
    say(s, "ARNIE, give cefazolin 2 grams", T0); say(s, "Confirmed", T0);
    expect(say(s, "ARNIE, what's the status", T0 + 12 * MIN)).toMatch(/Status: operating 12 minutes, since 14:20; given: Cefazolin 2 grams\.$/);
  });

  test("starting twice doesn't restart the clock; the old checklist skip still works", () => {
    const s = chart();
    say(s, "ARNIE, start the operation", T0); say(s, "Confirmed", T0);
    expect(say(s, "ARNIE, start the operation", T0 + 5 * MIN)).toBe("The operation started at 14:20.");
    const c = chart();
    say(c, "ARNIE, start time out", T0);
    expect(say(c, "Skip it, let's start.", T0 + 5000)).toMatch(/^Time out not complete/);
  });

  test("durations read naturally", () => {
    expect(duration(T0, T0 + 20000)).toBe("less than a minute");
    expect(duration(T0, T0 + MIN)).toBe("1 minute");
    expect(duration(T0, T0 + 65 * MIN)).toBe("1 hour 5 minutes");
    expect(duration(T0, T0 + 120 * MIN)).toBe("2 hours");
  });
});
