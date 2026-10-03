// Client for the Operon engine (the Node server that is Agora's LLM endpoint).
// The engine URL is read at runtime from /engine-url, so changing tunnels needs no rebuild.

export type ItemStatus = "ok" | "active" | "blocked" | "pending";
export type ChecklistView = { title: string; complete: boolean; blocked: boolean; items: { label: string; status: ItemStatus }[] };
export type Severity = "info" | "warning" | "critical";
export type LogEntry = {
  at: number; time: string; text: string; severity?: Severity;
  kind: "event" | "alert" | "check" | "consult" | "drug" | "count" | "implant" | "milestone" | "imaging";
};
export type TranscriptLine = { who: "heard" | "sv"; text: string; severity?: Severity; at: number; via?: "rules" | "llm" };

export type EngineView = {
  phase: "idle" | "signin" | "timeout" | "signout" | "surgery" | "done";
  case: { patient: string; summary: string; procedure: string; site: string; room: string; allergies: string[]; preop: Record<string, string> };
  checklists: Record<"signin" | "timeout" | "signout", ChecklistView>;
  pending: unknown;
  log: LogEntry[];
  tourniquet: { side: string; seconds: number } | null;
  consult: { specialty: string; doctor: string; state: "ringing" | "live" | "ended"; start: number } | null;
  counts: {
    opened: { sponge: number; needle: number };
    final: { sponge: number; needle: number } | null;
    status: "none" | "open" | "reconciled" | "mismatch";
    missing: string[];
  };
  implants: { time: string; name: string }[];
  milestones: Partial<Record<"incision" | "closure", string>>;
  imaging: { visible: boolean; study: string; slice: number; zoom: number; rotation: number } | null;
  record: {
    title: string; patient: string; procedure: string; room: string; status: string; signedAt: string | null;
    entries: { time: string; text: string; kind: LogEntry["kind"]; severity: Severity | null }[];
  };
  transcript: TranscriptLine[];
  agent: { running: boolean; agentId: string | null };
  llm: boolean;
};

export type CaseSetup = {
  patient: string; room: string; summary: string; procedure: string; site: string;
  allergies: string[]; preop: Record<string, string>;
};

let cached: Promise<string> | null = null;
export function engineUrl(): Promise<string> {
  cached ??= fetch("/engine-url").then((r) => r.json()).then((j: { url: string }) => j.url.replace(/\/$/, ""));
  return cached;
}

export async function engine<T = unknown>(path: string, body?: unknown): Promise<T> {
  const base = await engineUrl();
  const res = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText);
  return data as T;
}

export const pad2 = (n: number) => String(Math.floor(n)).padStart(2, "0");
export const mmss = (seconds: number) => `${pad2(seconds / 60)}:${pad2(seconds % 60)}`;
