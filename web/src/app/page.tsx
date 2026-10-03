import Link from "next/link";
import {
  ArrowRight, ClipboardCheck, FileSignature, Laptop, Monitor, PhoneCall, Pill, Repeat2, ShieldCheck, Smartphone, Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Logo, ArnieRing } from "@/components/vega-ring";

const steps = [
  { n: 1, title: "Set up the case", text: "Before anyone scrubs: patient, procedure, site and allergies. The only typing in the whole case." },
  { n: 2, title: "Say “ARNIE, start time out”", text: "ARNIE runs the WHO checklist out loud, reads back every event and keeps the clock." },
  { n: 3, title: "Sign the record", text: "The operative record is drafted from confirmed events, ready for the surgeon's sign-off." },
];

const features = [
  { icon: ShieldCheck, title: "Won't skip a step", say: "Skip it, let's start.", text: "The time-out can't complete until every item is confirmed out loud." },
  { icon: Repeat2, title: "Reads back first", say: "ARNIE, tourniquet on, left thigh.", text: "Nothing is logged until ARNIE reads it back and someone says “Confirmed.”" },
  { icon: Pill, title: "Catches allergies and doses", say: "Giving ampicillin, one gram.", text: "ARNIE listens to the team, not just to commands. It speaks up when a drug conflicts with a recorded allergy or a dose differs from the chart's order. It never suggests a dose." },
  { icon: Timer, title: "Watches the clock", say: "ARNIE, how long has the tourniquet been on?", text: "Tourniquet alerts at 60, 90 and 120 minutes, spoken and on the board." },
  { icon: PhoneCall, title: "Calls a specialist", say: "ARNIE, call vascular.", text: "The specialist's phone rings and ARNIE briefs them from the confirmed log." },
  { icon: ClipboardCheck, title: "Reconciles counts", say: "ARNIE, final count 10 sponges.", text: "Sponges, needles and implants are tracked; sign-out is blocked on a mismatch." },
];

const screens = [
  { href: "/room", icon: Laptop, title: "Room", device: "Laptop in the OR", text: "Set up the case, check the mic, start ARNIE. This device is the room's microphone and speaker." },
  { href: "/board", icon: Monitor, title: "Wall board", device: "Big screen", text: "Live checklist, alerts, timers and counts, readable from across the room." },
  { href: "/specialist", icon: Smartphone, title: "Specialist", device: "Specialist's phone", text: "Rings on “call vascular”, then hears ARNIE's briefing and joins the call." },
  { href: "/record", icon: FileSignature, title: "Operative record", device: "After surgery", text: "The drafted record, grouped and printable, for the surgeon to sign." },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      {/* Navigation */}
      <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur">
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6" aria-label="Main">
          <Link href="/" aria-label="Operon home" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Logo size={28} />
          </Link>
          <div className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#features" className="hover:text-foreground">What ARNIE does</a>
            <a href="#screens" className="hover:text-foreground">Screens</a>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" nativeButton={false} render={<Link href="/board" />} className="hidden sm:inline-flex">Wall board</Button>
            <Button nativeButton={false} render={<Link href="/room" />}>Start a case</Button>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-20">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-teal">Voice safety assistant for the operating room</p>
            <h1 className="mt-4 font-heading text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
              No gloves off.<br />No screens touched.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Operon&apos;s voice agent, <span className="font-medium text-foreground">ARNIE</span> (Always Ready Nurse, In Emergencies), runs the surgical safety checklist out
              loud, reads back every critical event before it&apos;s logged, and calls in a specialist, so the sterile team never
              has to touch a screen.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" nativeButton={false} render={<Link href="/room" />}>
                Start a case <ArrowRight className="size-4" aria-hidden />
              </Button>
              <Button size="lg" variant="secondary" nativeButton={false} render={<Link href="/board" />}>Open wall board</Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Works in any modern browser. No install, no account.</p>
          </div>

          {/* The moment that matters, shown not told */}
          <Card className="relative overflow-visible">
            <CardContent className="space-y-5 py-2">
              <div className="flex items-center gap-4">
                <ArnieRing state="listening" ticks={1} size={64} />
                <div>
                  <p className="font-heading text-xl font-semibold">ARNIE</p>
                  <p className="text-sm text-muted-foreground">OR 3 · Time out in progress</p>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Surgeon</p>
                  <p className="text-lg text-surgeon">&ldquo;Skip it, let&apos;s start.&rdquo;</p>
                </div>
                <div className="rounded-lg bg-amber-soft px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-amber">ARNIE · warning</p>
                  <p className="text-lg text-amber">&ldquo;Time out not complete: site marking not confirmed.&rdquo;</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Surgeon</p>
                  <p className="text-lg text-surgeon">&ldquo;Site marked, left thigh. Confirmed.&rdquo;</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* How it works */}
        <section id="how" className="border-t bg-card/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="font-heading text-3xl font-semibold">How it works</h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {steps.map((s) => (
                <li key={s.n} className="rounded-xl border bg-card p-5">
                  <span className="grid size-8 place-items-center rounded-full bg-teal font-mono text-sm font-semibold text-background">{s.n}</span>
                  <p className="mt-4 font-heading text-xl font-semibold">{s.title}</p>
                  <p className="mt-2 text-muted-foreground">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* What ARNIE does */}
        <section id="features" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="font-heading text-3xl font-semibold">What ARNIE does</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">Say the wake word, then the command. Everything safety-critical is plain code with scripted replies.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <Card key={f.title} className="h-full">
                <CardContent className="space-y-3">
                  <f.icon className="size-6 text-teal" aria-hidden />
                  <p className="font-heading text-xl font-semibold">{f.title}</p>
                  <p className="text-muted-foreground">{f.text}</p>
                  <p className="rounded-md bg-secondary px-3 py-2 font-mono text-sm text-surgeon">&ldquo;{f.say}&rdquo;</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Screens */}
        <section id="screens" className="border-t bg-card/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="font-heading text-3xl font-semibold">One screen per device</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">Open each link on the device it&apos;s made for. Only the room device needs a microphone.</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {screens.map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  className="group flex flex-col rounded-xl border bg-card p-5 transition-colors hover:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <s.icon className="size-6 text-teal" aria-hidden />
                  <p className="mt-4 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{s.device}</p>
                  <p className="mt-1 font-heading text-xl font-semibold">{s.title}</p>
                  <p className="mt-2 flex-1 text-sm text-muted-foreground">{s.text}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-teal">
                    Open <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Safety note */}
        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <div className="flex flex-col gap-4 rounded-xl border p-6 sm:flex-row sm:items-center">
            <ShieldCheck className="size-8 shrink-0 text-teal" aria-hidden />
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">ARNIE assists, it doesn&apos;t decide.</span> It never gives medical advice
              or doses, every alert comes from information your team confirmed, and it doesn&apos;t replace anyone in the room.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <Logo size={20} />
          <p>Built on Agora Conversational AI · Agora Voice First track</p>
        </div>
      </footer>
    </div>
  );
}
