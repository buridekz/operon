# Operon web

Next.js 16 (App Router) + TypeScript + Tailwind 4 + shadcn/ui. The screens of Operon:

| Route | Device | What it does |
|---|---|---|
| `/room` | Laptop or phone in the OR | Case setup before scrubbing; then joins the Agora channel as the room mic + speaker and starts the agent |
| `/board` | Big screen | Live checklist, conversation, tourniquet timer, consult status, case log |
| `/specialist` | Teammate's phone | Rings on "call vascular", answers into the Agora channel, shows Vega's briefing |

The brain (voice agent "Vega") lives in `../engine`. This app talks to it over HTTP + Server-Sent Events; the engine URL is read at runtime from `/engine-url` (env `ENGINE_URL`), so a new tunnel needs no rebuild.

## Run

```bash
cp .env.example .env.local   # ENGINE_URL=http://localhost:3000 (or the engine's public tunnel URL)
npm install
npm run build && npm start   # http://localhost:3001  (or: npm run dev)
```

For the specialist's phone: tunnel this app too (`cloudflared tunnel --url http://localhost:3001`), and set `ENGINE_URL` to the **engine's public tunnel URL** so the phone can reach it.

## Checks

```bash
npm run typecheck && npm run lint && npm run build
```

## Notes

- `agora-rtc-sdk-ng` touches `window`, so it is loaded with `import()` from client components only (`src/lib/rtc.ts`).
- Pages are Server Components that export `metadata`; the interactive parts are client components in `src/components/`.
- `next.config.ts` allows `*.trycloudflare.com` as a dev origin so a phone can open the dev server through a tunnel.
