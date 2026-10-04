---
name: Operon
description: Apple night for the operating room. Black ground, graphite tiles, one living orb; only danger has color.
colors:
  background: "#000000"
  foreground: "#f5f5f7"
  tile: "#1c1c1e"
  tile-raised: "#2c2c2e"
  label-2: "#a1a1a6"
  label-3: "#8e8e93"
  hairline: "rgba(255, 255, 255, 0.09)"
  critical: "#ff453a"
  critical-soft: "rgba(255, 69, 58, 0.16)"
  amber: "#ffd60a"
  teal: "#30d158"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "44px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: "\"ss01\", \"cv11\""
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  alert:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.375
    letterSpacing: "-0.01em"
  body-large:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1.625
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.5
  callout:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  footnote:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.375
rounded:
  tile: "28px"
  group: "22px"
  base: "14px"
  capsule: "9999px"
spacing:
  bar-inset: "6px"
  row-y: "12px"
  row-x: "16px"
  gutter: "16px"
  tile: "24px"
  bar-offset: "24px"
  group: "32px"
components:
  tile:
    backgroundColor: "{colors.tile}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.tile}"
    padding: "{spacing.tile}"
  tile-alert-critical:
    backgroundColor: "{colors.critical}"
    textColor: "#ffffff"
    typography: "{typography.alert}"
    rounded: "{rounded.tile}"
    padding: "{spacing.tile}"
  tile-alert-warning:
    backgroundColor: "{colors.amber}"
    textColor: "#000000"
    typography: "{typography.alert}"
    rounded: "{rounded.tile}"
    padding: "{spacing.tile}"
  control-bar:
    backgroundColor: "{colors.tile}"
    rounded: "{rounded.capsule}"
    padding: "{spacing.bar-inset}"
  capsule:
    textColor: "{colors.foreground}"
    typography: "{typography.callout}"
    rounded: "{rounded.capsule}"
    padding: "0 16px"
    height: "44px"
  capsule-primary:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
    rounded: "{rounded.capsule}"
    padding: "0 24px"
    height: "44px"
  capsule-stop:
    textColor: "{colors.critical}"
    rounded: "{rounded.capsule}"
    padding: "0 16px"
    height: "44px"
  capsule-stop-hover:
    backgroundColor: "{colors.critical-soft}"
  grouped-list:
    backgroundColor: "{colors.tile}"
    rounded: "{rounded.group}"
  grouped-row:
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    padding: "12px 16px"
  input-capsule:
    backgroundColor: "{colors.tile-raised}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.capsule}"
    padding: "6px 6px 6px 20px"
---

# Design System: Operon

## Overview

**Creative North Star: "Apple Night, One Living Thing"**

Operon is set in iOS/visionOS dark: a true black ground, raised graphite tiles with large continuous corners and a hairline of top light, a quiet SF-like grotesk, and white plus three greys for every word. Nothing decorates. The only thing that moves on its own is ARNIE's dotted thought-orb, which carries the assistant's state (listening, thinking, speaking, paused, warning, alert) so the screen shows presence rather than a transcript.

Density is set for distance. The wall board is a structured page read in a second from across a dim operating room (header, chart strip, alert banner, focus panel beside conversation and case log); the room laptop is one centred orb with a large state word and one or two calm lines under it, with all controls gathered into a floating capsule bar. Type follows the Apple text-style ladder (44 / 34 / 28 / 24 / 20 / 17 / 15 / 13) at semibold for headings and regular for reading, with tight negative tracking on the large sizes.

Color means something or it is absent. System red is critical, system yellow is warning (IEC 60601-1-8 convention), system green is only "listening / confirmed / connected". When an alert fires, the color does not appear as a badge: the whole alert tile fills with it, rising from the bottom once.

