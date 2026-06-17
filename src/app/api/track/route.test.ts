import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/bff-client", () => ({ recordEventToBff: vi.fn(async () => {}) }));
import { recordEventToBff } from "@/lib/bff-client";

afterEach(() => vi.restoreAllMocks());
async function load() { return (await import("./route")).POST; }
function req(body: unknown) {
  return new Request("http://localhost/api/track", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 Chrome/120",
      accept: "*/*",
      "accept-language": "ru",
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

  it("rejects a missing event_name", async () => {
    const POST = await load();
    const res = await POST(req({ props: {} }));
    expect(res.status).toBe(400);
  });
});
