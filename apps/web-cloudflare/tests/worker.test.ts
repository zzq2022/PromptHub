import { describe, expect, it, vi } from "vitest";

import app from "../src/worker";

describe("worker error handling", () => {
  it("keeps auth captcha public even when an invalid bearer token is present", async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const response = await app.request(
      "https://example.com/api/auth/captcha",
      {
        headers: {
          Authorization: "Bearer malformed-token",
        },
      },
      {
        DB: {
          prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnValue({ run }),
          }),
        } as unknown as D1Database,
        MEDIA: {} as R2Bucket,
        ASSETS: { fetch: vi.fn() } as Fetcher,
        JWT_SECRET: "test-secret-for-public-captcha-route",
        ALLOW_REGISTRATION: "false",
        ACCESS_TOKEN_TTL_SECONDS: "86400",
      },
    );

    const body = await response.json() as {
      data: { captchaId: string; imageData: string };
    };

    expect(response.status).toBe(200);
    expect(body.data.captchaId).toBeTypeOf("string");
    expect(body.data.imageData).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not leak internal error messages in 500 responses", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await app.request(
      new Request("https://example.com/api/media/images/base64", {
        method: "POST",
        headers: {
          Authorization: "Bearer broken-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fileName: "a.png", base64Data: "aGVsbG8=" }),
      }),
      {
        DB: {} as D1Database,
        MEDIA: {} as R2Bucket,
        ASSETS: { fetch: vi.fn() } as Fetcher,
        JWT_SECRET: "short",
        ALLOW_REGISTRATION: "false",
        ACCESS_TOKEN_TTL_SECONDS: "86400",
      },
    );

    const body = await response.json() as { error: { code: string; message: string } };

    expect(response.status).toBe(401);
    expect(body.error.message).toBe("Invalid or expired access token");

    errorSpy.mockRestore();
  });
});
