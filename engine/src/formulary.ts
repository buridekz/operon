// Drug knowledge for the allergy guard: generic names with their drug classes, brand names,
// and a few non-drug substances. Heard names are matched deterministically, so a misheard or
// misspelled name resolves to a real entry or to nothing, never to a guess.

/** generic name -> class tags. A recorded allergy conflicts with a drug when its tag is one of these. */
const DRUG_TAGS: Record<string, string[]> = {
  // penicillins
  penicillin: ["penicillin"], amoxicillin: ["penicillin"], ampicillin: ["penicillin"], piperacillin: ["penicillin"],
  flucloxacillin: ["penicillin"], dicloxacillin: ["penicillin"], nafcillin: ["penicillin"], oxacillin: ["penicillin"],
  // cephalosporins
  cefazolin: ["cephalosporin"], ceftriaxone: ["cephalosporin"], cefuroxime: ["cephalosporin"], cefalexin: ["cephalosporin"],
  cefepime: ["cephalosporin"], ceftazidime: ["cephalosporin"], cefoxitin: ["cephalosporin"], cefotaxime: ["cephalosporin"],
  // other antibiotics
  meropenem: ["carbapenem"], ertapenem: ["carbapenem"], imipenem: ["carbapenem"], aztreonam: ["monobactam"],
  vancomycin: ["glycopeptide"], gentamicin: ["aminoglycoside"], amikacin: ["aminoglycoside"], tobramycin: ["aminoglycoside"],
  metronidazole: ["nitroimidazole"], clindamycin: ["lincosamide"],
  ciprofloxacin: ["fluoroquinolone", "quinolone"], levofloxacin: ["fluoroquinolone", "quinolone"], moxifloxacin: ["fluoroquinolone", "quinolone"],
  azithromycin: ["macrolide"], erythromycin: ["macrolide"], clarithromycin: ["macrolide"], doxycycline: ["tetracycline"],
  sulfamethoxazole: ["sulfa"], sulfadiazine: ["sulfa"],
  // anticoagulants and hemostasis
  heparin: [], enoxaparin: [], protamine: [], "tranexamic acid": [], oxytocin: [],
  // pain
  paracetamol: [], ketorolac: ["nsaid"], ibuprofen: ["nsaid"], diclofenac: ["nsaid"], naproxen: ["nsaid"], aspirin: ["nsaid"],
  morphine: ["opioid"], fentanyl: ["opioid"], remifentanil: ["opioid"], tramadol: ["opioid"], codeine: ["opioid"],
  oxycodone: ["opioid"], hydromorphone: ["opioid"], pethidine: ["opioid"],
  // anesthesia
  propofol: [], ketamine: [], midazolam: ["benzodiazepine"], diazepam: ["benzodiazepine"], rocuronium: ["neuromuscular blocker"],
  vecuronium: ["neuromuscular blocker"], cisatracurium: ["neuromuscular blocker"], succinylcholine: ["neuromuscular blocker"],
  sugammadex: [], neostigmine: [], lidocaine: ["local anesthetic"], bupivacaine: ["local anesthetic"], ropivacaine: ["local anesthetic"],
  ondansetron: [], metoclopramide: [], dexamethasone: [], glycopyrrolate: [],
  // vasoactive, emergency and fluids
  epinephrine: [], norepinephrine: [], phenylephrine: [], ephedrine: [], atropine: [], naloxone: [], labetalol: [], esmolol: [], hydralazine: [],
  "calcium gluconate": [], "sodium bicarbonate": [], "potassium chloride": [], insulin: [], mannitol: [], furosemide: [],
  // skin prep and materials: not drugs, but people are allergic to them
  povidone: ["iodine"], iodine: ["iodine"], betadine: ["iodine"], chlorhexidine: ["chlorhexidine"], latex: ["latex"], contrast: ["iodine", "contrast"],
};

