// LLM fallback: turn a messy heard command into an Intent when the rules can't.
// The model only classifies. Its output is a strict JSON schema of enums (plus short phrases
// that are re-checked: drug names against the formulary), and applyIntent() decides everything else.
import OpenAI from "openai";
import { EMPTY_INTENT, type Intent } from "./brain.js";

export const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "checklist", "side", "limb", "drug", "dose", "value", "specialty", "topic", "item", "quantity", "detail", "sponges", "needles", "milestone", "imaging"],
  properties: {
    intent: {
      type: "string",
      enum: ["start_checklist", "tourniquet_on", "tourniquet_off", "give_drug", "antibiotic_time", "preop_value", "call_specialist",
        "tourniquet_time", "open_items", "final_count", "milestone", "imaging", "lookup", "unknown"],
    },
    checklist: { type: "string", enum: ["signin", "timeout", "signout", "none"] },
    side: { type: "string", enum: ["left", "right", "none"] },
    limb: { type: "string", enum: ["thigh", "arm", "leg", "forearm", "calf", "none"] },
    drug: { type: "string", description: "Drug name exactly as heard, or empty." },
    dose: { type: "string", description: "Dose exactly as heard (e.g. '2 grams'), or empty." },
    value: { type: "string", enum: ["potassium", "hemoglobin", "none"] },
    specialty: { type: "string", description: "call_specialist: the medical specialty (an informal description normalised, e.g. 'the hip guy' -> 'orthopedics', 'the heart doctor' -> 'cardiology') or the doctor's name as heard (e.g. 'Dr. Valdez'), or 'none'." },
    topic: { type: "string", enum: ["allergies", "orders", "procedure", "patient", "counts", "given", "milestones", "none"] },
    item: { type: "string", enum: ["sponge", "needle", "suture", "implant", "none"] },
    quantity: { type: "integer", description: "How many items were opened; 0 if not said." },
    detail: { type: "string", description: "Suture type (e.g. '4-0 Prolene') or implant description as heard, or empty." },
    sponges: { type: "integer", description: "Final counted sponges, -1 if not said." },
    needles: { type: "integer", description: "Final counted needles, -1 if not said." },
    milestone: { type: "string", enum: ["incision", "closure", "none"] },
    imaging: {
      type: "string",
      enum: ["show", "hide", "next", "previous", "goto", "scroll_down", "scroll_up", "zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up",
        "pan_down", "rotate", "reset", "window_soft", "window_bone", "window_wide", "view_axial", "view_coronal", "view_sagittal", "play", "stop",
        "landmark", "none"],
    },
  },
} as const;

export const SYSTEM = `You classify one spoken command from a surgical team to an operating-room safety assistant.
The text comes from speech recognition and often contains sound-alike errors. Read words by how they sound and by context:
"city" or "see tea" = CT; "got to the name" = go to the knee; "colonel" = coronal; "phone window" = bone window;
"the cough" = the calf; "uncle" = ankle; drug names may be split or misspelled. Prefer the operating-room meaning.
Return the single best intent. Rules:
- If the command is ambiguous, not one of the intents, or asks for medical advice, a diagnosis or a dose, return intent "unknown".
- Never invent values. Use "none", "", 0 or -1 when a field was not said.
- give_drug: copy the drug name as heard into "drug" and any dose as heard into "dose" (do not correct or substitute either).
- open_items: sponges/lap pads -> item "sponge"; loose needles -> "needle"; a suture like "4-0 Prolene" -> item "suture" with detail; an implant/graft/mesh/plate/screw -> item "implant" with detail.
- final_count: the team states the final count of sponges and/or needles.
- milestone: incision or closure being called.
- imaging: driving the CT viewer. goto: a slice number in "quantity". scroll_down/scroll_up: how many slices in "quantity" (0 if not said).
  landmark: going to a body part on the scan (hip, groin, thigh, knee, calf, ankle, foot) with the body part in "detail".
  window_bone / window_soft / window_wide: display window. view_axial / view_coronal (front view) / view_sagittal (side view).
  play: scroll through the scan automatically; stop: stop there. pan_*: move the view; reset: back to the default view.
- call_specialist: put the medical specialty into "specialty", normalising informal words ("the bone doctor" -> "orthopedics",
  "the anaesthetist" -> "anesthesia", "the vessel surgeon" -> "vascular"); if a doctor is named instead, copy the name.
- lookup: a question asking to hear something already in the case record (allergies, ordered medications or a drug's ordered dose
  with the drug in "drug", what has been given, sponge/needle counts, incision/closure times, the procedure or site, the patient).
  A question about a pre-op lab value is preop_value; about tourniquet time is tourniquet_time; about the antibiotic time is antibiotic_time.`;

export const supportsTemperature = (model: string) => /^gpt-(3|4)/.test(model);

export type IntentParser = (text: string) => Promise<Intent>;

export function createIntentParser(apiKey: string | undefined, model: string, timeoutMs = 3000): IntentParser | null {
  if (!apiKey) return null;
  const client = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 0 });
  return async (text: string) => {
    try {
      const res = await client.chat.completions.create({
        model,
        // Older chat models take temperature 0; newer reasoning-style models reject it.
        ...(supportsTemperature(model) ? { temperature: 0 } : {}),
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: text }],
        response_format: { type: "json_schema", json_schema: { name: "intent", strict: true, schema: SCHEMA } },
      });
      const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as Partial<Intent>;
      return { ...EMPTY_INTENT, ...parsed };
    } catch (e) {
      console.error("[intent] LLM parse failed:", (e as Error).message);
      return EMPTY_INTENT; // fail closed: "say that again"
    }
  };
}
