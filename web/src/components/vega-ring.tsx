import { cn } from "@/lib/utils";
import { VEGA_LABEL, type ArnieState } from "@/lib/vega";

// The Operon mark and ARNIE's live indicator in one shape:
// the ring is the "O" of Operon, the dot is ARNIE (the guide star), and the four ticks are the
// case phases (Sign in · Time out · Surgery · Sign out), filled as each one completes.

const TICK_ANGLES = [-90, 0, 90, 180]; // 12, 3, 6, 9 o'clock
const STAR_ANGLE = -45; // between Sign in and Time out

const stroke: Record<ArnieState, string> = {
  off: "stroke-muted-foreground",
  listening: "stroke-teal",
  speaking: "stroke-teal",
  warning: "stroke-amber",
  critical: "stroke-critical",
};
const fill: Record<ArnieState, string> = {
  off: "fill-muted-foreground",
  listening: "fill-teal",
  speaking: "fill-teal",
  warning: "fill-amber",
  critical: "fill-critical",
};

const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) };
};

export function ArnieRing({
  state = "listening",
  ticks = 4,
  size = 48,
  animate = true,
  className,
}: { state?: ArnieState; ticks?: number; size?: number; animate?: boolean; className?: string }) {
  const star = polar(STAR_ANGLE, 34);
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn("shrink-0 overflow-visible", className)}
      role="img"
      aria-label={animate ? VEGA_LABEL[state] : "Operon"}
    >
      {animate && state === "speaking" && <circle cx="50" cy="50" r="34" fill="none" strokeWidth="3" className={cn(stroke[state], "vega-wave")} />}
      <circle
        cx="50"
        cy="50"
        r="34"
        fill="none"
        strokeWidth="6"
        className={cn(stroke[state], animate && state === "listening" && "vega-breathe", state === "off" && "opacity-50")}
      />
      {TICK_ANGLES.map((deg, i) => {
        const a = polar(deg, 42);
        const b = polar(deg, 48);
        return (
          <line
            key={deg}
            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            strokeWidth="5"
            strokeLinecap="round"
            className={i < ticks ? "stroke-teal" : "stroke-border"}
          />
        );
      })}
      <circle cx={star.x} cy={star.y} r="7.5" className={cn(fill[state], "stroke-background")} strokeWidth="3" />
    </svg>
  );
}

/** Operon wordmark with the ring. */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span aria-hidden className="inline-flex"><ArnieRing size={size} animate={false} /></span>
      <span className="font-heading font-semibold tracking-tight" style={{ fontSize: size * 0.8 }}>operon</span>
    </span>
  );
}
