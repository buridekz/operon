# Operon: Product Requirements Document

**Track:** Agora Track: Voice First · AWS Innovation Cup Championship · October 3–4, 2026
**Domain:** Health (clinical workflow)
**Product:** Operon · **Voice agent:** ARNIE (wake word: "ARNIE, …")
**Version:** 3.1 (final hackathon scope + positioning)
**Category:** Voice safety assistant for the operating room
**Tagline:** No gloves off. No screens touched.

---

## 1. Summary

Operon is a **voice safety assistant for the operating room**. It runs the WHO Surgical Safety Checklist by voice, reads back every critical event before logging it, guards against allergies recorded at sign-in, keeps tourniquet timers, patches in a remote specialist on command, and drafts the operative record from confirmed events. The surgical team never has to touch a screen.

**One-liner:** Operon makes sure nothing in the operating room gets skipped, misheard or delayed, so the team stays safe and the nurse stays with the patient.

**What it is not:** It does not replace the circulating nurse or any team member, make medical decisions, calculate doses, or diagnose. Nursing care must be delivered by licensed nurses (Philippine Nursing Act, RA 9173) and hospitals must meet DOH staffing standards; Operon is a tool the team uses, like a monitor, not a member of staff.

---

## 2. Problem

**Problem statement:** In busy operating rooms, the surgical team's hands are sterile, so every log entry, lookup and phone call falls to one circulating nurse. Under pressure, safety checks get rushed, spoken orders get misheard, and the nurse's attention is pulled away from the patient.

1. **Safety steps get skipped under pressure.** The WHO Surgical Safety Checklist reduced complications and deaths in its landmark multi-country study (Haynes et al., NEJM 2009; Manila was a pilot site), yet time-out compliance in studies is often well below 100%. When the room is rushed, "skip it, let's start" happens. *(Verify exact figures before quoting.)*
2. **Spoken orders get misheard or never written down.** Times and orders called out in a noisy room are easy to mishear and easy to lose.
3. **The nurse's attention is split.** Sterile hands can't touch screens, so the circulating nurse becomes the human keyboard: logging, looking things up and making calls instead of watching the patient.
4. **Getting a specialist takes time.** Someone has to stop and call, and the specialist arrives without context.

**Context, not the headline:** nurse shortages in the Philippines stretch every team thinner, which increases the pressure above. *(Verify the current shortage figure before quoting.)* Operon does not solve the shortage by replacing staff; it reduces the load on the staff who are there.

---

## 2a. Positioning

> **For** surgical teams in busy Philippine hospitals,
> **who** can't touch screens during surgery and are under pressure to move fast,
> **Operon is** a voice safety assistant for the operating room
> **that** makes sure no safety step gets skipped, no spoken order gets misheard, and no specialist call wastes time.
> **Unlike** paper checklists and a nurse juggling a keyboard and a phone,
> **Operon** runs the WHO checklist by voice, reads back every critical event before logging it, and patches in specialists hands-free, so **the nurse can stay with the patient.**

**Message pillars (one per demo moment)**

| Pillar | Message | Demo proof |
|---|---|---|
| Never skip | "It won't let the team skip a safety step." | Blocked time-out |
| Never mishear | "Nothing is logged until it's read back and confirmed." | Tourniquet read-back, allergy catch |
| Never wait | "A specialist on the line, already briefed, in seconds." | "Call vascular" |

**Against the alternatives**

| Alternative | Why Operon is better |
|---|---|
| Paper or wall checklist | Can't stop anyone skipping; Operon can |
| The nurse typing and calling | Takes attention off the patient |
| Voice-Care (UK, voice checklist) | Checklist only; we add read-back logging, allergy guard, timers and AI-briefed specialist patch-in, on a phone and a speaker |

**Language**
- Use: safety, assist, confirm, read back, "gives the nurse their eyes back", "like a monitor for safety steps".
- Avoid: replace, reduce staff, autonomous, AI nurse, AI decides, "100% accurate".

**Line to memorize:** "Operon doesn't replace anyone in the room. It makes sure nothing gets skipped, misheard or delayed, so the team stays safe and the nurse stays with the patient."

---

## 2b. Pitch story

Use the emergency as the **setting** and safety under pressure as the **problem**; staffing is background.

