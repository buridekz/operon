import { describe, test, expect } from "vitest";
import { normalizeHeard } from "./asr.js";
import { createState, handle } from "./brain.js";
import { CT_STUDY } from "./ct.js";

const T0 = new Date("2026-10-04T14:20:00+08:00").getTime();
const opts = { minuteMs: 60000 };

describe("speech-recognition sound-alikes", () => {
  test("what the live rehearsal heard now works", () => {
    const s = createState();
    expect(handle(s, "Vega, got to the name", T0, opts)).toBe(`Knee, slice 108 of ${CT_STUDY.slices}.`);
    expect(handle(s, "Vega, show the city", T0, opts)).toBe("Showing the CT.");
    expect(handle(s, "Vega, show the city scan", T0, opts)).toBe("Showing the CT.");
    expect(handle(s, "Vega, close the city", T0, opts)).toBe("Images closed.");
  });

  test.each([
    ["Vega, go to the need", "Knee"],
    ["Vega, go too the knees", "Knee"],
    ["Vega, take me to the cough", "Calf"],
    ["Vega, show me the uncle", "Ankle"],
    ["Vega, go to the thai", "Thigh"],
    ["Vega, show me the food", "Foot"],
  ])("%s", (said, landmark) => {
    expect(handle(createState(), said, T0, opts)).toMatch(new RegExp(`^${landmark}, slice`));
  });

  test("views, windows and moving around", () => {
    const s = createState();
    expect(handle(s, "Vega, colonel view", T0, opts)).toBe("Coronal view.");
    expect(handle(s, "Vega, phone window", T0, opts)).toBe("Bone window.");
    expect(handle(s, "Vega, soft issue window", T0, opts)).toBe("Soft tissue window.");
    expect(handle(s, "Vega, axle view", T0, opts)).toBe("Axial view.");
    expect(handle(s, "Vega, zone in", T0, opts)).toBe("Zoom 1.5 times.");
    expect(handle(s, "Vega, pen left", T0, opts)).toBe("Panned left.");
    expect(handle(s, "Vega, next slides", T0, opts)).toMatch(/^Slice \d+ of/);
    expect(handle(s, "Vega, slides 50", T0, opts)).toBe(`Slice 50 of ${CT_STUDY.slices}.`);
  });

  test("ordinary words are left alone outside their phrase", () => {
    expect(normalizeHeard("What's the patient's name?")).toBe("What's the patient's name?");
    expect(normalizeHeard("Show me the name of the patient")).toBe("Show me the name of the patient");
    expect(normalizeHeard("Show me the CT")).toBe("Show me the CT");
    expect(normalizeHeard("coronary artery bypass")).toBe("coronary artery bypass");
    expect(normalizeHeard("tighten the tourniquet cuff")).toBe("tighten the tourniquet cuff");
    expect(normalizeHeard("implant a 6 millimeter PTFE graft")).toBe("implant a 6 millimeter PTFE graft");
    expect(handle(createState(), "Vega, who's the patient?", T0, opts)).toBe("Juan Cruz. 58-year-old male, left femoral bleed.");
  });

  test("answers to Vega's questions are never rewritten", () => {
    const s = createState();
    handle(s, "Vega, tourniquet on, left thigh", T0, opts);
    expect(handle(s, "Confirmed", T0, opts)).toBe("Logged.");
  });
});
