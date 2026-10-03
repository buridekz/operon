import { describe, test, expect } from "vitest";
import { createState, handle, view, applyIntent, EMPTY_INTENT, type Intent } from "./brain.js";
import { CT_STUDY, PLAY_MS, sliceCount } from "./ct.js";

const T0 = new Date("2026-10-04T14:20:00+08:00").getTime();
const opts = { minuteMs: 60000 };
const say = (s: ReturnType<typeof createState>, text: string, t = T0) => handle(s, `ARNIE, ${text}`, t, opts);
const intent = (p: Partial<Intent>): Intent => ({ ...EMPTY_INTENT, ...p });

describe("CT viewer by voice", () => {
  test("show, move through slices, jump and scroll", () => {
    const s = createState();
    expect(say(s, "show the CT")).toBe("Showing the CT.");
    const start = s.imaging!.slice;
    expect(say(s, "next slice")).toBe(`Slice ${start + 1} of ${CT_STUDY.slices}.`);
    expect(say(s, "go to slice 120")).toBe(`Slice 120 of ${CT_STUDY.slices}.`);
    expect(say(s, "scroll down 10")).toBe(`Slice 130 of ${CT_STUDY.slices}.`);
    expect(say(s, "go back five slices")).toBe(`Slice 125 of ${CT_STUDY.slices}.`);
    expect(say(s, "next 20 slices")).toBe(`Slice 145 of ${CT_STUDY.slices}.`);
    expect(say(s, "slice 999")).toBe(`There are ${CT_STUDY.slices} slices in this view.`);
    expect(say(s, "go to slice 1")).toBe(`Slice 1 of ${CT_STUDY.slices}.`);
    expect(say(s, "previous slice")).toBe(`Slice 1 of ${CT_STUDY.slices}.`); // stops at the edge
  });

  test("landmarks jump to the right level", () => {
    const s = createState();
    for (const [said, key] of [["go to the knee", "knee"], ["show me the hip", "hip"], ["take me to the ankle", "ankle"], ["show me the femur", "thigh"]]) {
      const slice = CT_STUDY.landmarks[key];
      if (!slice) continue; // a landmark not found on this scan
      expect(say(s, said)).toBe(`${key[0].toUpperCase()}${key.slice(1)}, slice ${slice} of ${CT_STUDY.slices}.`);
      expect(s.imaging).toMatchObject({ view: "axial", slice, visible: true });
    }
  });

  test("windows, views, zoom, pan and reset", () => {
    const s = createState();
    expect(say(s, "bone window")).toBe("Bone window.");
    expect(s.imaging!.window).toBe("bone");
    expect(say(s, "soft tissue window")).toBe("Soft tissue window.");
    expect(say(s, "show me the coronal view")).toBe("Coronal view.");
    expect(s.imaging).toMatchObject({ view: "coronal", slice: Math.round(sliceCount("coronal") / 2) });
    expect(say(s, "side view")).toBe("Sagittal view.");
    expect(say(s, "axial")).toBe("Axial view.");
    expect(say(s, "zoom in")).toBe("Zoom 1.5 times.");
    expect(say(s, "pan left")).toBe("Panned left.");
    expect(s.imaging!.panX).toBeGreaterThan(0);
    expect(say(s, "move the image down")).toBe("Panned down.");
    expect(say(s, "rotate")).toBe("Rotated to 90 degrees.");
    expect(say(s, "reset the view")).toBe("View reset.");
    expect(s.imaging).toMatchObject({ zoom: 1, panX: 0, panY: 0, rotation: 0, window: "soft" });
  });

  test("play through the scan, then stop where everyone sees it", () => {
    const s = createState();
    say(s, "go to slice 50");
    expect(say(s, "play through the scan")).toBe("Playing through the scan. Say stop when you're there.");
    const later = T0 + 10 * PLAY_MS + 5;
    expect(view(s, later, opts).imaging).toMatchObject({ slice: 60, playing: { everyMs: PLAY_MS } });
    expect(say(s, "stop", later)).toBe(`Stopped. Slice 60 of ${CT_STUDY.slices}.`);
    expect(s.imaging!.playing).toBeNull();
    expect(say(s, "stop", later)).toBe(`Slice 60 of ${CT_STUDY.slices}.`);
  });

  test("playing wraps around at the end", () => {
    const s = createState();
    say(s, `go to slice ${CT_STUDY.slices}`);
    say(s, "scroll through");
    expect(view(s, T0 + PLAY_MS + 1, opts).imaging!.slice).toBe(1);
  });

  test("it never touches the record, and ordinary talk isn't imaging", () => {
    const s = createState();
    for (const t of ["show the CT", "bone window", "coronal view", "play", "stop", "zoom in", "go to the knee"]) say(s, t);
    expect(s.log).toHaveLength(0);
    expect(s.pending).toBeNull();
    const o = createState();
    expect(say(o, "opening 5 sponges")).toBe("5 sponges opened. Confirm?");
    expect(handle(o, "There's bleeding at the knee", T0, opts)).toBeNull();
    expect(o.imaging).toBeNull();
  });

  test("the LLM path drives the same commands", () => {
    const s = createState();
    expect(applyIntent(s, intent({ intent: "imaging", imaging: "goto", quantity: 77 }), T0, opts)).toBe(`Slice 77 of ${CT_STUDY.slices}.`);
    expect(applyIntent(s, intent({ intent: "imaging", imaging: "view_coronal" }), T0, opts)).toBe("Coronal view.");
    expect(applyIntent(s, intent({ intent: "imaging", imaging: "landmark", detail: "elbow" }), T0, opts)).toBe("I can't find that on this scan.");
  });
});

describe("this scan's landmarks", () => {
  test("named places map to real levels; what isn't on the scan is said honestly", () => {
    const s = createState();
    expect(say(s, "go to the knee")).toBe(`Knee, slice 108 of ${CT_STUDY.slices}.`);
    expect(say(s, "show me the femoral artery")).toBe(`Upper thigh, slice 15 of ${CT_STUDY.slices}.`);
    expect(say(s, "show me the hip")).toBe("I can't find that on this scan.");
    expect(say(s, "coronal view")).toBe("Coronal view.");
    expect(s.imaging!.slice).toBe(88);
  });
});

describe("pause (manual only: the Room's Pause button / M key)", () => {
  test("paused, ARNIE ignores everything, even a drug it would flag, and even 'ARNIE, resume'", () => {
    const s = createState({ allergies: ["penicillin"] });
    s.paused = true; // what POST /api/listen { paused: true } does
    expect(handle(s, "So if the nurse says giving ampicillin, ARNIE would warn the team.", T0, opts)).toBeNull();
    expect(say(s, "show the CT")).toBeNull();
    expect(say(s, "resume")).toBeNull();
    expect(s.paused).toBe(true);
    expect(s.log).toHaveLength(0);
    s.paused = false; // the button again
    expect(handle(s, "Giving ampicillin", T0, opts)).toMatch(/^Caution: penicillin allergy/);
  });

  test("nothing said in the room pauses ARNIE", () => {
    for (const p of ["pause listening", "stop listening", "go to sleep", "stand by", "mute", "pause"]) {
      const s = createState();
      say(s, p);
      expect(s.paused).toBe(false);
    }
    const s = createState();
    say(s, "show the CT");
    expect(say(s, "stop")).toBe(`Slice 40 of ${CT_STUDY.slices}.`); // "stop" alone is the CT
  });

  test("the board sees it", () => {
    const s = createState();
    s.paused = true;
    expect(view(s, T0, opts).paused).toBe(true);
  });
});
