import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResendEmailGateway } from "@/modules/email/infrastructure/resend-email-gateway";

const api = vi.hoisted(() => ({
  clientKeys: vi.fn(),
  segments: { list: vi.fn() },
  emails: { send: vi.fn() },
  contacts: {
    imports: { create: vi.fn(), get: vi.fn() },
    list: vi.fn(),
    segments: { remove: vi.fn() },
  },
  broadcasts: { create: vi.fn(), send: vi.fn() },
}));
vi.mock("resend", () => ({
  Resend: class {
    constructor(key: string) {
      api.clientKeys(key);
    }
    segments = api.segments;
    emails = api.emails;
    contacts = api.contacts;
    broadcasts = api.broadcasts;
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("campaign provider contract", () => {
  it("checks the campaign key with a read-only segment request", async () => {
    api.segments.list.mockResolvedValue({ data: { data: [] }, error: null });
    const gateway = new ResendEmailGateway(
      "sending-key",
      "sender@example.test",
      "campaign-key",
    );
    await expect(gateway.checkCampaignAccess()).resolves.toBeUndefined();
    expect(api.clientKeys.mock.calls).toEqual([
      ["sending-key"],
      ["campaign-key"],
    ]);
    expect(api.segments.list).toHaveBeenCalledWith({ limit: 1 });
    expect(api.emails.send).not.toHaveBeenCalled();
  });

  it("explains the sending-only key rejection without exposing the provider payload", async () => {
    api.segments.list.mockResolvedValue({
      data: null,
      error: {
        name: "restricted_api_key",
        statusCode: 401,
        message: "Provider details",
      },
    });
    const gateway = new ResendEmailGateway(
      "sending-key",
      "sender@example.test",
    );
    await expect(gateway.checkCampaignAccess()).rejects.toMatchObject({
      code: "CAMPAIGN_PROVIDER_ACCESS_DENIED",
      message: expect.stringContaining("RESEND_CAMPAIGN_API_KEY"),
    });
  });

  it("imports existing contacts into the campaign segment without changing subscription status and escapes CSV", async () => {
    api.contacts.imports.create.mockResolvedValue({
      data: { id: "import" },
      error: null,
    });
    const gateway = new ResendEmailGateway("test-key", "sender@example.test");
    await gateway.importContacts({
      segmentId: "segment",
      rows: [{ email: "one@example.test", firstName: 'A "quoted", name' }],
    });
    const payload = api.contacts.imports.create.mock.calls[0]![0];
    expect(payload).toMatchObject({
      onConflict: "upsert",
      segments: [{ id: "segment" }],
      columnMap: { email: "email", firstName: "first_name" },
    });
    const csv = await payload.file.text();
    expect(csv).toContain('"A ""quoted"", name"');
    expect(csv).not.toContain("unsubscribed");
    expect(payload.columnMap).not.toHaveProperty("unsubscribed");
  });
  it("reads all segment pages and retains provider unsubscribe state", async () => {
    api.contacts.list
      .mockResolvedValueOnce({
        data: {
          data: [{ id: "one", email: "ONE@example.test", unsubscribed: true }],
          has_more: true,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          data: [{ id: "two", email: "two@example.test", unsubscribed: false }],
          has_more: false,
        },
        error: null,
      });
    const gateway = new ResendEmailGateway("key", "sender@example.test");
    const result = gateway.listSegmentContacts("segment");
    await vi.runAllTimersAsync();
    expect(await result).toEqual([
      { email: "one@example.test", unsubscribed: true },
      { email: "two@example.test", unsubscribed: false },
    ]);
    expect(api.contacts.list.mock.calls[1]![0]).toMatchObject({
      segmentId: "segment",
      after: "one",
    });
  });
  it("removes only segment membership, leaving the contact subscription unchanged", async () => {
    api.contacts.segments.remove.mockResolvedValue({
      data: { deleted: true },
      error: null,
    });
    await new ResendEmailGateway(
      "key",
      "sender@example.test",
    ).removeContactFromSegment("segment", "one@example.test");
    expect(api.contacts.segments.remove).toHaveBeenCalledWith({
      email: "one@example.test",
      segmentId: "segment",
    });
  });
  it.each([500, 503, null])(
    "treats provider status %s as an ambiguous send",
    async (statusCode) => {
      api.broadcasts.send.mockResolvedValue({
        data: null,
        error: { statusCode, message: "Provider failure" },
      });
      await expect(
        new ResendEmailGateway("key", "sender@example.test").sendBroadcast(
          "broadcast",
        ),
      ).rejects.toMatchObject({ ambiguous: true });
    },
  );
  it("requires a matching accepted broadcast ID", async () => {
    api.broadcasts.send.mockResolvedValue({ data: null, error: null });
    await expect(
      new ResendEmailGateway("key", "sender@example.test").sendBroadcast(
        "broadcast",
      ),
    ).rejects.toMatchObject({ ambiguous: true });
  });
  it("marks an explicit validation rejection as unsent", async () => {
    api.broadcasts.send.mockResolvedValue({
      data: null,
      error: { statusCode: 422, message: "Invalid" },
    });
    await expect(
      new ResendEmailGateway("key", "sender@example.test").sendBroadcast(
        "broadcast",
      ),
    ).rejects.toMatchObject({ ambiguous: false });
  });
});
