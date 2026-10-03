# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **The surgical team, mid-operation.** Surgeon, scrub nurse, circulating nurse, anesthesia. Gloved and sterile: they cannot touch a screen. They talk to the team, glance at a wall screen, and occasionally address the assistant by name.
- **Hackathon judges** (Agora Voice First track) watching the wall board and the room laptop during a live, few-minute demo.

## Product Purpose

Operon is a voice safety assistant for the operating room. Its voice agent, **ARNIE** (Always Ready Nurse, In Emergencies), listens to the room, speaks up only when what it hears conflicts with the patient's chart (an allergy, a dose that differs from the order), answers questions from the case record, reads back and logs confirmed events, drives a CT viewer by voice, calls a specialist and briefs them, and gives an end-of-case summary with start, end and duration. Success: the team never touches a screen, and mistakes are caught out loud before they happen.

## Positioning

An ambient, voice-only safety layer: it overhears normal team talk instead of waiting for commands, and every safety-critical decision is deterministic (rules against the chart), with the AI limited to understanding speech and wording answers. It assists, it never decides: no dosing, no diagnosis.

## Operating Context

- **Room device** (laptop in the OR): the microphone and ARNIE's voice. Set up the case before scrubbing, then left alone. Needs to read as "the assistant is here and listening" from across the room.
- **Wall board** (big screen): what the team glances at mid-surgery: case, alerts, the CT, the operation clock, the conversation.
- **Specialist phone**: rings on a consult, hears the briefing, joins the call.
- **Operative record**: drafted from confirmed events, signed after surgery.
- Lighting: dim operating room; screens are viewed at a distance, briefly, while hands are busy.
- Demo flow: briefing after scrubbing in, start of operation and CT, mid-surgery warnings (penicillin allergy, wrong dose), then one of two endings (smooth case, or a complication with a specialist called) and a spoken summary.

## Capabilities and Constraints

- Next.js 16 + React 19 + Tailwind 4 + shadcn (base-nova); engine in Node/TypeScript; voice via Agora Conversational AI.
- ARNIE states the UI must show: listening, thinking/answering, speaking, warning, critical, paused, off.
- Alert severity follows IEC 60601-1-8 conventions: red critical, yellow warning; informational stays calm.
- The CT is a real, de-identified sample study (TCIA, CC BY 3.0) and must stay labelled as a sample study with credit.
- Assistant orb: `thinking-orbs` (MIT, monochrome dotted canvas orbs) chosen by the user.

## Brand Commitments

- Product name **Operon**; agent name **ARNIE**, written in capitals, meaning "Always Ready Nurse, In Emergencies".
- Dark palette is required (operating-room appropriate). The user asked for an Apple-like design language.
- ARNIE's voice: calm, brief, like a good scrub nurse.

## Evidence on Hand

- Live system: https://operon-vega.vercel.app (room, board, specialist, record) and the Render engine.
- No testimonials, customers or clinical validation exist; never imply them.

## Product Principles

1. Glanceable over readable: the board is read in a second from across a room.
2. Quiet until it matters: calm by default, unmistakable when something is wrong.
3. The assistant is a presence, not a transcript: show state, not chatter.
4. Honest about limits: sample data is labelled; ARNIE assists, it doesn't decide.

## Accessibility & Inclusion

Readable at distance (large type, high contrast on dark), color never the only signal for severity, reduced-motion respected.
