import { NextResponse } from "next/server";
import { previewUrl } from "@/lib/contract";

/**
 * Server-side preview relay.
 *
 * The browser does not talk to the RPC: Studionet drops CORS headers on its
 * 429s, so a rate-limited read from the page fails as an opaque network error
 * with nothing to show the user. Here it is a JSON body with a reason in it.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  let url = "";
  try {
    const body = (await request.json()) as { url?: unknown };
    url = typeof body.url === "string" ? body.url.trim() : "";
  } catch {
    return NextResponse.json({ ok: false, reason: "malformed request" }, { status: 400 });
  }
  if (!url) {
    return NextResponse.json({ ok: false, reason: "no url given" }, { status: 400 });
  }
  // The contract's own ceiling. Refusing here keeps an absurd payload from
  // reaching the RPC at all.
  if (url.length > 400) {
    return NextResponse.json({ ok: false, reason: "url is longer than 400 characters" });
  }
  const preview = await previewUrl(url);
  return NextResponse.json(preview);
}
