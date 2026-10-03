import Link from "next/link";
import { Logo } from "@/components/vega-ring";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const screens = [
  { href: "/room", title: "Room", device: "In the OR", text: "Case setup before scrubbing, then this device becomes the room microphone and speaker." },
  { href: "/board", title: "Wall board", device: "Big screen", text: "Live checklist, conversation, tourniquet timer and case log. Nobody needs to touch it." },
  { href: "/specialist", title: "Specialist", device: "Teammate's phone", text: "Rings on “call vascular”, then hears Vega's briefing and joins the call." },
  { href: "/record", title: "Operative record", device: "After surgery", text: "The record drafted from every confirmed event, ready for the surgeon's sign-off." },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
      <p className="font-mono text-sm uppercase tracking-[0.12em] text-teal">Agora Voice First</p>
      <h1 className="mt-4">
        <Logo size={64} />
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
        A voice safety assistant for the operating room. Its voice agent, <span className="text-foreground">Vega</span>,
        won&apos;t let the team skip a safety step, reads back every critical event before logging it, and patches in a
        specialist, so nobody touches a screen. Just say &ldquo;Vega, start time out.&rdquo;
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {screens.map((s) => (
          <Link key={s.href} href={s.href} className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="h-full transition-colors group-hover:ring-teal">
              <CardHeader>
                <CardDescription className="font-mono text-xs uppercase tracking-[0.1em]">{s.device}</CardDescription>
                <CardTitle className="font-heading text-2xl">{s.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{s.text}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
