import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSessionToken } from "@/lib/auth";

vi.mock("@/lib/bff-client", () => ({ recordEventToBff: vi.fn(async () => {}) }));
import { recordEventToBff } from "@/lib/bff-client";

const SECRET = "unit-test-secret";
const ORIGINAL = { ...process.env };
beforeEach(() => { process.env.SESSION_SECRET = SECRET; });
afterEach(() => { vi.clearAllMocks(); process.env = { ...ORIGINAL }; });
async function load() { return (await import("./route")).POST; }
function req(body: unknown, cookie: string = `promo_session=${createSessionToken(SECRET)}`) {
  return new NextRequest("http://localhost/api/track", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 Chrome/120",
      accept: "*/*",
      "accept-language": "ru",
      cookie,
    },
    body: JSON.stringify(body),
  });
}

describe("cabinet POST /api/track", () => {
  it("forwards an event to the BFF and returns ok", async () => {
    const POST = await load();
    const res = await POST(req({ event_name: "promo_edit_open", props: { promo_id: "p1" }, page_path: "/cabinet/p1", session_id: "s1" }));
    expect(res.status).toBe(200);
    expect(recordEventToBff).toHaveBeenCalledOnce();
    expect((recordEventToBff as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ eventName: "promo_edit_open", props: { promo_id: "p1" } });
  });

  it("rejects a request whose session cookie is present but not signed", async () => {
    const POST = await load();
    const res = await POST(req({ event_name: "x" }, "promo_session=forged"));
    expect(res.status).toBe(401);
    expect(recordEventToBff).not.toHaveBeenCalled();
  });

  it("rejects a missing event_name", async () => {
    const POST = await load();
    const res = await POST(req({ props: {} }));
    expect(res.status).toBe(400);
  });
});
