import { describe, expect, it, vi } from "vitest";

import { uploadMediaBase64 } from "../src/media";

describe("media upload", () => {
  it("stores uploaded files with resolved media content type", async () => {
    const put = vi.fn().mockResolvedValue({});
    const context = {
      env: {
        MEDIA: { put },
      },
      get: vi.fn().mockReturnValue({ userId: "user-1" }),
      req: {
        json: vi.fn().mockResolvedValue({
          fileName: "avatar.png",
          base64Data: "aGVsbG8=",
        }),
      },
      json: (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status }),
    } as any;

    const response = await uploadMediaBase64(context, "images");
    const body = await response.json() as { data: string };

    expect(body.data).toBe("avatar.png");
    expect(put).toHaveBeenCalledWith(
      "assets/user-1/images/avatar.png",
      expect.any(Uint8Array),
      {
        httpMetadata: {
          contentType: "image/png",
        },
      },
    );
  });
});
