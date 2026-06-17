import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AvailableModelsList } from "../../../src/renderer/components/settings/ai-workbench/model-form/AvailableModelsList";
import { renderWithI18n } from "../../helpers/i18n";

function createModelForm() {
  return {
    type: "chat" as const,
    name: "",
    provider: "openai",
    apiProtocol: "openai" as const,
    apiKey: "",
    apiUrl: "https://api.openai.com",
    model: "",
    capabilities: {
      vision: false,
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

describe("AvailableModelsList", () => {
  it("translates the fallback Other category label", async () => {
    await renderWithI18n(
      <AvailableModelsList
        availableModels={[{ id: "custom-model-1", owned_by: "unknown-lab" }]}
        modelForm={{
          ...createModelForm(),
          provider: "custom",
          apiUrl: "https://api.example.com",
        }}
        setModelForm={vi.fn()}
        selectedIds={[]}
        onSelectionChange={vi.fn()}
      />,
      { language: "zh" },
    );

    expect(screen.getByText("其他")).toBeInTheDocument();
    expect(screen.queryByText("Other")).not.toBeInTheDocument();
  });

  it("groups OpenAI-compatible proxy models by model id before owned_by", async () => {
    await renderWithI18n(
      <AvailableModelsList
        availableModels={[
          { id: "deepseek-ai/DeepSeek-V4-Pro", owned_by: "openai" },
          { id: "qwen/qwen3-max", owned_by: "openai" },
          { id: "gpt-5.4", owned_by: "openai" },
        ]}
        modelForm={createModelForm()}
        setModelForm={vi.fn()}
        selectedIds={[]}
        onSelectionChange={vi.fn()}
      />,
      { language: "zh" },
    );

    expect(screen.getByText("GPT")).toBeInTheDocument();
    expect(screen.getByText("DeepSeek")).toBeInTheDocument();
    expect(screen.getByText("Qwen")).toBeInTheDocument();
    expect(screen.getByText("deepseek-ai/DeepSeek-V4-Pro")).toBeInTheDocument();
    expect(screen.getByText("qwen/qwen3-max")).toBeInTheDocument();
  });

  it("recognizes mainstream model families even when owned_by is a proxy label", async () => {
    await renderWithI18n(
      <AvailableModelsList
        availableModels={[
          { id: "stepfun-ai/Step-3.7-Flash", owned_by: "openai" },
          { id: "MiniMax/MiniMax-M1", owned_by: "openai" },
          { id: "Baichuan/Baichuan4-Turbo", owned_by: "openai" },
          { id: "meta-llama/Llama-4-Maverick", owned_by: "openai" },
          { id: "x-ai/grok-4", owned_by: "openai" },
          { id: "cohere/command-r-plus", owned_by: "openai" },
        ]}
        modelForm={createModelForm()}
        setModelForm={vi.fn()}
        selectedIds={[]}
        onSelectionChange={vi.fn()}
      />,
      { language: "zh" },
    );

    for (const category of [
      "StepFun",
      "MiniMax",
      "Baichuan",
      "Llama",
      "Grok",
      "Command",
    ]) {
      expect(screen.getByText(category)).toBeInTheDocument();
    }

    expect(screen.queryByText("GPT")).not.toBeInTheDocument();
  });
});
