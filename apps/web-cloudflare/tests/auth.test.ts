import { describe, expect, it, vi } from "vitest";

import { issueCaptcha } from "../src/auth";

describe("auth captcha", () => {
  it("returns svg captcha payload without legacy prompt field", async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const context = {
      env: {
        DB: {
          prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnValue({ run }),
          }),
        },
      },
      req: {
        url: "https://example.com/api/auth/captcha",
        header: vi.fn().mockReturnValue("127.0.0.1"),
      },
      json: (payload: unknown) => new Response(JSON.stringify(payload), { status: 200 }),
    } as any;

    const response = await issueCaptcha(context);
    const body = await response.json() as {
      data: { captchaId: string; imageData: string; expiresInSeconds: number; prompt?: string };
    };

    expect(body.data.captchaId).toBeTypeOf("string");
    expect(body.data.imageData.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(body.data.expiresInSeconds).toBe(300);
    expect(body.data.prompt).toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
