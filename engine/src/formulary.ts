// A fixed drug list. Heard drug names are matched against it deterministically, so a
// misheard or misspelled name resolves to a real drug or to "Which drug?", never to a guess.

export const FORMULARY = [
  "ampicillin", "amoxicillin", "penicillin", "piperacillin", "cefazolin", "ceftriaxone", "cefuroxime",
  "vancomycin", "gentamicin", "metronidazole", "clindamycin", "ciprofloxacin",
  "heparin", "protamine", "tranexamic acid", "oxytocin",
  "paracetamol", "ketorolac", "morphine", "fentanyl", "tramadol",
  "ondansetron", "dexamethasone", "propofol", "ketamine", "midazolam", "rocuronium", "succinylcholine",
  "epinephrine", "norepinephrine", "phenylephrine", "ephedrine", "atropine", "naloxone",
  "calcium gluconate", "sodium bicarbonate", "potassium chloride", "insulin", "mannitol",
] as const;

export type Drug = (typeof FORMULARY)[number];

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/**
 * Resolve a heard phrase to a formulary drug, or null if it is not clearly one drug.
 * Allows a small edit distance only for longer names, and only when the best match is unambiguous.
 */
export function matchDrug(heard: string): Drug | null {
  const text = heard.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  for (const d of FORMULARY) if (text === d || text.startsWith(`${d} `)) return d;

  const words = text.split(" ");
  const candidates = [words.slice(0, 2).join(" "), words[0]];
  let best: { drug: Drug; dist: number } | null = null;
  let tie = false;
  for (const c of candidates) {
    if (c.length < 5) continue; // too short to trust ("a", "amp")
    for (const d of FORMULARY) {
      const dist = levenshtein(c, d);
      const allowed = d.length >= 8 ? 2 : 1;
      if (dist > allowed) continue;
      if (!best || dist < best.dist) { best = { drug: d, dist }; tie = false; }
      else if (dist === best.dist && d !== best.drug) tie = true;
    }
  }
  return best && !tie ? best.drug : null;
}
