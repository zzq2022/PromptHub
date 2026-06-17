import { describe, expect, it } from "vitest";

import {
  getModelsByTypeAndCapability,
  resolveScenarioAIConfig,
  resolveScenarioModel,
  resolveRouteModel,
} from "../../../src/renderer/services/ai-defaults";

describe("ai-defaults", () => {
  it("uses explicit scenario selection when available", () => {
    const model = resolveScenarioModel(
      [
        {
          id: "chat-a",
          type: "chat",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "k1",
          apiUrl: "https://api.example.com",
          model: "gpt-4.1",
          isDefault: true,
        },
        {
          id: "chat-b",
          type: "chat",
          provider: "anthropic",
          apiProtocol: "anthropic",
          apiKey: "k2",
          apiUrl: "https://api.anthropic.com",
          model: "claude-4-sonnet",
        },
      ],
      { translation: "chat-b" },
      "translation",
      "chat",
    );

    expect(model?.id).toBe("chat-b");
  });

  it("lets route defaults override legacy per-scenario defaults", () => {
    const models = [
      {
        id: "cheap-chat",
        type: "chat" as const,
        provider: "openai",
        apiProtocol: "openai" as const,
        apiKey: "k1",
        apiUrl: "https://api.example.com",
        model: "gpt-4o-mini",
      },
      {
        id: "legacy-translation",
        type: "chat" as const,
        provider: "anthropic",
        apiProtocol: "anthropic" as const,
        apiKey: "k2",
        apiUrl: "https://api.anthropic.com",
        model: "claude-haiku",
      },
    ];

    const quickAddModel = resolveScenarioModel(
      models,
      { translation: "legacy-translation" },
      "quickAdd",
      "chat",
      undefined,
      { fastText: "cheap-chat" },
    );
    const routeModel = resolveRouteModel(models, { fastText: "cheap-chat" }, "fastText");

    expect(quickAddModel?.id).toBe("cheap-chat");
    expect(routeModel?.id).toBe("cheap-chat");
  });

  it("falls back to the type default when scenario selection is missing", () => {
    const model = resolveScenarioModel(
      [
        {
          id: "image-a",
          type: "image",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "k1",
          apiUrl: "https://api.example.com",
          model: "gpt-image-1",
          isDefault: true,
        },
        {
          id: "image-b",
          type: "image",
          provider: "google",
          apiProtocol: "gemini",
          apiKey: "k2",
          apiUrl: "https://generativelanguage.googleapis.com",
          model: "gemini-image",
        },
      ],
      {},
      "imageTest",
      "image",
    );

    expect(model?.id).toBe("image-a");
  });

  it("falls back to legacy root chat config when the selected scenario model is unusable", () => {
    const config = resolveScenarioAIConfig({
      aiModels: [
        {
          id: "broken-translation",
          type: "chat",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "",
          apiUrl: "https://api.example.com",
          model: "gpt-4o-mini",
        },
      ],
      scenarioModelDefaults: { translation: "broken-translation" },
      scenario: "translation",
      type: "chat",
      aiProvider: "openai",
      aiApiProtocol: "openai",
      aiApiKey: "legacy-key",
      aiApiUrl: "https://api.legacy.example.com",
      aiModel: "gpt-4o",
    });

    expect(config).toMatchObject({
      provider: "openai",
      apiKey: "legacy-key",
      apiUrl: "https://api.legacy.example.com",
      model: "gpt-4o",
      type: "chat",
      apiProtocol: "openai",
    });
  });

  it("filters scenario defaults by required model capability", () => {
    const model = resolveScenarioModel(
      [
        {
          id: "generic-chat",
          type: "chat",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "generic-key",
          apiUrl: "https://api.example.com",
          model: "gpt-4o-mini",
          isDefault: true,
        },
        {
          id: "vision-chat",
          type: "chat",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "vision-key",
          apiUrl: "https://api.example.com",
          model: "gpt-4o",
          capabilities: { vision: true },
        },
      ],
      { imageReverse: "generic-chat" },
      "imageReverse",
      "chat",
      "vision",
    );

    expect(model?.id).toBe("vision-chat");
  });

  it("does not use legacy text config when a vision capability is required and legacy fallback is disabled", () => {
    const config = resolveScenarioAIConfig({
      aiModels: [
        {
          id: "generic-chat",
          type: "chat",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "generic-key",
          apiUrl: "https://api.example.com",
          model: "gpt-4o-mini",
          isDefault: true,
        },
      ],
      scenarioModelDefaults: { imageReverse: "generic-chat" },
      scenario: "imageReverse",
      type: "chat",
      requiredCapability: "vision",
      allowLegacyFallback: false,
      aiProvider: "openai",
      aiApiProtocol: "openai",
      aiApiKey: "legacy-key",
      aiApiUrl: "https://api.legacy.example.com",
      aiModel: "gpt-4o",
    });

    expect(config).toBeNull();
  });

  it("lists only chat models marked as vision-capable for vision routes", () => {
    const models = getModelsByTypeAndCapability(
      [
        {
          id: "strong-chat",
          type: "chat",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "key",
          apiUrl: "https://api.example.com",
          model: "gpt-4.1",
        },
        {
          id: "vision-chat",
          type: "chat",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "key",
          apiUrl: "https://api.example.com",
          model: "gpt-4o",
          capabilities: { vision: true },
        },
      ],
      "chat",
      "vision",
    );

    expect(models.map((model) => model.id)).toEqual(["vision-chat"]);
  });

  it("filters non-chat retrieval capabilities independently from chat routes", () => {
    const models = getModelsByTypeAndCapability(
      [
        {
          id: "chat-a",
          type: "chat",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "key",
          apiUrl: "https://api.example.com",
          model: "gpt-4.1",
          capabilities: { chat: true },
        },
        {
          id: "embedding-a",
          type: "chat",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "key",
          apiUrl: "https://api.example.com",
          model: "text-embedding-3-large",
          capabilities: { chat: false, embedding: true },
        },
      ],
      "chat",
      "embedding",
    );

    expect(models.map((model) => model.id)).toEqual(["embedding-a"]);
  });

  it("uses the requested route type when a dual-capability model is selected", () => {
    const config = resolveScenarioAIConfig({
      aiModels: [
        {
          id: "dual-model",
          type: "image",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "key",
          apiUrl: "https://api.example.com",
          model: "gpt-4o-image",
          capabilities: { chat: true, imageGeneration: true },
        },
      ],
      scenarioModelDefaults: { promptTest: "dual-model" },
      scenario: "promptTest",
      type: "chat",
      allowLegacyFallback: false,
      aiProvider: "",
      aiApiProtocol: "openai",
      aiApiKey: "",
      aiApiUrl: "",
      aiModel: "",
    });

    expect(config).toMatchObject({
      id: "dual-model",
      type: "chat",
    });
  });
});
