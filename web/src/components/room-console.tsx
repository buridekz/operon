"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { engine, type CaseSetup } from "@/lib/engine";
import { joinChannel, type Call } from "@/lib/rtc";
import { useEngineState } from "@/lib/use-engine";

const AGENT_UID = 123456;

const fields: { name: keyof Omit<CaseSetup, "allergies" | "preop"> | "allergies" | "potassium" | "hemoglobin"; label: string; value: string; wide?: boolean }[] = [
  { name: "patient", label: "Patient", value: "Juan Cruz" },
  { name: "room", label: "Room", value: "OR 3" },
  { name: "summary", label: "Summary for specialist briefings", value: "58-year-old male, left femoral bleed", wide: true },
  { name: "procedure", label: "Procedure", value: "Exploration and repair, left femoral artery", wide: true },
  { name: "site", label: "Site", value: "left thigh" },
  { name: "allergies", label: "Allergies (comma-separated)", value: "penicillin" },
  { name: "potassium", label: "Pre-op potassium", value: "3.9" },
  { name: "hemoglobin", label: "Pre-op hemoglobin", value: "9.8" },
];

function caseFromForm(form: HTMLFormElement): CaseSetup {
  const f = new FormData(form);
  const get = (k: string) => String(f.get(k) ?? "").trim();
  return {
    patient: get("patient"), room: get("room"), summary: get("summary"), procedure: get("procedure"), site: get("site"),
    allergies: get("allergies").split(",").map((s) => s.trim()).filter(Boolean),
    preop: { potassium: get("potassium"), hemoglobin: get("hemoglobin") },
  };
}

export function RoomConsole() {
  const { view } = useEngineState();
  const callRef = useRef<Call | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Not connected.");
  const [level, setLevel] = useState(0);
  const [rehearsal, setRehearsal] = useState("");

  // Mic level meter while connected.
  useEffect(() => {
    const id = setInterval(() => setLevel(callRef.current?.mic.getVolumeLevel() ?? 0), 120);
    return () => clearInterval(id);
  }, []);

  // Leave the channel if the page is closed mid-session.
  useEffect(() => () => void callRef.current?.leave(), []);

  async function start(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Read the form before any await: React's event.currentTarget is null after the handler yields.
    const setup = caseFromForm(e.currentTarget);
    setBusy(true);
    try {
      const cfg = await engine<{ ready: boolean }>("/api/config");
      if (!cfg.ready) throw new Error("Engine is missing AGORA_APP_ID / AGORA_APP_CERT in engine/.env");
      await engine("/api/case", setup);
      setStatus("Joining the channel and opening the microphone…");
      await callRef.current?.leave();
      callRef.current = await joinChannel("room", (uid) =>
        setStatus(Number(uid) === AGENT_UID ? "Vega joined. Say “Vega, start time out.”" : "Specialist joined the call."));
      setStatus("Microphone live. Starting Vega…");
      const r = await engine<{ agent_id: string }>("/api/start", {});
      setStatus(`Vega starting (agent ${r.agent_id.slice(0, 8)}…).`);
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    await engine("/api/stop", {}).catch(() => {});
    await callRef.current?.leave();
    callRef.current = null;
    setLevel(0);
    setStatus("Stopped.");
    setBusy(false);
  }

  async function rehearse(e: FormEvent) {
    e.preventDefault();
    const text = rehearsal.trim();
    if (!text) return;
    setRehearsal("");
    const r = await engine<{ reply: string | null; via: string }>("/api/simulate", { text });
    setStatus(`Heard: ${text}\nVega: ${r.reply ?? "(silent)"}${r.via === "llm" ? "  (parsed by LLM)" : ""}`);
  }

  const running = !!view?.agent.running;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-4xl font-bold">
          Oper<span className="text-teal">on</span> <span className="font-medium text-muted-foreground">· Room</span>
        </h1>
        <Badge variant="outline" className={running ? "font-mono text-teal" : "font-mono"}>{running ? "Agent listening" : "Agent stopped"}</Badge>
      </div>
      <p className="mt-2 text-muted-foreground">
        Case setup happens here, before anyone scrubs. Then this device becomes the room microphone and speaker.
      </p>

      <form onSubmit={start} className="mt-8">
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.name} className={f.wide ? "grid gap-2 sm:col-span-2" : "grid gap-2"}>
              <Label htmlFor={f.name}>{f.label}</Label>
              <Input id={f.name} name={f.name} defaultValue={f.value} />
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="submit" size="lg" disabled={busy}>Save case &amp; start Vega</Button>
          <Button type="button" size="lg" variant="secondary" onClick={stop} disabled={busy}>Stop</Button>
        </div>
      </form>

      <div className="mt-6 h-2 overflow-hidden rounded-full bg-secondary" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
        <div className="h-full bg-teal transition-[width] duration-100" style={{ width: `${Math.round(level * 100)}%` }} />
      </div>
      <p className="mt-4 whitespace-pre-line font-mono text-sm text-muted-foreground" aria-live="polite">{status}</p>

      <Separator className="my-8" />

      <form onSubmit={rehearse} className="grid gap-2">
        <Label htmlFor="rehearsal">Rehearsal: type a sentence as if it was spoken</Label>
        <div className="flex gap-2">
          <Input id="rehearsal" value={rehearsal} onChange={(e) => setRehearsal(e.target.value)} placeholder="Vega, start time out" />
          <Button type="submit" variant="secondary">Send</Button>
        </div>
      </form>

      <p className="mt-8 text-sm text-muted-foreground">
        Open the <Link className="text-teal underline-offset-4 hover:underline" href="/board" target="_blank">wall board</Link> on the big screen and the{" "}
        <Link className="text-teal underline-offset-4 hover:underline" href="/specialist" target="_blank">specialist page</Link> on a teammate&apos;s phone.
      </p>
    </main>
  );
}
