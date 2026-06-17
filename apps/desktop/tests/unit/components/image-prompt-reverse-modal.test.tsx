import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ImagePromptReverseModal } from "../../../src/renderer/components/prompt/ImagePromptReverseModal";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const chatCompletionMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/renderer/services/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/renderer/services/ai")>();
  return {
    ...actual,
    chatCompletion: (...args: unknown[]) => chatCompletionMock(...args),
  };
});

describe("ImagePromptReverseModal", () => {
  const writeTextMock = vi.fn();

  const selectSavedImage = async (user: ReturnType<typeof userEvent.setup>) => {
    window.electron.selectImage = vi.fn().mockResolvedValue(["/tmp/reference.png"]);
    window.electron.saveImage = vi.fn().mockResolvedValue(["saved-reference.png"]);
    window.electron.readImageBase64 = vi.fn().mockResolvedValue("iVBORw0KGgo=");

    await user.click(screen.getByText("拖入图片、粘贴截图，或点击选择"));
    await screen.findByText("saved-reference.png");
  };

  beforeEach(() => {
    chatCompletionMock.mockReset();
    writeTextMock.mockReset();
    installWindowMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: writeTextMock.mockResolvedValue(undefined),
      },
    });

    useFolderStore.setState({
      folders: [
        {
          id: "folder-1",
          name: "Marketing",
          createdAt: new Date("2026-05-01T00:00:00.000Z").toISOString(),
          updatedAt: new Date("2026-05-01T00:00:00.000Z").toISOString(),
          order: 0,
          icon: "folder",
        },
      ],
      selectedFolderId: null,
      expandedIds: new Set(),
      unlockedFolderIds: new Set(),
    } as Partial<ReturnType<typeof useFolderStore.getState>>);

    usePromptStore.setState({
      prompts: [
        {
          id: "prompt-1",
          title: "Existing image prompt",
          userPrompt: "test",
          tags: ["product"],
          createdAt: new Date("2026-05-01T00:00:00.000Z").toISOString(),
          updatedAt: new Date("2026-05-01T00:00:00.000Z").toISOString(),
        },
      ],
      selectedId: null,
      selectedIds: [],
      isLoading: false,
      searchQuery: "",
      filterTags: [],
      promptTypeFilter: "all",
      sortBy: "updatedAt",
      sortOrder: "desc",
      viewMode: "card",
      galleryImageSize: "medium",
      kanbanColumns: 3,
    } as Partial<ReturnType<typeof usePromptStore.getState>>);

    useSettingsStore.setState({
      aiProvider: "openai",
      aiApiProtocol: "openai",
      aiApiKey: "legacy-key",
      aiApiUrl: "https://legacy.example.com/v1",
      aiModel: "gpt-4o",
      aiModels: [
        {
          id: "image-reverse-chat",
          type: "chat",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "scenario-key",
          apiUrl: "https://scenario.example.com/v1",
          model: "gpt-4o-vision",
          capabilities: { vision: true },
        },
      ],
      scenarioModelDefaults: {
        imageReverse: "image-reverse-chat",
      },
      modelRouteDefaults: {
        visionText: "image-reverse-chat",
      },
      imageReverseAttachReferenceByDefault: true,
      enableNotifications: false,
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
  });

  it("reverses a selected image into an editable draft before creating a prompt", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({ id: "created-prompt" });
    const onClose = vi.fn();
    window.electron.selectImage = vi.fn().mockResolvedValue(["/tmp/reference.png"]);
    window.electron.saveImage = vi.fn().mockResolvedValue(["saved-reference.png"]);
    window.electron.readImageBase64 = vi.fn().mockResolvedValue("iVBORw0KGgo=");
    chatCompletionMock.mockResolvedValue({
      content: JSON.stringify({
        title: "电影感产品图",
        promptType: "image",
        systemPrompt: "",
        userPrompt: "cinematic product photo, soft studio light, shallow depth of field",
        description: "反推产品摄影生图提示词",
        suggestedFolder: "Marketing",
        tags: ["image", "product"],
      }),
    });

    await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={onClose}
          onCreate={onCreate}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    expect(screen.getByRole("heading", { name: "图片反推" })).toBeInTheDocument();
    expect(document.querySelector(".max-w-2xl")).toHaveClass("animate-in");
    expect(document.querySelector(".max-w-2xl")).toHaveClass("zoom-in-95");
    expect(screen.queryByText("输出类型")).not.toBeInTheDocument();
    expect(screen.getByText("绘图")).toBeInTheDocument();
    expect(screen.getByText("保存为参考图")).toBeInTheDocument();
    expect(
      screen.queryByText("开启后，新建的生图 Prompt 会保留这张图片作为参考图。"),
    ).not.toBeInTheDocument();
    expect(
      screen
        .getByText("拖入图片、粘贴截图，或点击选择")
        .compareDocumentPosition(
          screen.getByRole("textbox", { name: "补充说明（可选）" }),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const reverseButton = screen.getByRole("button", { name: "开始反推" });
    expect(reverseButton).toBeDisabled();

    await user.click(screen.getByText("拖入图片、粘贴截图，或点击选择"));
    expect(await screen.findByText("saved-reference.png")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移除" })).toBeInTheDocument();

    await user.type(
      screen.getByRole("textbox", { name: "补充说明（可选）" }),
      "更适合写实生图模型",
    );
    await user.click(reverseButton);

    await waitFor(() => {
      expect(chatCompletionMock).toHaveBeenCalledTimes(1);
    });

    expect(chatCompletionMock.mock.calls[0][0]).toMatchObject({
      apiKey: "scenario-key",
      model: "gpt-4o-vision",
      type: "chat",
    });

    const messages = chatCompletionMock.mock.calls[0][1] as Array<{
      role: string;
      content: unknown;
    }>;
    expect(messages[1].content).toEqual([
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("更适合写实生图模型"),
      }),
      expect.objectContaining({
        type: "image_url",
        image_url: expect.objectContaining({
          url: "data:image/png;base64,iVBORw0KGgo=",
          detail: "high",
        }),
      }),
    ]);

    expect(
      await screen.findByDisplayValue(
        "cinematic product photo, soft studio light, shallow depth of field",
      ),
    ).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("反推标题"));
    await user.type(screen.getByLabelText("反推标题"), "确认后的产品图");
    await user.click(screen.getByRole("button", { name: "创建提示词" }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "确认后的产品图",
          promptType: "image",
          userPrompt:
            "cinematic product photo, soft studio light, shallow depth of field",
          folderId: "folder-1",
          tags: ["image", "product"],
          images: ["saved-reference.png"],
          variables: [],
        }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("creates prompt variables from reversed PromptHub placeholders", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({ id: "created-prompt" });
    chatCompletionMock.mockResolvedValue({
      content: JSON.stringify({
        title: "动漫人像",
        promptType: "image",
        systemPrompt: "",
        userPrompt:
          "masterpiece anime illustration, {{subject}}, {{pose}}, {{background}}, {{color_palette}}, avoid {{negative_prompt}}",
        description: "可复用动漫人像生图提示词",
        suggestedFolder: null,
        tags: ["image"],
      }),
    });

    await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={vi.fn()}
          onCreate={onCreate}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    await selectSavedImage(user);
    await user.click(screen.getByRole("button", { name: "开始反推" }));
    await screen.findByDisplayValue(/{{subject}}/);
    await user.click(screen.getByRole("button", { name: "创建提示词" }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: [
            expect.objectContaining({ name: "subject", type: "text" }),
            expect.objectContaining({ name: "pose", type: "text" }),
            expect.objectContaining({ name: "background", type: "text" }),
            expect.objectContaining({ name: "color_palette", type: "text" }),
            expect.objectContaining({ name: "negative_prompt", type: "text" }),
          ],
        }),
      );
    });
  });

  it("remembers when the user disables attaching the source image as a reference", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({ id: "created-prompt" });
    window.electron.selectImage = vi.fn().mockResolvedValue(["/tmp/reference.png"]);
    window.electron.saveImage = vi.fn().mockResolvedValue(["saved-reference.png"]);
    window.electron.readImageBase64 = vi.fn().mockResolvedValue("iVBORw0KGgo=");
    chatCompletionMock.mockResolvedValue({
      content: JSON.stringify({
        title: "干净产品图",
        promptType: "image",
        systemPrompt: "",
        userPrompt: "clean product photo, white background, soft studio lighting",
        description: "产品图提示词",
        suggestedFolder: null,
        tags: ["product"],
      }),
    });

    await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={vi.fn()}
          onCreate={onCreate}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    await user.click(screen.getByText("保存为参考图"));

    expect(
      useSettingsStore.getState().imageReverseAttachReferenceByDefault,
    ).toBe(false);

    await user.click(screen.getByText("拖入图片、粘贴截图，或点击选择"));
    await screen.findByText("saved-reference.png");
    await user.click(screen.getByRole("button", { name: "开始反推" }));

    expect(await screen.findByText("反推草稿")).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "创建提示词" }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledTimes(1);
    });

    expect(onCreate.mock.calls[0][0]).toMatchObject({
      title: "干净产品图",
      promptType: "image",
      userPrompt: "clean product photo, white background, soft studio lighting",
      tags: ["product"],
    });
    expect(onCreate.mock.calls[0][0].images).toBeUndefined();
  });

  it("highlights the image drop zone while dragging over it", async () => {
    await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={vi.fn()}
          onCreate={vi.fn()}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    const dropZone = screen.getByRole("button", {
      name: /拖入图片、粘贴截图，或点击选择/,
    });

    fireEvent.dragEnter(dropZone);
    expect(dropZone).toHaveClass("border-primary/70");
    expect(dropZone).toHaveClass("bg-primary/5");

    fireEvent.dragLeave(dropZone);
    expect(dropZone).not.toHaveClass("border-primary/70");
  });

  it("allows copying the reversed prompt without creating a stored prompt", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: writeTextMock.mockResolvedValue(undefined),
      },
    });
    const onCreate = vi.fn().mockResolvedValue({ id: "created-prompt" });
    chatCompletionMock.mockResolvedValue({
      content: JSON.stringify({
        title: "霓虹机器人图",
        promptType: "image",
        systemPrompt: "",
        userPrompt: "neon robot icon, blue glow, dark background",
        description: "反推图标生图提示词",
        suggestedFolder: null,
        tags: ["icon"],
      }),
    });

    await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={vi.fn()}
          onCreate={onCreate}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    await selectSavedImage(user);
    await user.click(screen.getByRole("button", { name: "开始反推" }));
    await screen.findByDisplayValue(
      "neon robot icon, blue glow, dark background",
    );
    await user.click(screen.getByRole("button", { name: "复制提示词" }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(
        "neon robot icon, blue glow, dark background",
      );
    });
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("shows a vision-model setup error instead of using legacy text config", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({ id: "created-prompt" });
    useSettingsStore.setState({
      aiProvider: "openai",
      aiApiProtocol: "openai",
      aiApiKey: "legacy-key",
      aiApiUrl: "https://legacy.example.com/v1",
      aiModel: "gpt-4o",
      aiModels: [
        {
          id: "normal-chat",
          type: "chat",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "normal-key",
          apiUrl: "https://normal.example.com/v1",
          model: "gpt-4o-mini",
        },
      ],
      scenarioModelDefaults: {
        imageReverse: "normal-chat",
      },
      modelRouteDefaults: {
        visionText: "normal-chat",
      },
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);

    await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={vi.fn()}
          onCreate={onCreate}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    await selectSavedImage(user);
    await user.click(screen.getByRole("button", { name: "开始反推" }));

    expect(
      await screen.findByText(
        "请先在设置的 AI 模型工作台中添加支持视觉输入的对话模型，并在视觉模型路由中选择它。",
      ),
    ).toBeInTheDocument();
    expect(chatCompletionMock).not.toHaveBeenCalled();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("shows a parse error when the vision model response is not a prompt draft", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({ id: "created-prompt" });
    chatCompletionMock.mockResolvedValue({
      content: "I can describe the image, but this is not JSON.",
    });

    await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={vi.fn()}
          onCreate={onCreate}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    await selectSavedImage(user);
    await user.click(screen.getByRole("button", { name: "开始反推" }));

    expect(await screen.findByText("无法解析 AI 响应")).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("shows a reverse failure when the vision model call rejects", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({ id: "created-prompt" });
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    chatCompletionMock.mockRejectedValue(new Error("network timeout"));

    await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={vi.fn()}
          onCreate={onCreate}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    await selectSavedImage(user);
    await user.click(screen.getByRole("button", { name: "开始反推" }));

    expect(await screen.findByText("图片提示词反推失败")).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Image prompt reverse generation failed:",
      expect.any(Error),
    );
    consoleErrorSpy.mockRestore();
  });
});