**Key Characteristics:**
- True black ground (#000) with graphite tiles (#1c1c1e) at 28px corners and a 6% white top hairline.
- White and three greys for all text; no brand accent hue.
- Color is semantic only: red critical, yellow warning, green listening.
- One living element: the thinking-orbs dotted orb, monochrome unless tinted by an alert.
- Apple text-style ladder in Geist, semibold headings with negative tracking, tabular figures for every time and count.
- Controls live in a single floating capsule bar, bottom centre.

## Colors

A neutral night palette where the only saturated colors are the three system signals.

### Primary
- **Night White** (foreground): every primary word, and the fill of the one primary capsule per bar (black label on white). There is no other action color.

### Secondary
Signal colors. Each carries one meaning and is never used for decoration.
- **System Red** (critical): critical alerts fill the alert tile; critical lines, the state word "Alert", the Stop capsule label, allergy dots in the chart, count mismatches, tourniquet over two hours. Tints the orb.
- **Critical Wash** (critical-soft): hover fill behind the Stop capsule and the background of inline error banners.
- **System Yellow** (amber): warnings fill the alert tile with black text; warning lines, blocked checklist items, tourniquet over one hour, reconnecting dot. Tints the orb.
- **System Green** (teal): only the small listening/connected dot and the "ARNIE can hear the room" check. Never a fill, never a heading. (The token is named `teal` in code; its value is system green.)

### Neutral
- **True Black** (background): page ground on every redesigned surface, and the CT focus tile's backing.
- **Graphite** (tile): tiles, grouped lists, the control bar, small header capsules.
- **Raised Graphite** (tile-raised): one step up from a tile, for an element floating above the bar (the type-to-rehearse input).
- **Secondary Grey** (label-2): supporting text, captions, field labels, quiet state words (Paused, Off). About 6.6:1 on a tile.
- **Tertiary Grey** (label-3): the faintest mark: placeholders, unstarted checklist items, timestamps, the last-heard quote. About 5.1:1 on a tile (raised from #6e6e73 after the finish review), so small hints stay legible.
- **Hairline** (hairline): borders; row dividers inside tiles run at 8% white, header separators at 15% white.

### Named Rules
**The Only Danger Has Color Rule.** Red, yellow and green each mean exactly one thing. If a color is not signalling critical, warning or listening, it is white or grey.

**The Fill, Not Badge Rule.** Severity takes over a whole tile (full critical or amber fill) rather than appearing as a pill, chip or colored border. Icon plus word always accompany the color, so color is never the only signal.

## Typography

**Display Font:** Geist (self-hosted via next/font, with ui-sans-serif, system-ui fallback)
**Body Font:** Geist
**Label/Mono Font:** Geist Mono is loaded but not used on Room or Board; numbers use Geist with tabular figures.

**Character:** Geist stands in for SF Pro, which cannot be served on the web: a quiet, neutral grotesk with true tabular figures, with stylistic sets `ss01` and `cv11` on globally.

### Hierarchy
- **Display** (600, 44px, line-height 1, -0.03em): the Room's state word under the orb, the Board's "Ready" and a specialist's name during a call.
- **Headline** (600, 34px, 1.25, -0.02em): patient name, focus-tile titles (checklist, Case log, Case summary), the board clock, form page titles.
- **Title** (600, 28px, 1.25, -0.02em): ARNIE's state word on the board, operation duration. "All clear" sits one step down at 22px.
- **Alert** (600, 24px, 1.375, -0.01em): the message inside a filled alert tile; checklist items at 24px regular.
- **Body Large** (400, 20px, 1.625): ARNIE's last line (Room 20px, Board 19px), log entries, consult briefing (22px), capped at about 36rem.
- **Body** (400, 17px, 1.5): input values, chart values, case summary lines, subtitles.
- **Callout** (400, 15px): captions and field labels in Secondary Grey; capsule labels at weight 500.
- **Footnote** (400, 13px): hints, step count, last-heard quote, tone toggle.

### Named Rules
**The Tabular Time Rule.** Every clock, duration, timestamp and count uses tabular figures so numbers do not jitter as they tick.

**The Sentence Case Rule.** Headings, labels and states are sentence case at their natural tracking. ARNIE is the only word written in capitals, because it is the name.

## Layout

The Board is a full-viewport page: 20px gaps and 16px page padding (24px from `sm`). A header carries the logo, the patient's name with the room and procedure beneath it, ARNIE's status as a dot and one word (no orb on the board; the orb lives on the Room screen), a quiet tone toggle and the 34px clock; there is no phase stepper (the demo skips the checklists; a checklist shows in the focus panel when started) and no connection dot ("Reconnecting…" appears only when the link drops). Under it a chart strip of capsule chips (allergies with a red dot, ordered medications), then a full-width alert banner only while something is wrong (red or yellow fill, rising in once). The main area at `lg` locks to the viewport height with no page scroll: the focus panel (2fr) beside a right column (1fr) holding Conversation (last three lines) and the Case log (newest first, older entries fade out at the tile edge). The focus panel shows the CT, the specialist call, a checklist, the case summary, or the surgery panel (four cells: Operation, Tourniquet, Counts, Implants, divided by hairlines). Below `lg` everything stacks in one scrolling column.

The Focus tile is the one place content changes in a case: Ready, then a checklist, the case log, a specialist call, the CT (which drops to 12px padding on black) or the end-of-case summary, each entering with a short blur-in.

The Room is centred and single-column: the orb in the middle of the viewport (280px live, 220px at mic check) with the state word 32px below it and ARNIE's line below that, and generous bottom padding (128 to 144px) so nothing sits under the control bar. Setup is a 42rem-wide grouped form with 32px between groups. The control bar floats 24px above the bottom edge, centred.

## Elevation & Depth

The system is tonal: depth comes from stepping graphite up off true black, not from heavy shadows. Tiles carry a one-pixel inner top highlight and a tight contact shadow, which reads as a lit edge rather than a lift. Only the floating control bar gets a real drop shadow, because it actually floats above content.

### Shadow Vocabulary
- **Tile edge** (`box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.6)`): every tile and grouped list.
- **Floating bar** (`box-shadow: 0 12px 32px rgba(0,0,0,0.7)` plus a 1px ring of 8% white): the capsule control bar and the floating rehearsal input (ring only).

### Named Rules
**The Lit Edge Rule.** A surface reads as raised through its tone and its 6% top highlight, not through a larger shadow. Only the floating bar casts one.

## Shapes

Large continuous corners. Board tiles are 28px; grouped form lists are a slightly tighter 22px; every control is a full capsule. Status marks are small circles (8px dots), and checklist ticks are 32px circles with a 2px stroke that fill white when done. The alert fill's clip-path keeps the same 28px rounding while it rises. No sharp corners and no visible borders around tiles: separation is tone and gutter.

## Components

### Buttons (Capsules)
Quiet capsules that light up on hover.
- **Shape:** full capsule, 44px tall (36px when nested inside an input).
- **Default:** transparent with white 15px/500 label and an optional 16px stroke icon; hover adds an 8% white wash.
- **Primary:** white fill, black label, 24px side padding. One per bar: Continue, Turn on microphone, Start ARNIE, or Resume when paused.
- **Stop:** System Red label; hover fills Critical Wash.
- **Disabled:** 40% opacity.
- **Shortcut key:** an inline `M` keycap on a white 8% chip, 12px Secondary Grey.

### Control Bar (signature)
A single floating Graphite capsule fixed 24px above the bottom, centred, holding all the Room's controls at 6px inner padding with 4px between capsules. It carries the floating-bar shadow and an 8% white ring, and scrolls horizontally rather than wrapping on narrow screens. On small screens labels collapse to icons for screen readers only.

### Cards / Containers (Tiles)
- **Corner Style:** 28px.
- **Background:** Graphite on true black.
- **Shadow Strategy:** tile edge (see Elevation & Depth).
- **Border:** none; internal rows are divided by 8% white hairlines.
- **Internal Padding:** 24px.

### Alert Tile (signature)
Calm by default: "All clear" with a grey check and a one-line count of mistakes caught. On a warning or critical alert the whole tile fills System Yellow (black text) or System Red (white text), rising from the bottom over 520ms with an expo-out curve, with a 17px semibold icon-plus-word line ("Critical" / "Warning") above the 24px message. The fill holds for 15 seconds after ARNIE's line.

### Inputs / Fields (Grouped list)
- **Style:** iOS inset-grouped. A Graphite list at 22px corners, rows divided by 8% white hairlines, 12px by 16px row padding, label in 15px Secondary Grey (180px column from `sm`) and a borderless 17px white value with a white caret. A 13px Secondary Grey group title sits above each list; 13px Tertiary Grey hints sit below.
- **Focus:** the row takes a 3% white wash; global keyboard focus is a 2px 70% white outline at 3px offset.
- **Error:** an inline banner in Critical Wash with System Red 15px text, rounded, centred above the content.
- **Capsule input:** the rehearsal field floats as a Raised Graphite capsule with an 8% ring and a nested primary Send capsule.

### Navigation
There is no nav bar. Each surface has a slim header: the Operon logo at 24px on the left, then context on the right (Room: a status dot plus "OR · patient" in 15px Secondary Grey, or "Step n of 3 · label" in 13px Tertiary Grey during setup; Board: tone toggle capsule, connection dot and the 34px clock).

### ARNIE Orb (signature)
The thinking-orbs dotted canvas orb, drawn in its 300px design space at 176px (Board), 220px (mic check) or 280px (Room live). Each mood maps to an orb animation and a word: Off breathes at quarter speed and 35% opacity; Listening listens; Thinking works; Speaking composes; Warning and Alert solve, tinted System Yellow or System Red. At mic check its speed follows the microphone level. Opacity changes ease over 700ms; under reduced motion it draws a single still frame.

## Do's and Don'ts

### Do:
- **Do** put every redesigned surface on true black (#000000) with Graphite (#1c1c1e) tiles at 28px corners and the tile-edge highlight.
- **Do** keep all text white or grey, and reach for System Red, System Yellow or System Green only when the content is critical, a warning, or listening/confirmed.
- **Do** signal severity by filling the tile and pairing the color with an icon and a word.
- **Do** use the Apple text-style ladder (44 / 34 / 28 / 24 / 20 / 17 / 15 / 13) with semibold headings, negative tracking at 28px and up, and tabular figures for every number that changes.
- **Do** gather controls into the floating capsule bar with at most one white primary capsule.
- **Do** let the orb be the only thing that moves on its own; entrances are one-shot (520ms alert rise, 420ms focus blur-in) and stop under reduced motion.

### Don't:
- **Don't** add a brand accent hue, gradients, or colored borders around tiles.
- **Don't** show severity as a small pill or badge when it can take over its tile.
- **Don't** put small uppercase, letter-spaced kickers or eyebrows above headings; the Room and Board use sentence-case headings with no kicker.
- **Don't** use System Green as a fill, a heading color or a decoration; it is a dot or a check.
- **Don't** set information the team needs in Tertiary Grey (#8e8e93); it is the quietest grey (about 5.1:1 on a tile); keep it for captions, timestamps and hints, never for what the team must act on.
- **Don't** stream a transcript or log onto the Room; it shows the state word and ARNIE's last line only.
