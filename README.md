# Operon

A voice safety assistant for the operating room, built for the Agora Voice First track. Its voice agent is **Vega**: the team says "Vega, start time out."

1. **Case setup** (screen, before scrubbing): patient, procedure, site, allergies.
2. **Voice-led WHO checklist**: sign-in, time-out, sign-out. A skipped item blocks completion.
3. **Read-back event log**: "Tourniquet on, left thigh" → "Tourniquet, left thigh, 14:22. Confirm?" → "Confirmed." Nothing is logged without confirmation.
4. **Allergy guard**: "Give ampicillin" → "Caution: penicillin allergy recorded at sign-in." A lookup, never dosing or advice.
5. **Timers**: tourniquet alerts at 60 minutes and set intervals.
6. **Specialist patch-in**: "Call vascular" joins a specialist to the Agora channel; the AI briefs them from the confirmed log, then they talk live.
7. **Auto-drafted operative record** from confirmed events, for surgeon sign-off.

## Live

- **Web app (Vercel):** https://operon-vega.vercel.app (`/room`, `/board`, `/specialist`, `/record`)
- **Engine (Render, Singapore):** https://operon-engine.onrender.com (Agora calls its `/chat/completions`)
- Free tier: the engine sleeps when idle and takes about a minute to wake. Open the board a few minutes before a demo.
- Merges to `main` redeploy both automatically: the engine on Render (root `engine/`) and the web app on Vercel (root `web/`).

## The real build

- **`engine/`**: Node + TypeScript. The brain (deterministic state machine) exposed as Agora's custom LLM endpoint, with an optional OpenAI intent fallback, timers, specialist patch-in and a live SSE feed. 26 tests. See `engine/README.md`.
- **`web/`**: Next.js 16 + TypeScript + Tailwind + shadcn/ui. The `/room`, `/board` and `/specialist` screens. See `web/README.md`.

Tested live end to end through Agora (synthesized speech → room mic → Agora ARES → engine → spoken reply).

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
