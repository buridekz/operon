import { describe, test, expect } from "vitest";
import { parseDose, fmtDose, sameDose, parseOrders, findMedMention, unknownDrugWord } from "./meds.js";
import { matchDrug, allergyConflict, allergyTag } from "./formulary.js";

const mg = (amount: number) => ({ amount, unit: "mg" as const });

describe("doses", () => {
  test.each([
    ["2 grams", mg(2000)], ["2g", mg(2000)], ["500 mg", mg(500)], ["five hundred milligrams", mg(500)], ["twenty grams", mg(20000)],
    ["half a gram", mg(500)], ["one and a half grams", mg(1500)], ["a gram", mg(1000)], ["one point five grams", mg(1500)],
    ["50 mcg", mg(0.05)], ["1,000 mg", mg(1000)], ["Cefazolin 2 grams.", mg(2000)],
    ["5000 units", { amount: 5000, unit: "units" }], ["two thousand units", { amount: 2000, unit: "units" }], ["10 cc", { amount: 10, unit: "ml" }],
  ])("%s", (text, dose) => expect(parseDose(text)).toEqual(dose));

  test("no unit, no dose", () => {
    expect(parseDose("giving cefazolin")).toBeNull();
    expect(parseDose("two of them")).toBeNull();
    expect(parseDose("constructor grams")).toBeNull();
  });

  test("said back the way a person would", () => {
    expect(fmtDose(mg(2000))).toBe("2 grams");
    expect(fmtDose(mg(1000))).toBe("1 gram");
    expect(fmtDose(mg(1500))).toBe("1.5 grams");
    expect(fmtDose(mg(500))).toBe("500 milligrams");
    expect(fmtDose(mg(0.05))).toBe("50 micrograms");
    expect(fmtDose({ amount: 5000, unit: "units" })).toBe("5000 units");
  });

  test("same dose across units; different kinds never match", () => {
    expect(sameDose(mg(2000), parseDose("2 g")!)).toBe(true);
    expect(sameDose(mg(2000), mg(20000))).toBe(false);
    expect(sameDose(mg(2000), { amount: 2000, unit: "ml" })).toBe(false);
  });

  test("orders come from free text", () => {
    expect(parseOrders("cefazolin 2 g; heparin 5,000 units, nonsense words")).toEqual([
      { drug: "cefazolin", dose: mg(2000) },
      { drug: "heparin", dose: { amount: 5000, unit: "units" } },
    ]);
    expect(parseOrders("")).toEqual([]);
    expect(parseOrders(undefined)).toEqual([]);
  });
});

describe("spotting a medication in room speech", () => {
  test("verb + drug (+ dose)", () => {
    expect(findMedMention("Giving ampicillin, one gram")).toEqual({ drug: "ampicillin", dose: mg(1000), negated: false });
    expect(findMedMention("Nurse, pushing 2 grams of cefazolin now")).toMatchObject({ drug: "cefazolin", dose: mg(2000) });
    expect(findMedMention("Prepping with Betadine")).toMatchObject({ drug: "betadine" });
    expect(findMedMention("Let's start the tranexamic acid")).toMatchObject({ drug: "tranexamic acid" });
  });

  test("no verb, no drug, or a negation", () => {
    expect(findMedMention("Ampicillin is on the tray")).toBeNull();
    expect(findMedMention("Hand me the scalpel")).toBeNull();
    expect(findMedMention("Don't give ampicillin")?.negated).toBe(true);
  });

  test("an unlisted drug-like word after a verb", () => {
    expect(unknownDrugWord("Giving cefadroxil now")).toBe("cefadroxil");
    for (const t of ["Give me the scalpel", "Starting the microscope", "Using suction", "Giving him more time", "Don't give cefadroxil"]) expect(unknownDrugWord(t)).toBeNull();
  });
});

describe("drug and allergy knowledge", () => {
  test("brand and generic names", () => {
    expect(matchDrug("Augmentin")).toBe("amoxicillin");
    expect(matchDrug("Rocephin 1 gram")).toBe("ceftriaxone");
    expect(matchDrug("toradol")).toBe("ketorolac");
    expect(matchDrug("amoxicilin")).toBe("amoxicillin");
    expect(matchDrug("adrenaline")).toBe("epinephrine");
    expect(matchDrug("unicorn juice")).toBeNull();
  });

  test("overheard speech is stricter about fuzzy matches than a direct command", () => {
    expect(matchDrug("cefazol", 8)).toBeNull(); // too short to trust in room chatter
    expect(matchDrug("cefazol")).toBe("cefazolin");
  });

  test("allergies are matched by class, not by the exact word typed", () => {
    expect(allergyConflict("ampicillin", ["penicillin"])).toBe("penicillin");
    expect(allergyConflict("ampicillin", ["Penicillins"])).toBe("Penicillins");
    expect(allergyConflict("ampicillin", ["PCN"])).toBe("PCN");
    expect(allergyConflict("cefazolin", ["penicillin"])).toBeNull(); // a different class
    expect(allergyConflict("cefazolin", ["cephalosporins"])).toBe("cephalosporins");
    expect(allergyConflict("sulfamethoxazole", ["sulfa drugs"])).toBe("sulfa drugs");
    expect(allergyConflict("ketorolac", ["NSAIDs"])).toBe("NSAIDs");
    expect(allergyConflict("vancomycin", ["penicillin", "latex"])).toBeNull();
    expect(allergyTag("Allergic to Penicillin")).toBe("penicillin");
  });
});
