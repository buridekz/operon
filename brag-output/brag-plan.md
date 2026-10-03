# SterileVoice: brag plan

**What it is:** A voice copilot for the operating room that runs the WHO Surgical Safety Checklist by voice, reads back every critical event, guards against recorded allergies, and patches in a specialist, so the team never touches a screen.
**Who it's for:** Operating-room teams; bought by hospital patient-safety offices. The video's first audience is our own team.
**What sets it apart:** It refuses to complete a time-out with a skipped item, nothing is logged without a spoken read-back, and "Call vascular" brings in a specialist who is briefed by the AI from the confirmed log.
**Visual hook:** "Her hands are inside a patient. Every screen in the room is out of reach."
**Real UI shown:** OR wall board (transcript, time-out checklist, tourniquet timer, case log), the specialist's call card, and the operative record, all rendered from `sv.js`.
**Tone:** `polished`, clinical, calm and precise.
**Share caption:** see `share-copy.txt`.

## Storyboard (26.6 s, 30 fps, 1920×1080)

| # | Time | Scene | On screen | Sound |
|---|---|---|---|---|
| 1 | 0.0–3.4 | Hook | "Her hands are inside a patient." / "Every screen in the room is out of reach." | Sparse piano over Am |
| 2 | 3.4–5.4 | Reveal | SterileVoice wordmark, "A voice copilot for the operating room." | Lift to F |
| 3 | 5.6–11.4 | Time-out | Surgeon tries to skip site marking; checklist goes **Blocked**; confirmed; **Complete**. Headline: "It won't let anyone skip a step." | Monitor beep + heartbeat; descending alert; rising chime on complete |
| 4 | 11.4–16.4 | During surgery | Tourniquet read-back → "Confirmed" → logged, timer starts; "Give ampicillin" → penicillin allergy caution | Confirm chime; descending allergy tone |
| 5 | 16.4–21.4 | Specialist patch-in | "Call vascular." Dr. Valdez's card rings, connects, AI briefing appears | Ring bursts, connect chime |
| 6 | 21.4–23.8 | Record | Operative record draft, ready for sign-off | Soft chime |
| 7 | 23.8–26.6 | Outro | "No gloves off. No screens touched." SterileVoice. "Hands stay sterile. Eyes stay on the patient." | F → C resolve, fade |

Runs 1.6 s over the usual 25 s cap so the full five-step flow fits; every line holds long enough to read.

## Clinical choices
- Allergy demo uses **ampicillin vs. penicillin allergy** (unambiguous), not cefazolin.
- The AI never doses or advises; alerts come only from data confirmed at sign-in.
