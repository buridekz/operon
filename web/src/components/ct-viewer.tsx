"use client";

// CT viewer for the wall board, driven by voice through the engine. The study is a real,
// de-identified CT of the legs from The Cancer Imaging Archive (Soft-tissue-Sarcoma, CC BY 3.0),
// shown as a sample study: it is not this patient's scan, and the label says so.
// The volume (public/ct) is one byte per voxel, packed from Hounsfield units by scripts/build-ct.py,
// so it can be re-windowed here.
import { useEffect, useMemo, useRef, useState } from "react";
import type { EngineView } from "@/lib/engine";

type Imaging = NonNullable<EngineView["imaging"]>;
type Meta = {
  slices: number; rows: number; cols: number; spacing: { x: number; y: number; z: number };
  encoding: [number, number, number, number][]; source: string; doi: string;
};
type Volume = { meta: Meta; data: Uint8Array };

let loading: Promise<Volume> | null = null;
/** Fetch and unpack the volume once per page; call early so "show the CT" is instant. */
export function loadCt(): Promise<Volume> {
  loading ??= (async () => {
    const [meta, buf] = await Promise.all([
      fetch("/ct/meta.json").then((r) => r.json() as Promise<Meta>),
      fetch("/ct/volume.bin.gz").then((r) => r.arrayBuffer()),
    ]);
    let bytes = new Uint8Array(buf);
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) { // still gzipped (the server didn't decode it for us)
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    return { meta, data: bytes };
  })().catch((e) => { loading = null; throw e; });
  return loading;
}

const WINDOWS = { soft: { w: 400, l: 40, label: "Soft tissue" }, bone: { w: 1800, l: 400, label: "Bone" }, wide: { w: 2000, l: 0, label: "Wide" } };

/** byte -> grey for a window, through the HU packing in meta.encoding. */
function lut(meta: Meta, win: keyof typeof WINDOWS): Uint8ClampedArray {
  const { w, l } = WINDOWS[win];
  const out = new Uint8ClampedArray(256);
  for (let b = 0; b < 256; b++) {
    const seg = meta.encoding.find(([, , b0, b1]) => b >= b0 && b <= b1) ?? meta.encoding[meta.encoding.length - 1];
    const [h0, h1, b0, b1] = seg;
    const hu = h0 + ((b - b0) * (h1 - h0)) / (b1 - b0 || 1);
    out[b] = ((hu - (l - w / 2)) / w) * 255;
  }
  return out;
}

/** One plane of the volume as width x height bytes, plus its physical aspect ratio. */
function plane(v: Volume, view: Imaging["view"], index: number) {
  const { slices: S, rows: R, cols: C, spacing } = v.meta;
  const d = v.data;
  if (view === "axial") {
    const k = Math.min(S, Math.max(1, index)) - 1;
    return { w: C, h: R, aspect: (C * spacing.x) / (R * spacing.y), px: d.subarray(k * R * C, (k + 1) * R * C) };
  }
  const px = new Uint8Array((view === "coronal" ? C : R) * S);
  if (view === "coronal") { // a front view: fixed depth (row), patient's right on the left
    const r = Math.min(R, Math.max(1, index)) - 1;
    for (let s = 0; s < S; s++) px.set(d.subarray(s * R * C + r * C, s * R * C + r * C + C), s * C);
    return { w: C, h: S, aspect: (C * spacing.x) / (S * spacing.z), px };
  }
  const c = Math.min(C, Math.max(1, index)) - 1; // sagittal: fixed column, front on the left
  for (let s = 0; s < S; s++) for (let r = 0; r < R; r++) px[s * R + r] = d[s * R * C + r * C + c];
  return { w: R, h: S, aspect: (R * spacing.y) / (S * spacing.z), px };
}

const MARKERS = {
  axial: { left: "R", right: "L", top: "A", bottom: "P" },
  coronal: { left: "R", right: "L", top: "S", bottom: "I" },
  sagittal: { left: "A", right: "P", top: "S", bottom: "I" },
};
const VIEW_LABEL = { axial: "Axial", coronal: "Coronal", sagittal: "Sagittal" };

