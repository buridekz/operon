import { describe, expect, test } from "vitest";
import { createState, handle } from "./brain.js";
import { freshSpeech, TurnTracker } from "./turns.js";

describe("Agora silent-turn accumulation", () => {
  test("strips speech we already stayed silent on", () => {
    expect(freshSpeech(" Juan Cruz, femoral repair.  Confirmed.", "Juan Cruz, femoral repair.")).toBe("Confirmed.");
    expect(freshSpeech("Confirmed. ARNIE, give ampicillin.", "Confirmed.")).toBe("ARNIE, give ampicillin.");
  });

  test("passes speech through when Agora did not re-send anything", () => {
    expect(freshSpeech("ARNIE, start time out.", null)).toBe("ARNIE, start time out.");
    expect(freshSpeech("Given.", "Confirmed.")).toBe("Given.");
  });

  test("replay of the live failure: a stale 'Confirmed.' no longer confirms the antibiotic", () => {
    const T0 = new Date("2026-10-04T14:20:00+08:00").getTime();
    const opts = { minuteMs: 60000 };
    const s = createState();
    const turns = new TurnTracker();
    const say = (heard: string, at: number) => {
      const fresh = turns.next(heard);
      const reply = fresh ? handle(s, fresh, at, opts) : null;
      const text = typeof reply === "string" ? reply : null;
      turns.settle(heard, !!text);
      return text;
    };

    say("ARNIE, start timeout.", T0);
    expect(say(" Juan Cruz, femoral repair.", T0 + 5000)).toBeNull();
    expect(say(" Juan Cruz, femoral repair.  Confirmed.", T0 + 7000)).toBe("Surgeon, is the site marked?");
    expect(say(" Site marked, left thigh.", T0 + 12000)).toMatch(/^Anesthesia, was antibiotic/);
    expect(say(" Confirmed.", T0 + 12700)).toBeNull(); // still being asked: ignored
    // Agora glues the ignored "Confirmed." onto the next utterance:
    // Only "give ampicillin" is new: it gets the allergy catch, and "Confirmed." is not reused.
    expect(say(" Confirmed.  ARNIE, give ampicillin.", T0 + 20000)).toMatch(/^Caution: penicillin allergy/);
    expect(s.checklist!.done.antibiotic).toBeFalsy();
  });
});
