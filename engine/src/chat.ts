// Conversation: when the team talks to ARNIE about something that isn't a command (who it is, what it
// can do, a question about the case, small talk), a model answers in its own words. It only *talks*:
// nothing it says is logged, it can't run a command, and it is told to stay inside the case record
// and to hand clinical decisions (doses, diagnosis, treatment) back to the team. Safety checks,
// read-backs and checklists stay with the rules.
import OpenAI from "openai";
import { supportsTemperature } from "./intent.js";

export type Chat = (said: string, caseContext: string) => Promise<string | null>;

const SYSTEM = `You are ARNIE (Always Ready Nurse, In Emergencies), the voice assistant of Operon, in an operating room. You speak out loud to the surgical team.
Style: one or two short spoken sentences (at most 35 words). Plain words, no lists, no markdown, no emoji. Warm and calm, like a good scrub nurse.

What you can do (say so when asked): listen to the team and speak up when a drug conflicts with a recorded allergy or a dose differs from the
ordered dose; run the WHO checklist (sign in, time out, sign out) out loud and refuse to skip steps; read back orders, tourniquet times, sponge
and needle counts before logging them; answer questions from the case record; show and move through the CT ("go to the knee", "bone window",
"coronal view", "play through the scan"); call a specialist and brief them; give the team a heads-up briefing on the patient; tell the time and how long the operation has run; give an end-of-case summary with start, end and duration; draft the operative record. You were built for the Agora Voice First track.

Rules:
- Questions about THIS patient: answer only from the case record below. If it isn't there, say it isn't in the record. Never invent values.
- General questions (what a procedure involves, what a drug class is, how something works): you may explain briefly in plain words, as
  general information, not as advice for this patient.
- If someone asks your name, or "their name" without clearly meaning the patient, they mean you: you're ARNIE.
- Never recommend, calculate or change a dose, never diagnose, never decide treatment. Say it's the team's call, and offer what you can read back.
- You cannot log, order, give or confirm anything by talking. If someone wants something done, tell them the command to say (for example
  "say: ARNIE, give cefazolin two grams").
- Don't start a sentence with "Caution" (that word is reserved for safety alerts).
- The speech you get comes from speech recognition and may contain sound-alike errors; read it by context.`;

export function createChat(apiKey: string | undefined, model: string, timeoutMs = 4000): Chat | null {
  if (!apiKey) return null;
  const client = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 0 });
  return async (said, caseContext) => {
    try {
      const res = await client.chat.completions.create({
        model,
        ...(supportsTemperature(model) ? { temperature: 0.4 } : {}),
        max_completion_tokens: 400,
        messages: [
          { role: "system", content: `${SYSTEM}\n\nCase record (read-only):\n${caseContext}` },
          { role: "user", content: said },
        ],
      });
      const text = res.choices[0]?.message?.content?.replace(/[*_#`]/g, "").replace(/\s+/g, " ").trim();
      return text ? text.slice(0, 400) : null;
    } catch (e) {
      console.error("[chat] failed:", (e as Error).message);
      return null;
    }
  };
}

export type Summarizer = (facts: object) => Promise<string | null>;

const SUMMARY = `You are ARNIE, the operating-room voice assistant. Say the end-of-case summary out loud to the surgical team.
Use ONLY the facts given (JSON). 3 to 4 short spoken sentences, at most 80 words, no lists, no markdown.
- Say the start time, end time and duration exactly as given (if the operation is still going, say so).
- Mention medications given, every safety catch (an allergy or dose that was held), any consult, and the count status.
- Call it uneventful or successful only if countsOk is true and nothing is unresolved. If counts are not reconciled, say so plainly
  and say it needs to be resolved before sign-off.
- No advice, no diagnosis, nothing that is not in the facts. Don't start with "Caution".`;

export function createSummarizer(apiKey: string | undefined, model: string, timeoutMs = 5000): Summarizer | null {
  if (!apiKey) return null;
  const client = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 0 });
  return async (facts) => {
    try {
      const res = await client.chat.completions.create({
        model,
        ...(supportsTemperature(model) ? { temperature: 0.3 } : {}),
        max_completion_tokens: 500,
        messages: [{ role: "system", content: SUMMARY }, { role: "user", content: JSON.stringify(facts) }],
      });
      const text = res.choices[0]?.message?.content?.replace(/[*_#`]/g, "").replace(/\s+/g, " ").trim();
      return text ? text.slice(0, 600) : null;
    } catch (e) {
      console.error("[summary] failed:", (e as Error).message);
      return null;
    }
  };
}