> "It's 2 AM in a provincial hospital. A jeepney crash: three trauma patients, one operating room team, one circulating nurse.
> The surgeon's hands are inside a patient. Every screen in the room is out of reach.
> The nurse is logging times, calling the blood bank and watching the patient, all at once.
> And under that pressure, someone says the most dangerous words in surgery: 'Skip it, let's start.'
> ARNIE doesn't skip."

Then go straight into the live blocked time-out.

---

## 3. Goals and non-goals

**Goals**
- G1. Run the WHO checklist (sign-in, time-out, sign-out) entirely by voice, and block completion if any item is skipped.
- G2. Log critical events only after a spoken read-back and confirmation (closed-loop communication).
- G3. Catch orders that conflict with allergies recorded at sign-in.
- G4. Keep tourniquet timers and announce alerts out loud.
- G5. Connect a remote specialist by voice and brief them automatically from the confirmed log.
- G6. Produce a draft operative record with zero keystrokes, for the surgeon to sign.

**Non-goals (explicitly out of scope)**
- Drug dosing, dose calculation, or any clinical recommendation.
- Diagnosis or interpretation of imaging.
- Replacing any member of the surgical team.
- Live EHR integration (mocked for the hackathon).
- Storing audio recordings.

---

## 4. Users and buyer

| Role | How they use Operon |
|---|---|
| Surgeon | Gives commands, confirms read-backs, calls specialists, signs the record |
| Anesthesiologist | Answers checklist items addressed to anesthesia |
| Scrub / circulating nurse | Enters case setup before scrubbing; answers checklist items; freed from logging |
| Remote specialist | Receives the patch-in call and the AI briefing on their phone |
| **Buyer** | Hospital patient-safety office (owns checklist compliance and surgical-error prevention) / OR nursing service (B2B, per-OR subscription) |
| **Beneficiaries** | The patient (safer surgery) and the nurse (attention back on the patient) |

---

## 5. Track fit: the Subtraction Test

Remove voice and the product cannot be used: the people using it during surgery have sterile hands and eyes on the patient. Voice is not an add-on; it is the only interface available in the sterile field. The single screen step (case setup) happens before anyone scrubs.

---

## 6. User flow

```
CASE SETUP ─► SIGN IN ─► TIME OUT ─► DURING SURGERY ─► SIGN OUT ─► RECORD
 (screen)     (voice)     (voice)       (voice)          (voice)     (screen)
```

1. **Case setup (screen, before scrubbing).** Nurse enters patient, procedure, site, allergies, key pre-op values.
2. **Sign in (voice).** Agent addresses each item to a role; each answer is logged with time and role.
3. **Time out (voice).** Agent reads each item. **If an item is skipped, it announces "Time out not complete: <item> not confirmed" and will not proceed** until it is confirmed.
4. **During surgery (voice, wake phrase "ARNIE, …").**
   - Event logging with read-back: "Tourniquet on, left thigh" → "Tourniquet, left thigh, 14:22. Confirm?" → "Confirmed" → logged, timer starts.
   - Lookups of recorded data: "When was the antibiotic given?" → "Cefazolin at 14:02, 38 minutes ago."
   - Allergy guard: "Give ampicillin" → "Caution: penicillin allergy recorded at sign-in."
   - Timer alerts: "Tourniquet time: sixty minutes."
   - Specialist patch-in: "Call vascular" → specialist joins → agent briefs them from the confirmed log → live conversation → "End consult."
5. **Sign out (voice).** Counts, specimen labelling, tourniquet off, each confirmed.
6. **Record (screen, after surgery).** Draft operative record from confirmed events; surgeon reviews and signs.

---

