import { act, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FolderModal } from "../../../src/renderer/components/folder/FolderModal";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

describe("FolderModal", () => {
  beforeEach(() => {
    installWindowMocks();

    useFolderStore.setState({
      folders: [],
      createFolder: vi.fn().mockResolvedValue(undefined),
      updateFolder: vi.fn().mockResolvedValue(undefined),
      deleteFolder: vi.fn().mockResolvedValue(undefined),
    } as Partial<ReturnType<typeof useFolderStore.getState>>);

    usePromptStore.setState({
      prompts: [],
      updatePrompt: vi.fn().mockResolvedValue(undefined),
      deletePrompt: vi.fn().mockResolvedValue(undefined),
    } as Partial<ReturnType<typeof usePromptStore.getState>>);
  });

  it("renders as a portal attached to document.body", async () => {
    await act(async () => {
      await renderWithI18n(
        <div data-testid="sidebar-shell">
          <FolderModal isOpen={true} onClose={vi.fn()} />
        </div>,
        { language: "zh" },
      );
    });

    const title = screen.getByText("新建文件夹");
    const overlay = title.closest(".fixed.inset-0.z-50");
    const sidebarShell = screen.getByTestId("sidebar-shell");

    expect(overlay).not.toBeNull();
    expect(overlay?.parentElement).toBe(document.body);
    expect(sidebarShell).not.toContainElement(overlay);
  });
});
