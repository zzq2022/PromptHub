import { describe, expect, it } from "vitest";

import { emptySnapshot, normalizeSnapshot } from "../src/sync";

describe("sync snapshot helpers", () => {
  it("creates an empty snapshot with cloudflare backup version", () => {
    const snapshot = emptySnapshot();

    expect(snapshot.version).toBe("web-cloudflare-backup-v1");
    expect(snapshot.prompts).toEqual([]);
    expect(snapshot.promptVersions).toEqual([]);
    expect(snapshot.versions).toEqual([]);
    expect(snapshot.skills).toEqual([]);
  });

  it("normalizes versions and promptVersions symmetrically", () => {
    const version = {
      id: "v1",
      promptId: "p1",
      version: 1,
      systemPrompt: null,
      systemPromptEn: null,
      userPrompt: "hello",
      userPromptEn: null,
      variables: [],
      aiResponse: null,
      note: null,
      createdAt: "2026-05-29T00:00:00.000Z",
    };

    const normalized = normalizeSnapshot({
      exportedAt: "2026-05-29T00:00:00.000Z",
      prompts: [],
      versions: [version],
      folders: [],
      skills: [],
      skillVersions: [],
    });

    expect(normalized.versions).toEqual([version]);
    expect(normalized.promptVersions).toEqual([version]);
  });
});
