// A second opinion for drugs outside our list. When the team names a drug we don't know, a model is
// asked one narrow question: does it belong to the same drug class as one of THIS patient's recorded
// allergies? The answer can only raise a "please verify" warning. It can never clear a conflict, never
// approves a drug and never gives advice: a drug we do list is always decided by the table instead.
import OpenAI from "openai";

export type ScreenHit = { drug: string; allergy: string };
export type DrugScreener = (heard: string, allergies: string[]) => Promise<ScreenHit | null>;

const SYSTEM = `You help an operating-room safety check. You get one sentence a team member said, and the patient's recorded allergies.
Decide only: (1) does the sentence name a medication or substance being given or used? (2) what is its generic name? (3) is it the same as,
or in the same drug class as, one of the recorded allergies? If so, choose that allergy exactly as written in the list; otherwise "none".
Only flag the same class (for example a penicillin-type antibiotic for a penicillin allergy). Do not flag different classes. Give no advice and no doses.`;

export function createDrugScreener(apiKey: string | undefined, model: string, timeoutMs = 3000): DrugScreener | null {
  if (!apiKey) return null;
  const client = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 0 });
  return async (heard, allergies) => {
    try {
      // The only allergies the answer may name are the patient's own.
      const schema = {
        type: "object",
        additionalProperties: false,
        required: ["is_medication", "generic_name", "conflicting_allergy"],
        properties: {
          is_medication: { type: "boolean" },
          generic_name: { type: "string" },
          conflicting_allergy: { type: "string", enum: [...allergies, "none"] },
        },
      };
      const res = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Recorded allergies: ${allergies.join(", ")}\nSentence: ${heard}` },
        ],
        response_format: { type: "json_schema", json_schema: { name: "drug_screen", strict: true, schema } },
      });
      const r = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { is_medication?: boolean; generic_name?: string; conflicting_allergy?: string };
      if (!r.is_medication || !r.generic_name || !r.conflicting_allergy || r.conflicting_allergy === "none") return null;
      if (!allergies.includes(r.conflicting_allergy)) return null;
      return { drug: r.generic_name.toLowerCase().trim(), allergy: r.conflicting_allergy };
    } catch (e) {
      console.error("[screen] failed:", (e as Error).message);
      return null; // fail quiet: the table already decided everything it knows about
    }
  };
}
