import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { ColumnConfig } from "../../../src/renderer/hooks/useTableConfig";
import { ColumnConfigMenu } from "../../../src/renderer/components/prompt/ColumnConfigMenu";

function makeColumns(): ColumnConfig[] {
  return [
    { id: "checkbox", label: "Checkbox", visible: true } as ColumnConfig,
    { id: "title", label: "prompt.title", visible: true } as ColumnConfig,
    { id: "tags", label: "prompt.tags", visible: false } as ColumnConfig,
    { id: "actions", label: "Actions", visible: true } as ColumnConfig,
  ];
}

describe("ColumnConfigMenu", () => {
  it("renders the trigger button closed by default", () => {
    render(
      <ColumnConfigMenu
        columns={makeColumns()}
        onToggleVisibility={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    // Trigger button is one button; menu is not in DOM yet.
    const triggerButton = screen.getByRole("button");
    expect(triggerButton).toBeInTheDocument();
    expect(screen.queryByText("prompt.title")).not.toBeInTheDocument();
  });

  it("opens the menu and lists configurable columns (excluding checkbox / actions)", () => {
    render(
      <ColumnConfigMenu
        columns={makeColumns()}
        onToggleVisibility={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    // 'title' and 'tags' should appear; 'Checkbox' and 'Actions' should not.
    expect(screen.getByText("prompt.title")).toBeInTheDocument();
    expect(screen.getByText("prompt.tags")).toBeInTheDocument();
    expect(screen.queryByText("Checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Actions")).not.toBeInTheDocument();
  });

  it("invokes onToggleVisibility with the column id", () => {
    const onToggleVisibility = vi.fn();
    render(
      <ColumnConfigMenu
        columns={makeColumns()}
        onToggleVisibility={onToggleVisibility}
        onReset={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("prompt.title"));
    expect(onToggleVisibility).toHaveBeenCalledWith("title");
  });

  it("invokes onReset and closes the menu when reset is clicked", () => {
    const onReset = vi.fn();
    render(
      <ColumnConfigMenu
        columns={makeColumns()}
        onToggleVisibility={vi.fn()}
        onReset={onReset}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    // Reset button is the only button with the rotate-ccw icon; we identify
    // by the i18n key 'common.reset'.
    fireEvent.click(screen.getByText("common.reset"));
    expect(onReset).toHaveBeenCalledTimes(1);
    // The menu should now be closed; configurable column entries gone.
    expect(screen.queryByText("prompt.title")).not.toBeInTheDocument();
  });
});
