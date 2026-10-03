import { describe, test, expect } from "vitest";
import { normalizeHeard } from "./asr.js";
import { createState, handle } from "./brain.js";
import { CT_STUDY } from "./ct.js";

const T0 = new Date("2026-10-04T14:20:00+08:00").getTime();
const opts = { minuteMs: 60000 };

describe("speech-recognition sound-alikes", () => {
  test("what the live rehearsal heard now works", () => {
    const s = createState();
    expect(handle(s, "ARNIE, got to the name", T0, opts)).toBe(`Knee, slice 108 of ${CT_STUDY.slices}.`);
    expect(handle(s, "ARNIE, show the city", T0, opts)).toBe("Showing the CT.");
    expect(handle(s, "ARNIE, show the city scan", T0, opts)).toBe("Showing the CT.");
    expect(handle(s, "ARNIE, close the city", T0, opts)).toBe("Images closed.");
  });

  test.each([
    ["ARNIE, go to the need", "Knee"],
    ["ARNIE, go too the knees", "Knee"],
    ["ARNIE, take me to the cough", "Calf"],
    ["ARNIE, show me the uncle", "Ankle"],
    ["ARNIE, go to the thai", "Thigh"],
    ["ARNIE, show me the food", "Foot"],
  ])("%s", (said, landmark) => {
    expect(handle(createState(), said, T0, opts)).toMatch(new RegExp(`^${landmark}, slice`));
  });

  test("views, windows and moving around", () => {
    const s = createState();
    expect(handle(s, "ARNIE, colonel view", T0, opts)).toBe("Coronal view.");
    expect(handle(s, "ARNIE, phone window", T0, opts)).toBe("Bone window.");
    expect(handle(s, "ARNIE, soft issue window", T0, opts)).toBe("Soft tissue window.");
    expect(handle(s, "ARNIE, axle view", T0, opts)).toBe("Axial view.");
    expect(handle(s, "ARNIE, zone in", T0, opts)).toBe("Zoom 1.5 times.");
    expect(handle(s, "ARNIE, pen left", T0, opts)).toBe("Panned left.");
    expect(handle(s, "ARNIE, next slides", T0, opts)).toMatch(/^Slice \d+ of/);
    expect(handle(s, "ARNIE, slides 50", T0, opts)).toBe(`Slice 50 of ${CT_STUDY.slices}.`);
  });

  test("ordinary words are left alone outside their phrase", () => {
    expect(normalizeHeard("What's the patient's name?")).toBe("What's the patient's name?");
    expect(normalizeHeard("Show me the name of the patient")).toBe("Show me the name of the patient");
    expect(normalizeHeard("Show me the CT")).toBe("Show me the CT");
    expect(normalizeHeard("coronary artery bypass")).toBe("coronary artery bypass");
    expect(normalizeHeard("tighten the tourniquet cuff")).toBe("tighten the tourniquet cuff");
    expect(normalizeHeard("implant a 6 millimeter PTFE graft")).toBe("implant a 6 millimeter PTFE graft");
    expect(handle(createState(), "ARNIE, who's the patient?", T0, opts)).toBe("Juan Cruz. 58-year-old male, left femoral bleed.");
  });

  test("answers to ARNIE's questions are never rewritten", () => {
    const s = createState();
    handle(s, "ARNIE, tourniquet on, left thigh", T0, opts);
    expect(handle(s, "Confirmed", T0, opts)).toBe("Logged.");
  });
});

describe("what ARNIE comes through as (live Agora test and rehearsal)", () => {
  test.each(["Arne", "Arnie", "Arney", "Arni"])("'%s' wakes it", (w) => {
    expect(handle(createState(), `${w}, what's your name?`, T0, opts)).toHaveProperty("chat");
    expect(handle(createState(), `${w}, go to the knee`, T0, opts)).toBe(`Knee, slice 108 of ${CT_STUDY.slices}.`);
  });

  test("'I need' wakes it only when a clear command follows", () => {
    expect(handle(createState(), "I need, what time is it?", T0, opts)).toBe("It's 14:20.");
    expect(handle(createState(), "I need, show the CT.", T0, opts)).toBe("Showing the CT.");
    expect(handle(createState(), "I need, go to the knee", T0, opts)).toBe(`Knee, slice 108 of ${CT_STUDY.slices}.`);
    expect(handle(createState(), "I need, brief me", T0, opts)).toMatch(/^Juan Cruz, /);
    expect(handle(createState(), "I need more suction here", T0, opts)).toBeNull();
    expect(handle(createState(), "I need a second", T0, opts)).toBeNull();
    expect(handle(createState(), "I need, what's your name?", T0, opts)).toBeNull(); // never starts a chat
    const s = createState({ allergies: ["penicillin"] });
    expect(handle(s, "I need to give ampicillin", T0, opts)).toMatch(/^Caution: penicillin allergy/); // the safety check still runs
  });
});
