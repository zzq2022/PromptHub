import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { PromptListHeader } from "../../../src/renderer/components/prompt/PromptListHeader";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";

function resetStore() {
  // Reset only the slice fields the header reads / writes — calling actions
  // directly rather than poking internals.
  const store = usePromptStore.getState();
  store.setViewMode("card");
  store.setSortBy("updatedAt");
  store.setSortOrder("desc");
  store.setGalleryImageSize("medium");
  store.setKanbanColumns(3);
}

describe("PromptListHeader", () => {
  beforeEach(() => {
    resetStore();
  });

  it("shows the prompt count", () => {
    render(<PromptListHeader count={42} />);
    // The count is interpolated through i18n; assert the number appears.
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });

  it("opens the sort menu and selects a different option", () => {
    render(<PromptListHeader count={3} />);
    // The summary button shows the currently-selected sort label.
    const triggerButton = screen.getByText(/prompt\.sortNewest|最新|Newest|最近更新/i)
      .closest("button");
    expect(triggerButton).toBeTruthy();
    fireEvent.click(triggerButton!);

    // The "title asc" option should now be visible.
    const titleAscOption = screen.getByText(/prompt\.sortTitleAsc|A-Z|标题/i);
    fireEvent.click(titleAscOption);

    expect(usePromptStore.getState().sortBy).toBe("title");
    expect(usePromptStore.getState().sortOrder).toBe("asc");
  });

  it("switches view mode to gallery and reveals the size picker", () => {
    render(<PromptListHeader count={1} />);
    const galleryToggle = screen
      .getAllByRole("button")
      // Gallery has the Image lucide icon; we identify it by the gallery
      // mode title text on hover.
      .find((btn) => btn.getAttribute("title")?.match(/gallery|图片/i));

    expect(galleryToggle).toBeTruthy();
    fireEvent.click(galleryToggle!);

    expect(usePromptStore.getState().viewMode).toBe("gallery");

    // S / M / L size buttons appear when in gallery mode.
    expect(screen.getByText("S")).toBeInTheDocument();
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText("L")).toBeInTheDocument();
  });

  it("switches view mode to kanban and reveals the column picker", () => {
    render(<PromptListHeader count={1} />);
    const kanbanToggle = screen
      .getAllByRole("button")
      .find((btn) => btn.getAttribute("title")?.match(/kanban|看板/i));

    expect(kanbanToggle).toBeTruthy();
    fireEvent.click(kanbanToggle!);

    expect(usePromptStore.getState().viewMode).toBe("kanban");

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });
});