## 7. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-1 | Case setup form: patient, procedure, site, allergies, pre-op values | Must |
| FR-2 | Voice-led sign-in, time-out and sign-out using scripted lines, each addressed to a role | Must |
| FR-3 | Time-out cannot complete while any item is unconfirmed; skipped items are announced | Must |
| FR-4 | Wake phrase required for commands; other OR speech is ignored | Must |
| FR-5 | Commands parsed into fixed fields (event, side/site, time); read back before logging | Must |
| FR-6 | Nothing is logged without an explicit spoken "Confirmed" | Must |
| FR-7 | Allergy guard: medication orders checked against recorded allergies (lookup table, e.g. penicillin class) | Must |
| FR-8 | Tourniquet timer with spoken alert at 60 minutes and configurable intervals; limit alerts interrupt | Must |
| FR-9 | Specialist patch-in: "Call <specialty>" sends a join link; agent briefs from the confirmed log; agent goes silent during the consult until "End consult" | Must |
| FR-10 | OR wall board: live transcript, checklist state, timers, case log | Must |
| FR-11 | Draft operative record from confirmed events only (template, no free-text generation) | Must |
| FR-12 | Read-back of recorded data on request (antibiotic time, pre-op values) | Should |
| FR-13 | Real phone (PSTN/SIP) dialing for the specialist | Could (post-hackathon) |
| FR-14 | Speaker verification of who confirmed | Could (roadmap) |

---

## 8. AI vs. deterministic (Technology & Automation Judgment)

| Component | Implementation | Why |
|---|---|---|
| Speech to text | AI (Agora ASR, English) | The only way to hear the room |
| Command understanding | AI, constrained to a fixed schema | Natural phrasing varies; output fields don't |
| Checklist order, skip-blocking | Deterministic state machine | Safety procedure must be repeatable |
| Read-back wording, alerts, checklist prompts | Scripted text via Agora `/speak` | Word-for-word, cannot be hallucinated |
| Allergy guard | Deterministic lookup table | Auditable; same input, same output |
| Timers | Deterministic | Must never drift or be "interpreted" |
| Specialist briefing | Template filled from confirmed log | Only states confirmed facts |
| Operative record | Template from confirmed events | No generated prose in a legal record |
| Medical decisions | **Humans only** | Out of scope by design |

---

## 9. Architecture

```
Room mic + speaker (one device)  ── Agora RTC channel ──►  Agora Conversational AI agent
                                                             ├─ ASR: ARES or Microsoft (English)
Specialist phone (web join link) ── same channel ──────►     ├─ LLM: custom endpoint (our server)
                                                             └─ TTS: clear English voice

Our server (Node/Express, public HTTPS)
  /chat/completions  OpenAI-compatible, SSE streaming: the checklist state machine
  wake-phrase filter · read-back + confirm · allergy guard · timers · briefing · record builder
  calls Agora /speak for scripted lines and urgent alerts (priority INTERRUPT)

OR wall board (Next.js): transcript (Agora RTM), checklist, timers, case log, record
```

**Agora specifics (verified in docs; test on day one):**
- Start agent: `POST https://api.agora.io/api/conversational-ai-agent/v2/projects/{appid}/join`.
- Custom LLM must be OpenAI Chat Completions-compatible with SSE streaming at a **public** URL (not localhost).
- `/speak` sends exact text (≤ 512 bytes) with priority `INTERRUPT | APPEND | IGNORE`.
- `remote_rtc_uids` supports **one** UID: the agent listens to the single room mic, not to the specialist.
- Live transcripts via `advanced_features.enable_rtm` for the wall board.
- 300 free minutes per account, then $0.10/min (check the console).

---

## 10. Non-functional requirements

| Area | Target (hackathon) |
|---|---|
| Hands-free | Zero screen touches by the sterile team from sign-in to sign-out |
| Safety | No event logged without confirmation; no generated clinical advice |
| Responsiveness | Read-back starts within ~1–2 s of the command in the demo room |
| Noise | Works with OR-style background noise (suction, monitor beeps) using Agora noise suppression |
| Privacy | No audio stored; only the confirmed log; aligned with the Data Privacy Act (RA 10173) |
| Reliability | Recorded backup demo video ready; wall board recovers if the agent reconnects |

We do not claim perfect speech accuracy. Safety comes from closed-loop read-back, not from assuming ASR is always right.

---

## 11. Demo script (4 minutes)

| Time | Beat |
|---|---|
| 0:00–0:30 | Hook: the 2 AM jeepney-crash story (§2b), ending on "Skip it, let's start. ARNIE doesn't skip." |
| 0:30–1:30 | Time-out by voice; a teammate skips site marking; **Operon blocks it**; confirmed; complete |
| 1:30–2:15 | Tourniquet read-back → confirmed → timer; "Give ampicillin" → penicillin allergy caution |
| 2:15–3:15 | "Call vascular": **a teammate's phone in the audience rings**; the AI briefs them; they talk live |
| 3:15–4:00 | Auto-drafted record; deployment and close: "A phone and a speaker per OR. Hands stay sterile, eyes stay on the patient." |