/** brand or alternate name -> generic */
const ALIASES: Record<string, string> = {
  augmentin: "amoxicillin", zosyn: "piperacillin", tazocin: "piperacillin", bactrim: "sulfamethoxazole", septra: "sulfamethoxazole",
  cotrimoxazole: "sulfamethoxazole", rocephin: "ceftriaxone", ancef: "cefazolin", kefzol: "cefazolin", keflex: "cefalexin", cephalexin: "cefalexin",
  zithromax: "azithromycin", cipro: "ciprofloxacin", flagyl: "metronidazole", cleocin: "clindamycin", vancocin: "vancomycin",
  toradol: "ketorolac", tylenol: "paracetamol", acetaminophen: "paracetamol", advil: "ibuprofen", motrin: "ibuprofen", voltaren: "diclofenac",
  lovenox: "enoxaparin", narcan: "naloxone", versed: "midazolam", valium: "diazepam", diprivan: "propofol", zofran: "ondansetron",
  dilaudid: "hydromorphone", demerol: "pethidine", meperidine: "pethidine", adrenaline: "epinephrine", noradrenaline: "norepinephrine",
  lignocaine: "lidocaine", xylocaine: "lidocaine", marcaine: "bupivacaine", lasix: "furosemide", anectine: "succinylcholine", tranexamic: "tranexamic acid",
  hibiclens: "chlorhexidine", "povidone iodine": "povidone",
};

export const FORMULARY = Object.keys(DRUG_TAGS);
export type Drug = string;

/** Class tags for a generic name, including its own name. */
export function tagsOf(drug: string): string[] {
  return [drug, ...(DRUG_TAGS[drug] ?? [])];
}

const SYNONYMS: Record<string, string> = {
  pcn: "penicillin", penicillins: "penicillin", cephalosporins: "cephalosporin", cephalosporin: "cephalosporin",
  sulfas: "sulfa", sulpha: "sulfa", sulfonamide: "sulfa", sulfonamides: "sulfa", "sulfa drug": "sulfa", "sulfa drugs": "sulfa",
  nsaids: "nsaid", "anti inflammatories": "nsaid", "anti inflammatory": "nsaid",
  opiates: "opioid", opioids: "opioid", narcotics: "opioid", quinolones: "quinolone", fluoroquinolones: "fluoroquinolone",
  macrolides: "macrolide", "local anesthetics": "local anesthetic", "local anaesthetic": "local anesthetic", "local anaesthetics": "local anesthetic",
  iodine: "iodine", betadine: "iodine", "povidone iodine": "iodine", "contrast dye": "contrast", "contrast media": "contrast", iodinated: "iodine",
  benzodiazepines: "benzodiazepine", "muscle relaxants": "neuromuscular blocker", "neuromuscular blockers": "neuromuscular blocker",
};

/** Normalise a typed allergy ("Penicillins", "allergic to sulfa drugs") to a tag we can compare. */
export function allergyTag(raw: string): string {
  const t = raw.toLowerCase().replace(/\b(allerg(y|ic|ies)|to|reaction|hypersensitivity|history of)\b/g, " ").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  return SYNONYMS[t] ?? ALIASES[t] ?? t;
}

/** The recorded allergy a heard drug conflicts with, or null. Only classes we know are checked. */
export function allergyConflict(drug: string, allergies: string[]): string | null {
  const tags = tagsOf(drug);
  for (const a of allergies) {
    const tag = allergyTag(a);
    if (tag && tags.includes(tag)) return a;
  }
  return null;
}

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

const VOCAB = [...Object.keys(DRUG_TAGS), ...Object.keys(ALIASES)];
const generic = (name: string) => ALIASES[name] ?? name;

/**
 * Resolve a heard phrase to a generic drug (or substance), or null if it is not clearly one.
 * A small edit distance is allowed only for longer names and only when the best match is unambiguous.
 * `minFuzzy` is the shortest heard word that may be fuzzy-matched; overheard room speech uses a
 * higher value so ordinary talk is not mistaken for a drug.
 */
export function matchDrug(heard: string, minFuzzy = 5): Drug | null {
  const text = heard.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  for (const d of VOCAB) if (text === d || text.startsWith(`${d} `)) return generic(d);

  const words = text.split(" ");
  const candidates = [words.slice(0, 2).join(" "), words[0]];
  let best: { drug: string; dist: number } | null = null;
  let tie = false;
  for (const c of candidates) {
    if (c.length < minFuzzy) continue; // too short to trust ("a", "amp")
    for (const d of VOCAB) {
      const dist = levenshtein(c, d);
      const allowed = d.length >= 8 ? 2 : 1;
      if (dist > allowed) continue;
      if (!best || dist < best.dist) { best = { drug: generic(d), dist }; tie = false; }
      else if (dist === best.dist && generic(d) !== best.drug) tie = true;
    }
  }
  return best && !tie ? best.drug : null;
}
