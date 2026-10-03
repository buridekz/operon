// Operon engine (voice agent "Vega"): the custom LLM endpoint for Agora's voice agent, case state, timers,
// specialist patch-in, and the live state feed (SSE) for the Next.js app.
import "dotenv/config";
import express, { type Response } from "express";
import cors from "cors";
import { createState, handle, applyIntent, applyScreen, chatContext, tick, consultJoined, endConsult, view, signRecord, severityOf, SAY_AGAIN, type CaseSetup, type Opts, type Severity, type Turn } from "./brain.js";
import { rtcRtmToken, startAgent, speak, stopAgent, type AgoraConfig } from "./agora.js";
import { createIntentParser } from "./intent.js";
import { createDrugScreener } from "./drugscreen.js";
import { createChat } from "./chat.js";
import { TurnTracker } from "./turns.js";

const cfg: AgoraConfig = {
  appId: process.env.AGORA_APP_ID ?? "",
  appCert: process.env.AGORA_APP_CERT ?? "",
  channel: process.env.CHANNEL || "operon-or3",
  publicUrl: (process.env.PUBLIC_URL || "").replace(/\/$/, ""),
  llmKey: process.env.LLM_KEY || "operon-dev-key",
  agentUid: 123456,
  roomUid: 1001,
  specialistUid: 2001,
  asrLanguage: process.env.ASR_LANGUAGE || "en-US",
  ttsPreset: process.env.TTS_PRESET || "openai_tts_1",
  ttsVoice: process.env.TTS_VOICE || "coral",
  speakerLock: process.env.SPEAKER_LOCK === "on",
};
const port = Number(process.env.PORT || 3000);
const opts: Opts = { minuteMs: Number(process.env.DEMO_MINUTE_MS || 60000), alertMinutes: [60, 90, 120] };
const parseIntent = createIntentParser(process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL || "gpt-5.4-mini");
const screenDrug = createDrugScreener(process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL || "gpt-5.4-mini");
let lastScreenAt = 0;
const chat = createChat(process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL || "gpt-5.4-mini");

/** Vega answering in its own words (see chat.ts). Falls back to "say that again" if the model is unavailable. */
async function converse(said: string): Promise<{ reply: string; via: "llm" | "rules" }> {
  const text = chat ? await chat(said, chatContext(state, Date.now(), opts)) : null;
  console.log(`[chat] "${said}" -> ${text ?? "(no answer)"}`);
  return text ? { reply: text, via: "llm" } : { reply: SAY_AGAIN, via: "rules" };
}

type Line = { who: "heard" | "sv"; text: string; severity?: Severity; at: number; via?: "rules" | "llm" };
let state = createState();
let transcript: Line[] = [];
let agentId: string | null = null;
const turns = new TurnTracker(); // strips speech Agora re-sends after a silent turn
const subscribers = new Set<Response>();

const snapshot = () => ({ ...view(state, Date.now(), opts), transcript, agent: { running: !!agentId, agentId }, llm: !!parseIntent });

function broadcast() {
  const data = `data: ${JSON.stringify(snapshot())}\n\n`;
  for (const res of subscribers) res.write(data);
}
function pushLine(line: Omit<Line, "at">) {
  transcript.push({ ...line, at: Date.now() });
  transcript = transcript.slice(-40);
}
async function speakOut(text: string, priority: "APPEND" | "INTERRUPT" = "APPEND") {
  pushLine({ who: "sv", text, severity: severityOf(text) });
  broadcast();
  if (!agentId) return;
  try { await speak(cfg, agentId, text, priority); } catch (e) { console.error("[speak]", (e as Error).message); }
}

