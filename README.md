# Operon

A voice safety assistant for the operating room, built for the Agora Voice First track. Its voice agent is **ARNIE** (Always Ready Nurse, In Emergencies): the team says "ARNIE, brief me." ARNIE listens to the room, speaks up only when what it hears conflicts with the patient's chart, and keeps the team's hands off the screen.

## What it does

1. **Case setup** (one screen, before scrubbing): patient, procedure, site, allergies, ordered medications, on-call specialists and patient notes.
2. **Briefing on request**: "ARNIE, brief me" reads the case, allergies and orders aloud.
3. **Read-back event log**: "Okay team, starting the operation" → "Operation start, incision, 08:52. Confirm?" → "Confirmed." Nothing is logged without a spoken confirmation.
4. **Overhears the team** (no wake word): "Giving penicillin" → "Caution: penicillin allergy recorded at sign-in. Penicillin not logged." A stated dose that differs from the ordered dose is flagged too. It checks what is said against the chart; it never suggests a dose.
5. **CT by voice**: "ARNIE, show the CT", "go to the knee", "bone window", "coronal view", "zoom in", "close the images".
6. **Answers from the case record**: "ARNIE, what are the allergies?", "is the patient diabetic?", "how long has the operation been going?"
7. **Specialist patch-in**: "ARNIE, call vascular" rings a specialist's phone into the Agora channel; ARNIE briefs them from the chart, then they talk live.
8. **End-of-case summary**: "Closing." → "Confirmed." → "ARNIE, give me the summary." (start, end, duration, cautions, consults).

Also built: a voice-led WHO checklist, counts and implants, and tourniquet timers (not part of the demo flow).

## How it works

```
Room mic ─► Agora RTC (AI noise suppression) ─► Agora Conversational AI Engine (ASR, TTS)
                                                        │ each heard line
                                                        ▼
                         engine: POST /chat/completions ─► rules (brain.ts) ─► reply or silence
                                           │ only when the rules cannot tell
                                           ▼
                                  OpenAI: intent classification, case-record answers,
                                  summary wording (never doses, never confirmations)
Live state ─► web app (Room, Board, Specialist phone) over server-sent events
```

Safety decisions are deterministic code checked against the chart. The language model only interprets speech and words answers.

## Live

- **Web app (Vercel):** https://operon-vega.vercel.app (`/room`, `/board`, `/specialist`, `/record`)
- **Engine (Render, Singapore):** https://operon-engine.onrender.com (Agora calls its `/chat/completions`)
- Free tier: the engine sleeps when idle and takes about a minute to wake. Open the board a few minutes before a demo.
- Merges to `main` redeploy both automatically: the engine on Render (root `engine/`) and the web app on Vercel (root `web/`).

## Repository

- **`engine/`**: Node + TypeScript. The brain (deterministic state machine) exposed as Agora's custom LLM endpoint, plus intent, conversation and summary models, timers, specialist patch-in and a live SSE feed. See `engine/README.md`.
- **`web/`**: Next.js 16 + TypeScript + Tailwind + shadcn/ui. The `/room`, `/board`, `/specialist` and `/record` screens. See `web/README.md`.
- **`scripts/build-ct.py`**: builds the CT sample volume served by the web app.
- **`PRD.md`, `PRODUCT.md`, `DESIGN.md`**: product scope, product context and design system.

## Quick start

```bash
# engine (see engine/README.md for Agora and OpenAI keys and the public tunnel)
cd engine && cp .env.example .env && npm install && npm start

# web app
cd web && cp .env.example .env.local && npm install && npm run build && npm start
```

Open `http://localhost:3001/room`.

## CT sample study and credit

The board's CT is a real, de-identified CT of the legs used as a **sample study**; it is not an Operon patient's scan, and the viewer labels it so.

- Source: The Cancer Imaging Archive (TCIA), Soft-tissue-Sarcoma collection, patient STS_006, series "CT IMAGES - LEGS - RESEARCH".
- Data citation: Vallières, M., Freeman, C. R., Skamene, S. R., & El Naqa, I. (2015). A radiomics model from joint FDG-PET and MRI texture features for the prediction of lung metastases in soft-tissue sarcomas of the extremities (Version 1) [Dataset]. The Cancer Imaging Archive. https://doi.org/10.7937/K9/TCIA.2015.7GO2GSKS
- TCIA: Clark K, et al. The Cancer Imaging Archive (TCIA): Maintaining and Operating a Public Information Repository. J Digit Imaging 26(6):1045-1057, 2013.
- License: Creative Commons Attribution 3.0 (https://creativecommons.org/licenses/by/3.0/). Changes: resampled to 2 mm pixels, cropped to the body, and packed to 8 bits per voxel by `scripts/build-ct.py`.