export function CtViewer({ imaging, className }: { imaging: Imaging; className?: string }) {
  const [vol, setVol] = useState<Volume | null>(null);
  const [failed, setFailed] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let live = true;
    loadCt().then((v) => live && setVol(v), () => live && setFailed(true));
    return () => { live = false; };
  }, []);

  const total = vol ? (imaging.view === "axial" ? vol.meta.slices : imaging.view === "coronal" ? vol.meta.rows : vol.meta.cols) : 0;

  // "Play through the scan": the engine says it's playing; the board moves on its own clock,
  // counting from the snapshot that started it (keyed so a new snapshot starts the count over).
  const playKey = imaging.playing ? `${imaging.view}:${imaging.slice}` : null;
  const [played, setPlayed] = useState<{ key: string; n: number } | null>(null);
  useEffect(() => {
    if (!playKey || !imaging.playing) return;
    const start = performance.now();
    const every = imaging.playing.everyMs;
    const id = setInterval(() => setPlayed({ key: playKey, n: Math.floor((performance.now() - start) / every) }), every);
    return () => clearInterval(id);
  }, [playKey, imaging.playing]);
  const step = played && played.key === playKey ? played.n : 0;
  const shown = total && playKey ? ((imaging.slice - 1 + step) % total) + 1 : imaging.slice;

  const grey = useMemo(() => (vol ? lut(vol.meta, imaging.window) : null), [vol, imaging.window]);
  const img = useMemo(() => (vol ? plane(vol, imaging.view, shown) : null), [vol, imaging.view, shown]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !img || !grey) return;
    cv.width = img.w;
    cv.height = img.h;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const out = ctx.createImageData(img.w, img.h);
    for (let i = 0, j = 0; i < img.px.length; i++, j += 4) {
      const g = grey[img.px[i]];
      out.data[j] = g; out.data[j + 1] = g; out.data[j + 2] = g; out.data[j + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
  }, [img, grey]);

  const win = WINDOWS[imaging.window];
  const mk = MARKERS[imaging.view];
  const tall = img ? img.aspect < 1 : false;

  return (
    <figure className={className} aria-label={`CT, ${VIEW_LABEL[imaging.view]} ${shown} of ${total || "?"}, sample study`}>
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black">
        <div className="absolute inset-0 grid place-items-center p-6">
          {img ? (
            <canvas
              ref={canvas}
              className="max-h-full max-w-full transition-transform duration-300 ease-out"
              style={{
                aspectRatio: img.aspect,
                ...(tall ? { height: "100%", width: "auto" } : { width: "100%", height: "auto" }),
                transform: `translate(${imaging.panX * 100}%, ${imaging.panY * 100}%) scale(${imaging.zoom}) rotate(${imaging.rotation}deg)`,
              }}
            />
          ) : (
            <p className="font-mono text-sm text-white/60">{failed ? "CT couldn't load." : "Loading CT…"}</p>
          )}
        </div>

        <div className="pointer-events-none absolute inset-0 p-3 font-mono text-[11px] leading-tight text-white/75 sm:text-xs">
          <div className="absolute left-3 top-3">
            <p>{VIEW_LABEL[imaging.view]} · {imaging.view === "axial" ? "slice" : "plane"} {shown}/{total || "…"}</p>
            {imaging.playing && <p className="text-teal">▶ playing</p>}
          </div>
          <div className="absolute right-3 top-3 text-right max-sm:left-3 max-sm:right-auto max-sm:top-9 max-sm:text-left">
            <p>{win.label} · W {win.w} L {win.l}</p>
            <p>Zoom {imaging.zoom.toFixed(1)}×{imaging.rotation ? ` · ${imaging.rotation}°` : ""}</p>
          </div>
          <p className="absolute left-3 top-1/2 -translate-y-1/2 max-sm:hidden">{mk.left}</p>
          <p className="absolute right-3 top-1/2 -translate-y-1/2 max-sm:hidden">{mk.right}</p>
          <p className="absolute left-1/2 top-3 -translate-x-1/2 max-sm:hidden">{mk.top}</p>
          <p className="absolute bottom-3 left-1/2 -translate-x-1/2 max-sm:hidden">{mk.bottom}</p>
          <p className="absolute bottom-3 left-3 rounded bg-black/60 px-1.5 py-0.5 font-semibold tracking-[0.12em] text-amber">SAMPLE STUDY</p>
          <p className="absolute bottom-3 right-3 max-w-[45%] text-right text-[10px] text-white/50 max-sm:max-w-[60%]">{vol?.meta.source ?? "TCIA · CC BY 3.0"}</p>
        </div>
      </div>
    </figure>
  );
}
