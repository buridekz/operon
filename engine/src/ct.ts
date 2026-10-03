// Voice-driven CT viewer state. The study is a real, de-identified CT of the legs from a public
// research archive (The Cancer Imaging Archive, Soft-tissue-Sarcoma collection, CC BY 3.0), shown
// as a sample study: it is not this patient's scan. The board renders it; the engine only keeps
// where the team is looking, so every screen shows the same image.

/** Shape of the volume served to the board (web/public/ct/meta.json is generated with it). */
export const CT_STUDY = {
  label: "Sample CT · legs (TCIA, CC BY 3.0)",
  slices: 267, // axial, from the upper thighs (1) down to the feet; sizes from web/public/ct/meta.json
  rows: 176,   // front-to-back planes (coronal)
  cols: 223,   // left-to-right planes (sagittal)
  /** The side view opens through the left femur (the case's side), not the gap between the legs. */
  sagittalStart: 166,
  /** Axial slice for each landmark, read off the coronal view when the volume was built. No pelvis on this scan. */
  landmarks: { "upper thigh": 15, thigh: 40, knee: 108, calf: 140, ankle: 218, foot: 248 } as Record<string, number>,
};

export type CtView = "axial" | "coronal" | "sagittal";
export type CtWindow = "soft" | "bone" | "wide";
export type CtAction =
  | "show" | "hide" | "next" | "previous" | "goto" | "scroll_down" | "scroll_up"
  | "zoom_in" | "zoom_out" | "pan_left" | "pan_right" | "pan_up" | "pan_down" | "rotate" | "reset"
  | "window_soft" | "window_bone" | "window_wide" | "view_axial" | "view_coronal" | "view_sagittal"
  | "play" | "stop" | "landmark" | "none";

export type Imaging = {
  visible: boolean; study: string; view: CtView; slice: number; zoom: number; panX: number; panY: number;
  rotation: number; window: CtWindow; playing: { from: number; at: number } | null;
};

/** How fast "play through the scan" moves: one slice every PLAY_MS. */
export const PLAY_MS = 120;
const PAN = 0.15; // a fifth-ish of the view per "pan left"

export function newImaging(): Imaging {
  return { visible: false, study: CT_STUDY.label, view: "axial", slice: startSlice("axial"), zoom: 1, panX: 0, panY: 0, rotation: 0, window: "soft", playing: null };
}

export const sliceCount = (view: CtView) => (view === "axial" ? CT_STUDY.slices : view === "coronal" ? CT_STUDY.rows : CT_STUDY.cols) || 1;
const startSlice = (view: CtView) =>
  view === "axial" ? CT_STUDY.landmarks.thigh ?? Math.round(CT_STUDY.slices / 3)
    : view === "sagittal" ? CT_STUDY.sagittalStart : Math.round(sliceCount(view) / 2);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const VIEW_NAME: Record<CtView, string> = { axial: "Slice", coronal: "Coronal", sagittal: "Sagittal" };
const WINDOW_NAME: Record<CtWindow, string> = { soft: "Soft tissue window", bone: "Bone window", wide: "Wide window" };
const at = (img: Imaging) => `${VIEW_NAME[img.view]} ${img.slice} of ${sliceCount(img.view)}.`;

/** The slice on screen right now (moves while playing). */
export function currentSlice(img: Imaging, now: number): number {
  if (!img.playing) return img.slice;
  const n = sliceCount(img.view);
  return ((img.playing.from - 1 + Math.floor((now - img.playing.at) / PLAY_MS)) % n) + 1;
}

/** Freeze a playing scan where it is, so the next command starts from what everyone sees. */
function settle(img: Imaging, now: number) {
  if (img.playing) { img.slice = currentSlice(img, now); img.playing = null; }
}

/** Landmark names people say -> the landmark keys the volume was built with. */
const LANDMARK_WORDS: Record<string, string> = {
  hip: "hip", hips: "hip", pelvis: "hip", "femoral head": "hip",
  groin: "upper thigh", "upper thigh": "upper thigh", "femoral artery": "upper thigh", "top of the thigh": "upper thigh",
  thigh: "thigh", femur: "thigh", "mid thigh": "thigh", knee: "knee", knees: "knee", "kneecap": "knee", patella: "knee",
  calf: "calf", shin: "calf", "lower leg": "calf", tibia: "calf", ankle: "ankle", ankles: "ankle", foot: "foot", feet: "foot",
};
export const LANDMARK_RE = new RegExp(`\\b(${Object.keys(LANDMARK_WORDS).sort((a, b) => b.length - a.length).join("|")})\\b`);

