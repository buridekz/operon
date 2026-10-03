"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { engine, type EngineView } from "@/lib/engine";
import { useEngineState } from "@/lib/use-engine";

type Entry = EngineView["record"]["entries"][number];

const SECTIONS: { title: string; kinds: Entry["kind"][] }[] = [
  { title: "Safety checklists", kinds: ["check"] },
  { title: "Milestones", kinds: ["milestone"] },
  { title: "Medications", kinds: ["drug"] },
  { title: "Counts & implants", kinds: ["count", "implant"] },
  { title: "Tourniquet & events", kinds: ["event"] },
  { title: "Consults", kinds: ["consult"] },
  { title: "Alerts raised", kinds: ["alert"] },
];

export function RecordView() {
  const { view: v } = useEngineState();
  const [busy, setBusy] = useState(false);

  if (!v) return <main className="grid flex-1 place-items-center text-muted-foreground">Connecting to the Operon engine…</main>;
  const r = v.record;

  async function sign() {
    setBusy(true);
    await engine("/api/record/sign", {}).catch(() => {});
    setBusy(false);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="font-heading text-3xl font-bold">{r.title}</CardTitle>
          <CardDescription className="text-base">
            {r.patient} · {r.procedure} · {r.room}
          </CardDescription>
          <CardAction>
            <Badge className={cn("h-7 px-3 font-mono text-sm", r.signedAt ? "bg-teal text-background" : "bg-teal-soft text-teal")}>
              {r.signedAt ? `Signed ${r.signedAt}` : "Draft"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Built only from events the team confirmed by voice. Nothing here was written by an AI model.
          </p>
          {SECTIONS.map((s) => {
            const rows = r.entries.filter((e) => s.kinds.includes(e.kind));
            if (!rows.length) return null;
            return (
              <section key={s.title}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{s.title}</h2>
                <ul className="divide-y rounded-lg border">
                  {rows.map((e, i) => (
                    <li key={`${e.time}-${e.text}-${i}`} className="flex items-baseline gap-4 px-3 py-2">
                      <span className="font-mono text-sm text-muted-foreground">{e.time}</span>
                      <span className={cn("flex-1", e.severity === "critical" && "text-critical", e.severity === "warning" && "text-amber")}>{e.text}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {r.entries.length === 0 && <p className="text-muted-foreground">Nothing has been logged for this case yet.</p>}
          <div className="flex flex-wrap items-center gap-3 border-t pt-5">
            <Button size="lg" onClick={sign} disabled={busy || !!r.signedAt || r.entries.length === 0}>
              {r.signedAt ? "Signed" : "Sign as surgeon"}
            </Button>
            <span className="text-sm text-muted-foreground">Signed after leaving the sterile field: the only screen step after surgery.</span>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
