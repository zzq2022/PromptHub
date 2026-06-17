import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ImportPromptModal } from "../../../src/renderer/components/prompt/ImportPromptModal";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { renderWithI18n } from "../../helpers/i18n";

describe("ImportPromptModal", () => {
  beforeEach(() => {
    // The modal calls usePromptStore().createPrompt which delegates to a
    // database service. Replace the action with a spy for these tests.
    usePromptStore.setState({
      createPrompt: vi.fn().mockImplementation(async (data) => ({
        id: "imported-1",
        ...data,
        currentVersion: 1,
        version: 1,
        usageCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
    });
  });

  it("returns null and renders nothing when data is null", async () => {
    const { container } = await renderWithI18n(
      <ImportPromptModal isOpen onClose={vi.fn()} data={null} />,
    );
    expect(container.querySelector("[role='dialog']")).toBeNull();
  });

  it("renders the preview body when given valid data", async () => {
    await renderWithI18n(
      <ImportPromptModal
        isOpen
        onClose={vi.fn()}
        data={{
          title: "Imported Prompt",
          description: "From clipboard",
          userPrompt: "Hello {{name}}",
          systemPrompt: "Be concise",
        }}
      />,
    );
    expect(screen.getByText("Imported Prompt")).toBeInTheDocument();
    expect(screen.getByText("From clipboard")).toBeInTheDocument();
    expect(screen.getByText("Hello {{name}}")).toBeInTheDocument();
    expect(screen.getByText("Be concise")).toBeInTheDocument();
  });

  it("invokes createPrompt with mapped fields and closes on success", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    await renderWithI18n(
      <ImportPromptModal
        isOpen
        onClose={onClose}
        data={{
          name: "Click Bait Title",
          description: "test",
          userPrompt: "do thing",
          tags: ["t1"],
        }}
      />,
    );

    const importButton = screen.getByRole("button", { name: /import/i });
    await user.click(importButton);

    await waitFor(() => {
      const createPromptSpy = usePromptStore.getState()
        .createPrompt as ReturnType<typeof vi.fn>;
      expect(createPromptSpy).toHaveBeenCalledTimes(1);
      const call = createPromptSpy.mock.calls[0][0];
      expect(call.title).toBe("Click Bait Title");
      expect(call.userPrompt).toBe("do thing");
      expect(call.tags).toEqual(["t1"]);
      expect(call.promptType).toBe("text");
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("uses 'image' promptType when imported data is an image prompt", async () => {
    const user = userEvent.setup();
    await renderWithI18n(
      <ImportPromptModal
        isOpen
        onClose={vi.fn()}
        data={{
          title: "Image Prompt",
          promptType: "image",
          userPrompt: "draw a fox",
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: /import/i }));

    await waitFor(() => {
      const createPromptSpy = usePromptStore.getState()
        .createPrompt as ReturnType<typeof vi.fn>;
      expect(createPromptSpy.mock.calls[0][0].promptType).toBe("image");
    });
  });

  it("does not close when createPrompt rejects", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    usePromptStore.setState({
      createPrompt: vi.fn().mockRejectedValue(new Error("DB down")),
    });

    // Suppress expected console.error from the catch block.
    const restore = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await renderWithI18n(
      <ImportPromptModal
        isOpen
        onClose={onClose}
        data={{ title: "x", userPrompt: "y" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: /import/i }));

    await waitFor(() => {
      const createPromptSpy = usePromptStore.getState()
        .createPrompt as ReturnType<typeof vi.fn>;
      expect(createPromptSpy).toHaveBeenCalled();
    });
    expect(onClose).not.toHaveBeenCalled();

    restore.mockRestore();
  });
});
