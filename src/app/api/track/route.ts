import { NextResponse } from "next/server";
import { recordEventToBff } from "@/lib/bff-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EVENT = 64, MAX_PATH = 512, MAX_SID = 64, MAX_PROPS = 2048;

export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; }
  catch { try { b = JSON.parse(await req.text()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false }, { status: 400 }); } }

  const eventName = typeof b.event_name === "string" ? b.event_name.trim().slice(0, MAX_EVENT) : "";
  if (!eventName) return NextResponse.json({ ok: false, error: "missing_event_name" }, { status: 400 });

  const propsRaw =
    typeof b.props === "object" && b.props !== null && !Array.isArray(b.props)
      ? (b.props as Record<string, unknown>)
      : {};
  let propsJson = "{}";
  try { propsJson = JSON.stringify(propsRaw); } catch { propsJson = "{}"; }
  if (propsJson.length > MAX_PROPS) return NextResponse.json({ ok: false, error: "props_too_large" }, { status: 413 });

  const ua = req.headers.get("user-agent");
  try {
    await recordEventToBff({
      eventName,
      props: JSON.parse(propsJson) as Record<string, unknown>,
      pagePath: typeof b.page_path === "string" ? b.page_path.slice(0, MAX_PATH) || null : null,
      sessionId: typeof b.session_id === "string" ? b.session_id.slice(0, MAX_SID) || null : null,
      userId: null,
      userAgent: ua ? ua.slice(0, 512) : null,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "bff_unreachable" });
  }
  return NextResponse.json({ ok: true });
}