/** One heard sentence → what Vega says (or null). Uses the LLM only if the rules can't parse a command. */
async function respond(heard: string): Promise<{ reply: string | null; via: "rules" | "llm" }> {
  const now = Date.now();
  const turn: Turn = handle(state, heard, now, opts);
  if (turn === null || typeof turn === "string") return { reply: turn, via: "rules" };
  if ("chat" in turn) return converse(turn.chat);
  if ("screen" in turn) { // room speech naming a drug that isn't in our list
    if (!screenDrug || Date.now() - lastScreenAt < 3000) return { reply: null, via: "rules" };
    lastScreenAt = Date.now();
    const hit = await screenDrug(turn.screen, state.case.allergies);
    console.log(`[screen] "${turn.screen}" -> ${hit ? JSON.stringify(hit) : "no conflict flagged"}`);
    return { reply: hit ? applyScreen(state, hit.drug, hit.allergy, Date.now()) : null, via: "llm" };
  }
  if (!parseIntent) return { reply: SAY_AGAIN, via: "rules" };
  const intent = await parseIntent(turn.parse);
  console.log(`[llm] "${turn.parse}" -> ${JSON.stringify(intent)}`);
  if (intent.intent === "conversation") return converse(turn.parse);
  return { reply: applyIntent(state, intent, Date.now(), opts), via: "llm" };
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ---------- Custom LLM endpoint (called by Agora's cloud every turn) ----------
type Msg = { role: string; content: string | { text?: string }[] };
function lastUserText(messages: Msg[] = []): string {
  const m = [...messages].reverse().find((x) => x.role === "user");
  if (!m) return "";
  return typeof m.content === "string" ? m.content : m.content.map((c) => c.text ?? "").join(" ");
}

app.post("/chat/completions", async (req, res) => {
  if (req.headers.authorization !== `Bearer ${cfg.llmKey}`) return void res.status(401).json({ error: "unauthorized" });
  const raw = lastUserText(req.body?.messages);
  const heard = turns.next(raw); // only the words that are new this turn
  let reply: string | null = null;
  if (heard) {
    pushLine({ who: "heard", text: heard });
    const r = await respond(heard);
    reply = r.reply;
    if (reply) pushLine({ who: "sv", text: reply, severity: severityOf(reply), via: r.via });
    broadcast();
    console.log(`[heard] ${heard}  ->  ${reply ?? "(silent)"}${r.via === "llm" ? "  [llm]" : ""}${heard !== raw.trim() ? `  (Agora re-sent: "${raw.trim()}")` : ""}`);
  }
  if (raw) turns.settle(raw, !!reply);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  if (reply) {
    const id = `chatcmpl-${Date.now()}`;
    const chunk = (delta: object, finish: string | null = null) =>
      res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: "operon-brain", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
    chunk({ role: "assistant", content: reply });
    chunk({}, "stop");
  }
  res.write("data: [DONE]\n\n"); // no chunks = Vega stays silent this turn
  res.end();
});

// ---------- App API (used by the Next.js app) ----------
app.get("/api/config", (_req, res) =>
  res.json({ appId: cfg.appId, channel: cfg.channel, roomUid: cfg.roomUid, specialistUid: cfg.specialistUid, agentUid: cfg.agentUid, ready: !!(cfg.appId && cfg.appCert), llm: !!parseIntent }));

app.post("/api/token", (req, res) => {
  const uid = req.body?.role === "specialist" ? cfg.specialistUid : cfg.roomUid;
  res.json({ uid, token: rtcRtmToken(cfg, uid), channel: cfg.channel, appId: cfg.appId });
});

app.post("/api/case", (req, res) => {
  state = createState((req.body ?? {}) as CaseSetup);
  transcript = [];
  broadcast();
  res.json(snapshot());
});

app.post("/api/start", async (_req, res) => {
  if (!cfg.publicUrl) return void res.status(400).json({ error: "PUBLIC_URL is not set: Agora's cloud must reach /chat/completions." });
  try {
    if (agentId) await stopAgent(cfg, agentId).catch(() => {});
    const r = await startAgent(cfg);
    agentId = r.agent_id;
    broadcast();
    res.json(r);
  } catch (e) {
    console.error("[start]", (e as Error).message);
    res.status(502).json({ error: (e as Error).message });
  }
});

// The room's pause button: Vega stops listening (the mic is muted on the room device too).
app.post("/api/listen", (req, res) => {
  state.paused = req.body?.paused === true;
  broadcast();
  res.json({ ok: true, paused: state.paused });
});

app.post("/api/stop", async (_req, res) => {
  if (agentId) await stopAgent(cfg, agentId).catch((e) => console.error("[stop]", e.message));
  agentId = null;
  broadcast();
  res.json({ ok: true });
});

app.post("/api/consult/joined", async (_req, res) => {
  const brief = consultJoined(state, Date.now(), opts);
  if (brief) await speakOut(brief, "INTERRUPT");
  res.json({ ok: true, brief });
});

// The specialist hung up or declined: Vega tells the room and is back to normal.
app.post("/api/consult/end", async (_req, res) => {
  const said = endConsult(state, Date.now(), "specialist");
  if (said) await speakOut(said);
  res.json({ ok: true, said });
});

// Rehearsal: feed a sentence as if heard (no microphone needed). Replies are spoken if the agent runs.
app.post("/api/simulate", async (req, res) => {
  const heard = String(req.body?.text ?? "");
  pushLine({ who: "heard", text: heard });
  const r = await respond(heard);
  if (r.reply) await speakOut(r.reply);
  else broadcast();
  res.json(r);
});

app.post("/api/record/sign", (_req, res) => {
  signRecord(state, Date.now());
  broadcast();
  res.json({ ok: true });
});

app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  subscribers.add(res);
  res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
  req.on("close", () => subscribers.delete(res));
});

// Timers: check every second, speak alerts out loud.
setInterval(() => {
  const alert = tick(state, Date.now(), opts);
  if (alert) void speakOut(alert.text, alert.urgent ? "INTERRUPT" : "APPEND");
  else if (state.tourniquet) broadcast(); // keep the board's timer ticking
}, 1000);

app.listen(port, () => {
  console.log(`Operon engine on http://localhost:${port}`);
  console.log(`  LLM intent fallback: ${parseIntent ? `on (${process.env.OPENAI_MODEL || "gpt-5.4-mini"})` : "off (set OPENAI_API_KEY to enable)"}`);
  if (!cfg.appId || !cfg.appCert) console.log("  ! AGORA_APP_ID / AGORA_APP_CERT missing: copy .env.example to .env");
  if (!cfg.publicUrl) console.log("  ! PUBLIC_URL missing: start a tunnel and set it so Agora can reach /chat/completions");
});
