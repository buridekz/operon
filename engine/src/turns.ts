// Agora transport detail (found in a live test): when our endpoint stays silent, Agora keeps
// that user speech and prepends it to the next turn, e.g. a correctly ignored "Confirmed."
// came back as "Confirmed. <wake word>, give ampicillin." and confirmed the wrong item.
// We remember what we stayed silent on and only process the new words.

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** The part of `heard` that is new, given the text we already stayed silent on. */
export function freshSpeech(heard: string, ignored: string | null): string {
  const h = norm(heard);
  if (!ignored) return h;
  const i = norm(ignored);
  return i && h.toLowerCase().startsWith(i.toLowerCase()) ? h.slice(i.length).trim() : h;
}

/** Tracks Agora's accumulated silent text across turns. */
export class TurnTracker {
  private ignored: string | null = null;

  /** Returns only the new speech in this turn. */
  next(heard: string): string {
    return freshSpeech(heard, this.ignored);
  }

  /** Call after deciding the turn: silent turns are remembered, a reply clears the buffer. */
  settle(heard: string, replied: boolean) {
    this.ignored = replied ? null : norm(heard);
  }
}