/** Run one imaging command. `n` is a slice number (goto) or how many slices to scroll; `what` names a landmark. */
export function ctCommand(img: Imaging, action: CtAction, now: number, n = 0, what = ""): string {
  const total = () => sliceCount(img.view);
  switch (action) {
    case "show": img.visible = true; return "Showing the CT.";
    case "hide": settle(img, now); img.visible = false; return "Images closed.";
    case "next": case "previous": case "scroll_down": case "scroll_up": {
      settle(img, now); img.visible = true;
      const step = action === "next" || action === "previous" ? 1 : n > 0 ? Math.floor(n) : 10;
      img.slice = clamp(img.slice + (action === "next" || action === "scroll_down" ? step : -step), 1, total());
      return at(img);
    }
    case "goto": {
      settle(img, now); img.visible = true;
      if (!(n >= 1)) return `Which slice? 1 to ${total()}.`;
      if (n > total()) return `There are ${total()} slices in this view.`;
      img.slice = Math.floor(n);
      return at(img);
    }
    case "landmark": {
      const key = LANDMARK_WORDS[what.toLowerCase().trim()] ?? what.toLowerCase().trim();
      const slice = CT_STUDY.landmarks[key];
      if (!slice) return "I can't find that on this scan.";
      settle(img, now);
      Object.assign(img, { visible: true, view: "axial" as CtView, slice });
      return `${key[0].toUpperCase()}${key.slice(1)}, slice ${slice} of ${CT_STUDY.slices}.`;
    }
    case "zoom_in": img.visible = true; img.zoom = Math.min(4, img.zoom + 0.5); return `Zoom ${img.zoom} times.`;
    case "zoom_out": img.visible = true; img.zoom = Math.max(1, img.zoom - 0.5); if (img.zoom === 1) { img.panX = 0; img.panY = 0; } return `Zoom ${img.zoom} times.`;
    case "pan_left": case "pan_right": case "pan_up": case "pan_down": {
      img.visible = true;
      if (img.zoom === 1) img.zoom = 1.5; // nothing to pan across at full view
      const lim = (img.zoom - 1) / 2;
      // "pan left" shows more of what is on the left, so the image moves right.
      if (action === "pan_left") img.panX = clamp(img.panX + PAN, -lim, lim);
      if (action === "pan_right") img.panX = clamp(img.panX - PAN, -lim, lim);
      if (action === "pan_up") img.panY = clamp(img.panY + PAN, -lim, lim);
      if (action === "pan_down") img.panY = clamp(img.panY - PAN, -lim, lim);
      return `Panned ${action.slice(4)}.`;
    }
    case "rotate": img.visible = true; img.rotation = (img.rotation + 90) % 360; return `Rotated to ${img.rotation} degrees.`;
    case "reset": Object.assign(img, { visible: true, zoom: 1, panX: 0, panY: 0, rotation: 0, window: "soft" as CtWindow }); return "View reset.";
    case "window_soft": case "window_bone": case "window_wide":
      img.visible = true; img.window = action.slice(7) as CtWindow; return `${WINDOW_NAME[img.window]}.`;
    case "view_axial": case "view_coronal": case "view_sagittal": {
      settle(img, now);
      const view = action.slice(5) as CtView;
      // Coming back to axial keeps the level you were at; the long views open in the middle of the legs.
      Object.assign(img, { visible: true, view, slice: view === "axial" && img.view === "axial" ? img.slice : startSlice(view) });
      return `${view[0].toUpperCase()}${view.slice(1)} view.`;
    }
    case "play":
      img.visible = true;
      if (!img.playing) img.playing = { from: img.slice, at: now };
      return "Playing through the scan. Say stop when you're there.";
    case "stop":
      if (!img.playing) return img.visible ? at(img) : "Nothing is playing.";
      settle(img, now);
      return `Stopped. ${at(img)}`;
    default:
      return "Sorry, say that again.";
  }
}
