// Simulated CT viewer for the voice-driven imaging demo. The image is generated procedurally
// (an axial thigh cross-section), so there is no patient data and no licensing concern.
// It is always labelled SIMULATED.

const TOTAL = 40;

type Props = { study: string; slice: number; zoom: number; rotation: number; className?: string };

export function CtViewer({ study, slice, zoom, rotation, className }: Props) {
  // The thigh tapers and the vessels drift slightly from proximal (1) to distal (40).
  const k = (slice - 1) / (TOTAL - 1);
  const rx = 205 - 40 * k;
  const ry = 175 - 30 * k;
  const femurX = 6 - 10 * k;
  const femurR = 30 - 3 * k;
  const arteryX = -38 + 30 * k;
  const arteryY = -62 + 40 * k;
  const seed = slice * 7;

  return (
    <figure className={className} aria-label={`${study}, slice ${slice} of ${TOTAL}, simulated`}>
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black">
        <svg viewBox="-260 -260 520 520" className="absolute inset-0 size-full" role="img" aria-hidden>
          <defs>
            <filter id="ct-grain" x="-50%" y="-50%" width="200%" height="200%">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={seed} result="n" />
              <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.35 0" result="g" />
              <feComposite in="g" in2="SourceGraphic" operator="in" result="gm" />
              <feBlend in="SourceGraphic" in2="gm" mode="overlay" />
            </filter>
            <radialGradient id="ct-marrow">
              <stop offset="0" stopColor="#6f6f6f" />
              <stop offset="1" stopColor="#4a4a4a" />
            </radialGradient>
          </defs>
          <g transform={`rotate(${rotation}) scale(${zoom})`} filter="url(#ct-grain)">
            {/* skin + subcutaneous fat */}
            <ellipse rx={rx} ry={ry} fill="#2c2c2c" stroke="#7a7a7a" strokeWidth="2" />
            {/* muscle compartments */}
            <ellipse cx={-10} cy={-30} rx={rx * 0.78} ry={ry * 0.45} fill="#8a8a8a" />
            <ellipse cx={35} cy={60} rx={rx * 0.6} ry={ry * 0.42} fill="#7f7f7f" />
            <ellipse cx={-85} cy={45} rx={rx * 0.32} ry={ry * 0.38} fill="#848484" />
            <path d={`M ${-rx * 0.7} 10 Q 0 ${-10 + 8 * k} ${rx * 0.75} 20`} stroke="#3a3a3a" strokeWidth="5" fill="none" />
            <path d={`M -20 ${-ry * 0.7} Q 10 0 -5 ${ry * 0.75}`} stroke="#3a3a3a" strokeWidth="4" fill="none" />
            {/* femur: cortex + marrow */}
            <circle cx={femurX} cy={8} r={femurR} fill="#f2f2f2" />
            <circle cx={femurX} cy={8} r={femurR * 0.62} fill="url(#ct-marrow)" />
            {/* femoral artery (contrast-filled) and vein */}
            <circle cx={arteryX} cy={arteryY} r={10} fill="#ffffff" />
            <circle cx={arteryX + 22} cy={arteryY + 6} r={12} fill="#b5b5b5" />
          </g>
        </svg>

        {/* CT overlay text */}
        <div className="pointer-events-none absolute inset-0 p-3 font-mono text-[11px] leading-tight text-white/75 sm:text-xs">
          <div className="absolute left-3 top-3">
            <p>{study}</p>
            <p>Axial · slice {slice}/{TOTAL}</p>
          </div>
          <div className="absolute right-3 top-3 text-right">
            <p>W 400 L 40</p>
            <p>Zoom {zoom.toFixed(1)}× · {rotation}°</p>
          </div>
          <p className="absolute left-3 top-1/2 -translate-y-1/2">R</p>
          <p className="absolute right-3 top-1/2 -translate-y-1/2">L</p>
          <p className="absolute bottom-3 left-3 rounded bg-black/60 px-1.5 py-0.5 font-semibold tracking-[0.12em] text-amber">SIMULATED</p>
        </div>
      </div>
    </figure>
  );
}
