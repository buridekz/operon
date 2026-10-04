# Operon

A voice safety assistant for the operating room, built for the Agora Voice First track. Its voice agent is **ARNIE** (Always Ready Nurse, In Emergencies): the team says "ARNIE, brief me." ARNIE listens to the room, speaks up only when what it hears conflicts with the patient's chart, and keeps the team's hands off the screen.

## Features

- **Hands-free case briefing.** ARNIE summarizes the patient, procedure, allergies, ordered medications and pre-op values on request, so nobody has to open a chart.
- **Voice-logged events with read-back.** Milestones such as the start and end of the operation are read back with the time and logged only after a spoken confirmation. A wrong or misheard entry never reaches the record.
- **Allergy and dose safety net.** ARNIE overhears normal team talk, with no wake word, and checks any drug it hears against the recorded allergies and the ordered doses. It speaks up on a conflict and holds the entry. It checks against the chart and never suggests a dose.
- **CT viewer by voice.** A CT study opens on the wall board and is controlled entirely by voice: scroll slices, jump to anatomical landmarks, change windows and planes, zoom, pan and rotate.
- **Answers from the case record.** Questions about the patient, the chart and the running case are answered from the record. If something is not in the record, ARNIE says so.
- **Specialist patch-in.** ARNIE calls an on-call specialist onto the same Agora channel, briefs them from the chart and then steps back while the humans talk.
- **End-of-case summary.** The operation clock tracks start, end and duration, and ARNIE gives a spoken and on-screen summary of the case, including cautions raised and consults held.
- **Wall board and room console.** The room device runs ARNIE and shows its state; the big-screen board shows the case, alerts, CT, operation clock, conversation and case log at a glance.
- **Noise-resistant listening.** Agora AI noise suppression cleans the room microphone before speech recognition.

Also built, outside the main flow: a voice-led WHO checklist, instrument counts and implant records, and tourniquet timers.

**Principles:** quiet until it matters, deterministic safety decisions, and an assistant that assists and never decides. ARNIE does no dosing or diagnosis.

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
