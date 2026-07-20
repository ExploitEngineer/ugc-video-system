import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteNexrenderTemplate,
  STUB_TEMPLATE_ID_PREFIX,
} from "../index.js";

const REAL_ID = "01KX5SVTM63C2BB1F21N43M2RD"; // a 26-char ULID, as Nexrender issues

let fetchMock: ReturnType<typeof vi.fn>;

const respond = (status: number, body = "") =>
  new Response(body || null, { status });

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("deleteNexrenderTemplate — giving a rejected upload back", () => {
  it("204 means deleted", async () => {
    fetchMock.mockResolvedValue(respond(204));
    await expect(deleteNexrenderTemplate(REAL_ID)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(new RegExp(`/api/v2/templates/${REAL_ID}$`));
    expect(init.method).toBe("DELETE");
    expect(
      (init.headers as Record<string, string>).Authorization,
    ).toMatch(/^Bearer /);
  });

  it("404 ALSO means deleted — someone else already removed it", async () => {
    // The caller's contract is "this template is gone". A template that was
    // never there satisfies it, and treating it as an error would strand the
    // row's `nexrenderTemplateId` forever.
    fetchMock.mockResolvedValue(respond(404, '{"error":"not found"}'));
    await expect(deleteNexrenderTemplate(REAL_ID)).resolves.toBeUndefined();
  });

  it("409 throws, because an active job still holds the template", async () => {
    // Throwing is what stops the caller clearing `nexrenderTemplateId`: the
    // upload is still out there and a later sweep has to be able to find it.
    fetchMock.mockResolvedValue(
      respond(409, '{"error":"template is in use by active jobs"}'),
    );
    await expect(deleteNexrenderTemplate(REAL_ID)).rejects.toThrow(
      /delete failed: 409/,
    );
  });

  it("never calls the real API for a stub template id", async () => {
    // Two processes can share one database, so a stub-mode row can be picked up
    // by a real-credential process. Deleting a `stub-template-…` id upstream
    // would be a 404 at best and someone else's template at worst.
    await expect(
      deleteNexrenderTemplate(`${STUB_TEMPLATE_ID_PREFIX}zip`),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does NOT retry a dropped socket — a landed DELETE would 404 on retry", async () => {
    // Nexrender documents DELETE as non-idempotent. If the request reached the
    // server and the socket then dropped, a retry answers 404, which this
    // function reads as success — hiding a failure that never happened, or
    // masking one that did. So a network error surfaces on the first attempt.
    fetchMock.mockRejectedValue(new Error("socket hang up"));
    await expect(deleteNexrenderTemplate(REAL_ID)).rejects.toThrow(
      /socket hang up/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 503, which the server told us to", async () => {
    fetchMock
      .mockResolvedValueOnce(respond(503))
      .mockResolvedValueOnce(respond(204));
    await expect(deleteNexrenderTemplate(REAL_ID)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
