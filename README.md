# 🩺 Operon

## 👋 Overview

> **No gloves off. No screens touched.** 🧤

**Operon is a voice safety assistant for the operating room. It catches mistakes out loud, before they happen.** 🎙️

When the surgical team's hands are sterile and the room is short-staffed, one circulating nurse ends up typing timestamps, fetching scans and double-checking every drug. Operon gives the team **ARNIE** (Always Ready Nurse, In Emergencies), a voice agent that listens to the room so the humans can stay with the patient:

- 🛡️ **Speaks up when it matters:** hear "giving penicillin" for a patient with a penicillin allergy, or a dose that differs from the order, and ARNIE says so out loud and holds the entry.
- 🗣️ **Does the screen work for you:** briefs the case, logs events after a spoken confirmation, opens and drives the CT scan, and calls a specialist into the room.
- 📊 **Closes the loop:** ends the case with a spoken summary of the timeline, cautions and consults.

Built on **Agora Conversational AI**, with every safety decision made by deterministic rules against the patient's chart. ARNIE assists and never decides: no dosing, no diagnosis.

## 😟 The problem

- 🧤 In surgery the hands are sterile, so every note, lookup and phone call falls to one circulating nurse.
- ⏱️ Busy teams rush safety checks, and a spoken order can be misheard.
- 🖥️ Fetching a scan or entering a timestamp means touching a keyboard, which pulls attention away from the patient.

**Operon fixes this with voice.** The team talks naturally, and ARNIE handles the screen, the log and the safety checks. 🎙️

## ✨ Key features

| Feature | What it does |
|---|---|
| 📋 **Hands-free briefing** | Ask for a brief and ARNIE reads out the patient, procedure, allergies, ordered medications and pre-op values. |
| 📝 **Voice-logged events** | Milestones like the start and end of the operation are read back with the time and logged only after a spoken "Confirmed". A misheard entry never reaches the record. |
| 🛡️ **Allergy and dose safety net** | ARNIE overhears normal team talk (no wake word needed) and checks any drug against the recorded allergies and ordered doses. On a conflict it speaks up and holds the entry. It never suggests a dose. |
| 🩻 **CT scan by voice** | A CT scan opens on the wall board and is controlled entirely by voice: scroll slices, jump to landmarks, change windows and planes, zoom, pan and rotate. |
| 💬 **Answers from the case record** | Ask about the patient or the running case and get an answer from the record. If it isn't in the notes, ARNIE says so. |
| 📞 **Specialist patch-in** | ARNIE calls an on-call specialist onto the same Agora channel, briefs them from the chart, then steps back while the humans talk. |
| 📊 **End-of-case summary** | The operation clock tracks start, end and duration, and ARNIE gives a spoken and on-screen summary, including cautions raised and consults held. |
| 🖥️ **Wall board and room console** | The room device runs ARNIE and shows its state. The big-screen board shows the case, alerts, CT scan, operation clock, conversation and case log at a glance. |
| 🔇 **Noise-resistant listening** | Agora AI noise suppression cleans the room microphone before speech recognition. |

Also built, outside the main flow: a voice-led WHO checklist, instrument counts and implant records, and tourniquet timers.

**Our principles:** 🤫 quiet until it matters, 🧱 deterministic safety decisions, and 🤝 an assistant that assists and never decides. ARNIE does no dosing and no diagnosis.

## 🎧 Why Agora Conversational AI is the core

Voice isn't a feature in Operon. It is the whole experience.

- 🎤 **Agora RTC** carries the room microphone, ARNIE's voice and the specialist's phone in one channel.
- 🔇 **Agora AI noise suppression** (AI denoiser extension) cleans the room audio.
- 🧠 **Agora Conversational AI Engine** handles speech recognition, turn detection and ARNIE's voice. Each heard line is sent to our own `/chat/completions` endpoint, so our safety rules always see the words first.
- 🙋 ARNIE is set not to be interrupted, so a safety warning is always heard in full.

## 🔗 Links

- 🌐 **Web app:** https://operon-vega.vercel.app (`/room`, `/board`, `/specialist`, `/record`)
- ⚙️ **Engine (Render, Singapore):** https://operon-engine.onrender.com (Agora calls its `/chat/completions`)
- 💻 **Repository:** https://github.com/buridekz/operon
- 😴 Heads-up: the engine is on a free tier and sleeps when idle. It takes about a minute to wake, so open the board a few minutes before a demo.
- 🔁 Merges to `main` redeploy both automatically: the engine on Render (root `engine/`) and the web app on Vercel (root `web/`).

## 🔧 How it works

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

## 📁 Repository

- **`engine/`**: Node + TypeScript. The brain (deterministic state machine) exposed as Agora's custom LLM endpoint, plus intent, conversation and summary models, timers, specialist patch-in and a live SSE feed. See `engine/README.md`.
- **`web/`**: Next.js 16 + TypeScript + Tailwind + shadcn/ui. The `/room`, `/board`, `/specialist` and `/record` screens. See `web/README.md`.
- **`scripts/build-ct.py`**: builds the CT scan sample volume served by the web app.
- **`PRD.md`, `PRODUCT.md`, `DESIGN.md`**: product scope, product context and design system.

## 🚀 Quick start

```bash
# engine (see engine/README.md for Agora and OpenAI keys and the public tunnel)
cd engine && cp .env.example .env && npm install && npm start

# web app
cd web && cp .env.example .env.local && npm install && npm run build && npm start
```

Open `http://localhost:3001/room`.

## 🩻 CT scan sample study and credit

The board's CT scan is a real, de-identified CT scan of the legs used as a **sample study**; it is not an Operon patient's scan, and the viewer labels it so.

- Source: The Cancer Imaging Archive (TCIA), Soft-tissue-Sarcoma collection, patient STS_006, series "CT IMAGES - LEGS - RESEARCH".
- Data citation: Vallières, M., Freeman, C. R., Skamene, S. R., & El Naqa, I. (2015). A radiomics model from joint FDG-PET and MRI texture features for the prediction of lung metastases in soft-tissue sarcomas of the extremities (Version 1) [Dataset]. The Cancer Imaging Archive. https://doi.org/10.7937/K9/TCIA.2015.7GO2GSKS
- TCIA: Clark K, et al. The Cancer Imaging Archive (TCIA): Maintaining and Operating a Public Information Repository. J Digit Imaging 26(6):1045-1057, 2013.
- License: Creative Commons Attribution 3.0 (https://creativecommons.org/licenses/by/3.0/). Changes: resampled to 2 mm pixels, cropped to the body, and packed to 8 bits per voxel by `scripts/build-ct.py`.
