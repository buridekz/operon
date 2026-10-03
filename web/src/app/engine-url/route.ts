// Runtime engine URL (not inlined at build), so a new tunnel URL only needs a .env.local edit.
export function GET() {
  return Response.json({ url: process.env.ENGINE_URL ?? "http://localhost:3000" });
}
