import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { UnsavedChangesDialog } from "../../../src/renderer/components/ui/UnsavedChangesDialog";

describe("UnsavedChangesDialog", () => {
  it("does not render when closed", () => {
    render(
      <UnsavedChangesDialog
        isOpen={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.queryByText(/未保存的更改|Unsaved/i)).not.toBeInTheDocument();
  });

  it("wires up the three actions independently", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    render(
      <UnsavedChangesDialog
        isOpen
        onClose={onClose}
        onSave={onSave}
        onDiscard={onDiscard}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(3);
    const [cancelButton, discardButton, saveButton] = buttons;

    fireEvent.click(cancelButton);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();

    fireEvent.click(discardButton);
    expect(onDiscard).toHaveBeenCalledTimes(1);

    fireEvent.click(saveButton);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("Escape key triggers cancel callback", () => {
    const onClose = vi.fn();
    render(
      <UnsavedChangesDialog
        isOpen
        onClose={onClose}
        onSave={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("focuses the save button when the dialog opens", () => {
    vi.useFakeTimers();
    render(
      <UnsavedChangesDialog
        isOpen
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(100);
    });
    const buttons = screen.getAllByRole("button");
    const saveButton = buttons[2];
    expect(document.activeElement).toBe(saveButton);
  });
});
