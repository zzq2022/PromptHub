import { describe, expect, it } from "vitest";

import { filterDetectedPlatforms } from "../../../src/renderer/services/platform-visibility";

describe("platform visibility integration", () => {
  it("hides the same disabled platform across shared platform consumers", () => {
    const supportedPlatforms = [
      { id: "claude", name: "Claude Code" },
      { id: "codex", name: "Codex CLI" },
      { id: "opencode", name: "OpenCode" },
    ] as any;

    const detectedPlatformIds = ["claude", "codex", "opencode"];
    const disabledPlatformIds = ["claude"];

    const visible = filterDetectedPlatforms(
      supportedPlatforms,
      detectedPlatformIds,
      disabledPlatformIds,
    ).map((platform) => platform.id);

    expect(visible).toEqual(["codex", "opencode"]);
  });
});
