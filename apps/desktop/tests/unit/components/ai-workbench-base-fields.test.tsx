import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BaseFields } from "../../../src/renderer/components/settings/ai-workbench/model-form/BaseFields";
import { PROVIDER_OPTIONS } from "../../../src/renderer/components/settings/ai-workbench/constants";
import {
  getCategoryIcon,
  hasDedicatedCategoryIcon,
} from "../../../src/renderer/components/ui/ModelIcons";
import { renderWithI18n } from "../../helpers/i18n";

function createModelForm(provider: string = "openai") {
  return {
    type: "chat" as const,
    name: "",
    provider,
    apiProtocol:
      provider === "custom"
        ? "openai"
        : provider === "google"
          ? "gemini"
          : provider === "anthropic"
            ? "anthropic"
            : "openai",
    apiKey: "",
    apiUrl: provider === "openai" ? "https://api.openai.com" : "",
    model: "",
    capabilities: {
      chat: true,
      vision: false,
      imageGeneration: false,
      reasoning: false,
      toolUse: false,
      webSearch: false,
      embedding: false,
      rerank: false,
    },
    chatParams: {
      temperature: 0.7,
      maxTokens: 2048,
      topP: 1,
      topK: "",
      frequencyPenalty: 0,
      presencePenalty: 0,
      stream: false,
      enableThinking: false,
      customParamsText: "",
    },
    imageParams: {
      size: "1024x1024",
      quality: "standard" as const,
      style: "vivid" as const,
      n: 1,
    },
  };
}

describe("BaseFields", () => {
  it("keeps provider presets unique and includes mainstream provider types", () => {
    const providerIds = PROVIDER_OPTIONS.map((provider) => provider.id);

    expect(new Set(providerIds).size).toBe(providerIds.length);
    expect(
      PROVIDER_OPTIONS.every((provider) => provider.iconCategory.trim()),
    ).toBe(true);
    expect(providerIds.slice(0, 8)).toEqual([
      "custom",
      "openai",
      "openai-responses",
      "google",
      "anthropic",
      "azure-openai",
      "new-api",
      "ollama",
    ]);
  });

  it("keeps every preset provider on a dedicated icon instead of a letter fallback", () => {
    const missingIconProviders = PROVIDER_OPTIONS.filter(
      (provider) => !hasDedicatedCategoryIcon(provider.iconCategory),
    );

    expect(missingIconProviders).toEqual([]);
  });

  it("uses real brand image assets for preset providers that have logos", () => {
    for (const category of [
      "Azure OpenAI",
      "New API",
      "Llama",
      "Grok",
      "Qwen",
    ]) {
      const { container, unmount } = render(<>{getCategoryIcon(category)}</>);
      expect(container.querySelector(`img[alt="${category}"]`)).not.toBeNull();
      unmount();
    }
  });

  it("shows protocol selection for providers that support custom protocols", async () => {
    const setModelForm = vi.fn();

    const { rerender } = await renderWithI18n(
      <BaseFields
        modelForm={createModelForm("openai")}
        setModelForm={setModelForm}
        fetchingModels={false}
        onFetchModels={() => undefined}
      />,
      { language: "en" },
    );

    expect(
      screen.queryByText(/settings\.protocol|Protocol/),
    ).not.toBeInTheDocument();

    rerender(
      <BaseFields
        modelForm={createModelForm("custom")}
        setModelForm={setModelForm}
        fetchingModels={false}
        onFetchModels={() => undefined}
      />,
    );

    expect(screen.getByText(/settings\.protocol|Protocol/)).toBeInTheDocument();
    expect(
      screen.getByText(/settings\.protocolOpenAICompatible|OpenAI-compatible/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /OpenAI-compatible/ }));
    expect(
      await screen.findByText(
        /settings\.protocolGeminiCompatible|Gemini-compatible/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /settings\.protocolAnthropicCompatible|Anthropic-compatible/,
      ),
    ).toBeInTheDocument();
  });

  it("renders only the common model capability toggles", async () => {
    const setModelForm = vi.fn();

    await renderWithI18n(
      <BaseFields
        modelForm={createModelForm("openai")}
        setModelForm={setModelForm}
        fetchingModels={false}
        onFetchModels={() => undefined}
      />,
      { language: "en" },
    );

    for (const label of [
      "Image generation",
      "Vision input",
      "Reasoning",
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }

    for (const hiddenLabel of [
      "Chat Model",
      "Tool use",
      "Web search",
      "Embedding",
      "Rerank",
    ]) {
      expect(screen.queryByLabelText(hiddenLabel)).not.toBeInTheDocument();
    }

    for (const checkbox of screen.getAllByRole("checkbox")) {
      expect(checkbox).toHaveClass("sr-only");
    }

    expect(setModelForm).not.toHaveBeenCalled();
  });

  it("keeps provider-recommended protocol when switching away from custom", async () => {
    const setModelForm = vi.fn();

    await renderWithI18n(
      <BaseFields
        modelForm={createModelForm("custom")}
        setModelForm={setModelForm}
        fetchingModels={false}
        onFetchModels={() => undefined}
      />,
      { language: "en" },
    );

    fireEvent.click(screen.getByRole("button", { name: "自定义" }));
    fireEvent.click(await screen.findByRole("button", { name: "Gemini" }));

    expect(setModelForm).toHaveBeenCalled();
  });

  it("renders providers as one ungrouped list with custom first", async () => {
    const setModelForm = vi.fn();

    await renderWithI18n(
      <BaseFields
        modelForm={createModelForm("custom")}
        setModelForm={setModelForm}
        fetchingModels={false}
        onFetchModels={() => undefined}
      />,
      { language: "en" },
    );

    fireEvent.click(screen.getByRole("button", { name: "自定义" }));

    const options = await screen.findAllByRole("button");
    expect(options.some((option) => option.textContent === "Overseas")).toBe(
      false,
    );
    expect(options.some((option) => option.textContent === "Domestic")).toBe(
      false,
    );
    expect(options.some((option) => option.textContent === "Other")).toBe(
      false,
    );
    expect(
      screen.getAllByRole("button", { name: "自定义" }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("International / 国际")).not.toBeInTheDocument();
    expect(screen.queryByText("Domestic / 国内")).not.toBeInTheDocument();
    expect(screen.queryByText("Other / 其他")).not.toBeInTheDocument();
  });
});