Backup: recorded clean run, switch within 10 seconds if live fails. Lead "surgeon" uses a headset or the dedicated room mic; bring a phone hotspot.

---

## 12. Judging criteria map

**Semi-finals**
- MVP & Technical (30%): working voice checklist, read-back, patch-in on Agora.
- Problem & Domain Fit (25%): real OR workflow (WHO checklist, tourniquet timing, consults).
- Technology & Automation Judgment (25%): table in §8.
- Innovation (15%): skip-blocking + read-back log + AI-briefed specialist patch-in in one system.
- Live Pitch (5%): blocked time-out and the ringing phone.

**Grand Finals**
- Impact (30%): surgical safety and nurse time in short-staffed hospitals.
- Deployment (25%): phone + speaker per OR; no EHR dependency to start; no audio stored.
- Scalability (20%): per-OR subscription; checklist content configurable per hospital.
- Innovation (15%), Presentation & Defense (10%): see Q&A below.

---

## 13. Anticipated judge questions

| Question | Answer |
|---|---|
| "Voice-Care already does this." | It proves the need. We add read-back logging, timers, an allergy guard and AI-briefed specialist patch-in, on low-cost hardware for Philippine hospitals. |
| "Isn't the nurse already the voice interface?" | Yes, and that's the cost: the nurse spends attention on logging and calls. We give the nurse their eyes back. |
| "So you're replacing nurses?" | No, and legally we can't: nursing care requires licensed nurses (RA 9173) and DOH staffing standards. Operon is a tool, like a heart monitor; it helps the team not skip, not mishear and not lose time. |
| "Surgeons aren't underserved by screens. Why this track?" | Hands-busy users are a direction the track names explicitly, and in the sterile field voice is the only interface. The real beneficiary is the patient on the table. |
| "What if it mishears?" | Nothing is logged without a spoken read-back and "Confirmed": standard closed-loop communication. |
| "Does the AI give medical advice?" | Never. Alerts come only from data the team confirmed; no dosing. |
| "Patient privacy?" | No audio stored, only the confirmed log; Data Privacy Act aligned. |
| "Who confirmed what?" | Prompts are addressed to roles; speaker verification is on the roadmap. |

---

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Custom LLM can't stay silent on non-wake-phrase speech | Test in hour one; fall back to responding only in expected states |
| Venue noise / Wi-Fi | Dedicated mic, noise suppression, two-carrier hotspot, backup video |
| Patch-in fails live | Specialist uses a pre-opened web link on the same channel; no PSTN in the critical path |
| Judge clinical scrutiny | Use unambiguous examples (ampicillin vs. penicillin allergy); never claim to replace staff |
| Free minutes run out | Each member's 300 minutes; watch the console |

---

## 15. Team plan

| Person | Owns |
|---|---|
| A | Agora: channel, agent `/join`, ASR/TTS, `/speak`, RTM transcripts, specialist join |
| B | Server: checklist state machine, wake phrase, read-back, allergy guard, timers, briefing, record |
| C | Wall board, case setup form, specialist join page, record view, deployment |
| D | Checklist script, pitch deck, demo rehearsal, video, submission form |

**First hour:** (1) agent talks in English with our server as its LLM; (2) one checklist line via `/speak`, read-back → "Confirmed" → logged; (3) a second device joins the channel (patch-in proof).
**Freeze features at hour 9;** rehearse at least five times.

---

## 16. Facts to verify before quoting

- Haynes et al. 2009 (NEJM) outcome figures and Manila's role as a pilot site
- Time-out compliance percentages from recent studies
- Philippine nurse shortage figure
- Voice-Care's NHS pilot details
- DOH operating-room nurse staffing standard (if quoted)

## 16a. Before the pitch (raises the odds)

- Get one real quote from a nurse or doctor: "Do time-outs get rushed when it's busy?"
- Name Voice-Care before a judge does.
- Rehearse the full demo at least five times on the real setup; keep the backup video one click away.

## 17. Submission checklist

Project name · overview · target market · pain point (with evidence) · solution · Agora integration · sustainability & growth · demo video link · GitHub repo · live URL.
