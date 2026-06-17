import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

vi.mock("@prompthub/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@prompthub/core")>();
  return {
    ...actual,
    coreAIConfigService: {
      read: vi.fn(),
      replace: vi.fn(),
    },
  };
});

import {
  mergeAISettingsPayload,
  stripAISettingsPayload,
} from "../../../src/main/ipc/settings.ipc";

describe("settings IPC AI config helpers", () => {
  it("strips AI fields from the SQLite settings payload", () => {
    expect(
      stripAISettingsPayload({
        language: "en",
        aiModels: [
          {
            id: "model-1",
            type: "chat",
            provider: "openai",
            apiProtocol: "openai",
            apiKey: "secret",
            apiUrl: "https://api.openai.com/v1",
            model: "gpt-4.1",
          },
        ],
        modelRouteDefaults: { mainText: "model-1" },
      } as any),
    ).toEqual({ language: "en" });
  });

  it("merges desktop AI payloads into the JSON config shape", () => {
    const next = mergeAISettingsPayload(
      {
        aiProviders: [
          {
            id: "provider-work",
            name: "Work",
            provider: "openai",
            apiProtocol: "openai",
            apiKey: "secret",
            apiUrl: "https://api.openai.com/v1",
          },
        ],
        aiModels: [
          {
            id: "model-work",
            providerId: "provider-work",
            type: "chat",
            provider: "openai",
            apiProtocol: "openai",
            apiKey: "secret",
            apiUrl: "https://api.openai.com/v1",
            model: "gpt-4.1",
          },
        ],
        modelRouteDefaults: { mainText: "model-work" },
      } as any,
      {
        kind: "prompthub-ai-config",
        version: 1,
        updatedAt: "2026-06-01T00:00:00.000Z",
        providers: [],
        models: [],
        modelRouteDefaults: {},
      },
    );

    expect(next).toEqual({
      providers: [
        expect.objectContaining({
          id: "provider-work",
          provider: "openai",
        }),
      ],
      models: [
        expect.objectContaining({
          id: "model-work",
          providerId: "provider-work",
        }),
      ],
      modelRouteDefaults: { mainText: "model-work" },
    });
  });
});
