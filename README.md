# Operon

A voice safety assistant for the operating room, built for the Agora Voice First track. Its voice agent is **ARNIE** (Always Ready Nurse, In Emergencies): the team says "ARNIE, brief me."

1. **Case setup** (screen, before scrubbing): patient, procedure, site, allergies.
2. **Voice-led WHO checklist**: sign-in, time-out, sign-out. A skipped item blocks completion.
3. **Read-back event log**: "Tourniquet on, left thigh" → "Tourniquet, left thigh, 14:22. Confirm?" → "Confirmed." Nothing is logged without confirmation.
4. **Listens for conflicts with the chart** (no wake word): "Giving ampicillin, one gram" → "Caution: penicillin allergy recorded at sign-in." A stated dose that differs from the ordered dose is flagged too. A lookup, never dosing or advice.
5. **Timers**: tourniquet alerts at 60 minutes and set intervals.
6. **Specialist patch-in**: "Call vascular" joins a specialist to the Agora channel; the AI briefs them from the confirmed log, then they talk live.
7. **Auto-drafted operative record** from confirmed events, for surgeon sign-off.
8. **Case record on request**: "ARNIE, what are the allergies?", "what's the dose of cefazolin?", "how many sponges are on the field?"
9. **CT by voice**: "ARNIE, show the CT", "go to the knee", "bone window", "coronal view", "play through the scan", "stop", "zoom in".

## Live

- **Web app (Vercel):** https://operon-vega.vercel.app (`/room`, `/board`, `/specialist`, `/record`)
- **Engine (Render, Singapore):** https://operon-engine.onrender.com (Agora calls its `/chat/completions`)
- Free tier: the engine sleeps when idle and takes about a minute to wake. Open the board a few minutes before a demo.
- Merges to `main` redeploy both automatically: the engine on Render (root `engine/`) and the web app on Vercel (root `web/`).

## The real build

- **`engine/`**: Node + TypeScript. The brain (deterministic state machine) exposed as Agora's custom LLM endpoint, with an optional OpenAI intent fallback, timers, specialist patch-in and a live SSE feed. 26 tests. See `engine/README.md`.
- **`web/`**: Next.js 16 + TypeScript + Tailwind + shadcn/ui. The `/room`, `/board` and `/specialist` screens. See `web/README.md`.

Tested live end to end through Agora (synthesized speech → room mic → Agora ARES → engine → spoken reply).

## CT sample study and credit

The board's CT is a real, de-identified CT of the legs used as a **sample study**; it is not an Operon patient's scan, and the viewer labels it so.

- Source: The Cancer Imaging Archive (TCIA), Soft-tissue-Sarcoma collection, patient STS_006, series "CT IMAGES - LEGS - RESEARCH".
- Data citation: Vallières, M., Freeman, C. R., Skamene, S. R., & El Naqa, I. (2015). A radiomics model from joint FDG-PET and MRI texture features for the prediction of lung metastases in soft-tissue sarcomas of the extremities (Version 1) [Dataset]. The Cancer Imaging Archive. https://doi.org/10.7937/K9/TCIA.2015.7GO2GSKS
- TCIA: Clark K, et al. The Cancer Imaging Archive (TCIA): Maintaining and Operating a Public Information Repository. J Digit Imaging 26(6):1045-1057, 2013.
- License: Creative Commons Attribution 3.0 (https://creativecommons.org/licenses/by/3.0/). Changes: resampled to 2 mm pixels, cropped to the body, and packed to 8 bits per voxel by `scripts/build-ct.py`.

## Pitch materials

The files below are the **concept prototype** and pitch video (simulated conversation, made before the real build).

- `PRD.md`: the product requirements document (final hackathon scope).
- `index.html`: open in a browser and press **Play a sample case**.
- `sv.js`: wall board, checklist, call card and record (each a pure function of time).
- `app.css`: shared styles.
- `brag-output/brag.mp4`: the 26.6-second pitch video; `brag.jpg` poster, `share-copy.txt` caption, `brag-plan.md` storyboard.
- `brag-output/work/`: how the video was made. To re-render, inside `work/`:

```
python music.py
node render.mjs frames
ffmpeg -y -framerate 30 -i frames/f_%05d.jpg -i music.wav -c:v libx264 -crf 18 -pix_fmt yuv420p -af "loudnorm=I=-16:TP=-1.5" -c:a aac -b:a 192k -movflags +faststart -shortest ../brag.mp4
```
