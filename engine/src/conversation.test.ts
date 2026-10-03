import { describe, test, expect } from "vitest";
import { createState, handle, chatContext } from "./brain.js";

const T0 = new Date("2026-10-04T14:20:00+08:00").getTime();
const opts = { minuteMs: 60000 };

describe("talking to ARNIE", () => {
  test.each([
    "ARNIE, what's your name?", "ARNIE, who are you?", "ARNIE, what can you do?", "ARNIE, tell us about yourself",
    "ARNIE, how are you?", "ARNIE, thank you", "ARNIE, are you listening?",
  ])("%s goes to conversation, not a lookup", (said) => {
    const s = createState();
    const turn = handle(s, said, T0, opts);
    expect(turn).toHaveProperty("chat");
    expect(s.log).toHaveLength(0);
    expect(s.pending).toBeNull();
  });

  test("questions about the patient are still read from the record", () => {
    expect(handle(createState(), "ARNIE, who's the patient?", T0, opts)).toBe("Juan Cruz. 58-year-old male, left femoral bleed.");
    expect(handle(createState(), "ARNIE, what's the patient's name?", T0, opts)).toBe("Juan Cruz. 58-year-old male, left femoral bleed.");
    expect(handle(createState(), "ARNIE, what are the allergies?", T0, opts)).toBe("Allergies on record: penicillin.");
  });

  test("things the rules don't know go to the model, which decides command or conversation", () => {
    expect(handle(createState(), "ARNIE, what's their name", T0, opts)).toEqual({ parse: "what's their name" });
    expect(handle(createState(), "ARNIE, is the patient diabetic?", T0, opts)).toHaveProperty("parse");
  });

  test("talk that isn't addressed to ARNIE never starts a conversation", () => {
    expect(handle(createState(), "What's your name, by the way?", T0, opts)).toBeNull();
  });

  test("the model only sees the case record, as facts", () => {
    const s = createState({ allergies: ["penicillin"], orders: "cefazolin 2 g", specialists: "vascular: Dr. Valdez" });
    handle(s, "ARNIE, give cefazolin 2 grams", T0, opts);
    handle(s, "Confirmed", T0, opts);
    const ctx = chatContext(s, T0, opts);
    expect(ctx).toContain("Allergies: penicillin.");
    expect(ctx).toContain("Ordered medications: cefazolin 2 grams.");
    expect(ctx).toContain("vascular: Dr. Valdez");
    expect(ctx).toContain("Cefazolin 2 grams given");
  });
});

describe("small parsing fixes from the live check", () => {
  test("'give the cefazolin for me' names the drug", () => {
    expect(handle(createState(), "ARNIE, can you give the cefazolin for me", T0, opts)).toMatch(/^Cefazolin, \d\d:\d\d\. Confirm\?$/);
    expect(handle(createState(), "ARNIE, give him some fentanyl please", T0, opts)).toMatch(/^Fentanyl, /);
  });
});

describe("decision questions", () => {
  test("'should we give…' is a conversation, not an order; 'give more…' is still an order", () => {
    expect(handle(createState(), "ARNIE, should we give more heparin?", T0, opts)).toHaveProperty("chat");
    expect(handle(createState(), "ARNIE, is it safe to give ampicillin?", T0, opts)).toHaveProperty("chat");
    expect(handle(createState(), "ARNIE, give more heparin", T0, opts)).toMatch(/^Heparin, /);
  });
});
