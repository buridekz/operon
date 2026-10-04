# Operon engine

Node + TypeScript. Agora's Conversational AI agent hears the operating room; this server is its brain: a deterministic state machine exposed as an OpenAI-compatible `/chat/completions` endpoint. The UI is the Next.js app in `../web`.

```
/room (web) ──mic──► Agora channel ──► Agora voice agent (ARES ASR, managed TTS)
/specialist (web) ─► same channel             │ every heard sentence
                                               ▼
   engine: POST /chat/completions → turns.ts (new words only) → brain.ts → reply or silence
           unknown command → intent.ts (OpenAI, strict JSON) → same deterministic applyIntent()
           timers / briefings → Agora /speak · live state → web via SSE (/api/events)
```

## One-time setup

1. Agora Console → project: enable **RTC**, **RTM (Signaling)** and **Conversational AI**; copy App ID + App Certificate.
2. `cp .env.example .env` and fill in `AGORA_APP_ID`, `AGORA_APP_CERT`, a random `LLM_KEY`, and (optional) `OPENAI_API_KEY`.
3. `npm install`

## Run (with the web app)

```bash
# 1. Public tunnel so Agora's cloud can reach /chat/completions
cloudflared tunnel --url http://localhost:3000      # put the https URL in .env as PUBLIC_URL

# 2. Engine
npm start                                            # http://localhost:3000  (npm run dev to watch)

# 3. Web app (in ../web)
npm run build && npm start                           # http://localhost:3001
```

Open `http://localhost:3001/room` (room device), `/board` (big screen), `/specialist` (phone; see web README for the phone tunnel).

## What is AI and what is code

| Part | How |
|---|---|
| Hearing the room | AI: Agora ARES speech recognition |
| Command understanding | Rules first; if they can't tell, **OpenAI with a strict JSON schema of enums** (fallback only) |
| Drug names | Deterministic formulary match (`formulary.ts`); unclear → "Which drug?" |
| Read-back, confirmations, allergy and dose guard, timers, briefing, CT control, summary facts | **Deterministic code + scripted text** (`brain.ts`) |
| Medical decisions, dosing | **Never**: out of scope by design |

Confirmations ("Confirmed") and checklist answers are never sent to the LLM.

**Model choice (benchmarked October 4 on 24 OR commands incl. 2 medical-advice refusals):** gpt-5.4-mini and gpt-4.1-mini were 24/24 at ~0.9 s; gpt-5.6-luna and gpt-6-luna were 24/24 at ~1.5 s with hidden reasoning tokens; the nano models missed commands. Default: `OPENAI_MODEL=gpt-5.4-mini` (switch in `.env`).

## Demo script

| Say | ARNIE |
|---|---|
| "ARNIE, who are you?" | Introduces itself and what it does |
| "ARNIE, brief me." | Reads the case, allergies and ordered medications |
| "Okay team, starting the operation." → "Confirmed." | "Operation start, incision, 08:52. Confirm?" → "Logged." (the operation clock starts) |
| "ARNIE, show the CT." · "go to the knee." · "zoom in." · "close the images." | CT sample study on the board, driven by voice |
| "Giving penicillin." | **"Caution: penicillin allergy recorded at sign-in. Penicillin not logged."** |
| "Hang cefazolin twenty grams." | **A caution that the ordered dose is 2 grams; nothing is logged** |
| "Giving cefazolin two grams." → "Confirmed." | Read-back, then "Logged." |
| "ARNIE, call vascular." | The specialist's phone rings; on answer, ARNIE briefs them |
| "ARNIE, end consult." | "Consult ended." |
| "Closing." → "Confirmed." | "Operation end, closure, 08:56. Confirm?" → "Logged. Operation ended, 4 minutes." |
| "ARNIE, give me the summary." | Spoken summary of start, end, duration, cautions and consults |

Messy phrasing is parsed by the OpenAI fallback into the same commands, with the same read-back. Dose questions return "Say that again." `DEMO_MINUTE_MS=1000` makes one case minute last one second for a short demo (use `60000` for real time). Rehearse without a mic using the box on `/room`.

## Tests

```bash
npm test          # Vitest: 158 tests (brain, overhearing, medications, lookups, imaging, conversation, ASR fixes, Agora turn handling)
npm run typecheck
```

## What the live Agora tests found (and fixed)

Tested end to end: synthesized speech → `/room` mic → Agora ARES → `/chat/completions` → spoken reply.

1. **Split answers.** Agora split "Site marked… Confirmed." into two turns; the trailing "Confirmed." would have confirmed the *next* question. Answers that arrive while a question is still being spoken are now ignored.
2. **Silent turns are re-sent.** When we stay silent, Agora prepends that speech to the next turn ("Confirmed. ARNIE, give ampicillin."). `turns.ts` strips what we already ignored, so a stale "Confirmed." can't be reused.
3. **Commands mid-checklist.** "Give ampicillin" during a time-out was being swallowed; recognised wake-phrase commands now run at any time.
4. **Drug names are the riskiest words.** A synthesized "ampicillin" was once heard as "give a"; the formulary refuses to guess. Rehearse drug lines with real voices.
5. Silent turns do not trigger Agora's `failure_message`.
6. **Wake word choice.** Candidates said to Agora ARES: "ARNIE", "Orion" and "Operon" were transcribed exactly; "SerJon" became "Sir John" (one sound from "surgeon"), "Sentry" became "Century", "Bantay" became "Banteay"/"Bante". The agent is **ARNIE** (whole word only, so "vegetable"/"vegan" never wake it). Re-check with your team's real voices before demo day.

## Known limits

- The agent listens to the **room mic only** (`remote_rtc_uids` supports one UID).
- Quick-tunnel URLs change on restart: update `PUBLIC_URL` and restart the engine.
- Watch Agora minutes; press Stop on `/room` when not rehearsing.
