// Sound-alike cleanup for what speech recognition hears, before the rules read a command.
// Found in live rehearsal: "ARNIE, go to the knee" came through as "ARNIE, got to the name", and "CT"
// as "city". Each fix is either a word that never means anything else in this room ("city", "colonel")
// or is only applied inside the phrase it belongs to ("go to the name" -> "go to the knee"), so
// "what's the patient's name" is left alone. Case is kept, so implant names like "PTFE" survive.

type Fix = [RegExp, string];

const NAV = String.raw`(?:go to|jump to|take me to|show me|show|bring up|pull up)`;
/** "go to the <one of these>" becomes "go to the <landmark>". */
const nav = (sounds: string, landmark: string): Fix => [
  new RegExp(String.raw`\b${NAV}\s+(?:the\s+)?(?:${sounds})\b(?!\s+(?:of|is|for))`, "gi"),
  `go to the ${landmark}`,
];

const FIXES: Fix[] = [
  // "go to"
  [/\b(?:got|gotta|goat|gets?)\s+(?:to|too|two)\b/gi, "go to"],
  [/\bgo\s+(?:too|two)\b/gi, "go to"],
  [/\bgoto\b/gi, "go to"],

  // CT and scans
  [/\b(?:city|cities|citi|c\.\s?t\.?|see tea|see tee|c t|cti)(?=\W|$)/gi, "CT"],
  [/\b(?:cat|kat|cad)\s+scan\b/gi, "CT scan"],
  [/\bthe scam\b/gi, "the scan"],

  // landmarks, only right after a navigation verb
  nav("name|names|need|needs|nee|neat|knees|neil|kneel", "knee"),
  nav("cough|calve|calves|kaf", "calf"),
  nav("uncle|anchor|angle|ankles", "ankle"),
  nav("tie|thai|thy|thighs", "thigh"),
  nav("food|foods|feet", "foot"),
  nav("lemur|fema|femmer|feemer", "femur"),

  // views and windows
  [/\b(?:colonel|kernel|corona|coronel|chronal|cornell)\b/gi, "coronal"],
  [/\b(?:sagital|saggital|sagittle|satchel|sad little|sagittarius)\s+view\b/gi, "sagittal view"],
  [/\b(?:axle|axel|axe|action|access)\s+view\b/gi, "axial view"],
  [/\b(?:phone|bowl|bon|bones|borne|born)\s+(?:window|windows|widow|wind oh)\b/gi, "bone window"],
  [/\bbone\s+(?:windows|widow|wind oh)\b/gi, "bone window"],
  [/\bsoft\s+(?:issue|tissues|tishoo)\b/gi, "soft tissue"],

  // moving around the scan
  [/\b(?:zone|soon|zoo|zoomed|zoom and)\s+in\b/gi, "zoom in"],
  [/\b(?:zone|soon|zoo|zoomed)\s+out\b/gi, "zoom out"],
  [/\b(?:pen|pin|pam|ban)\s+(left|right|up|down)\b/gi, "pan $1"],
  [/\bnext\s+(?:slides?|lice|slight)\b/gi, "next slice"],
  [/\b(?:previous|last)\s+(?:slides?|lice|slight)\b/gi, "previous slice"],
  [/\b(?:slides?|lice)\s+(\d+)\b/gi, "slice $1"],
  [/\b(?:stop|stopped)\s+(?:there|here)\b/gi, "stop"],
];

/** Sound-alikes fixed. Only used for parsing commands; the board still shows what was heard,
 *  and answers to ARNIE's questions ("Confirmed") are never rewritten. */
export function normalizeHeard(text: string): string {
  let t = ` ${text} `;
  for (const [re, to] of FIXES) t = t.replace(re, to);
  return t.replace(/\s+/g, " ").trim();
}
