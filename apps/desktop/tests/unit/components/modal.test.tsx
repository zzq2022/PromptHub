import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Modal } from "../../../src/renderer/components/ui/Modal";

/**
 * Modal is the foundation for nearly every modal surface in the app. The
 * failure modes that have shipped before are:
 *  - ESC closing modals that should not close (regression risk for unsaved-data dialogs)
 *  - Closing-from-backdrop firing twice
 *  - Body overflow style not being restored after close
 *  - Component never unmounting children when isOpen flips to false
 */
describe("Modal", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
  });

  it("does not render content when isOpen is false on first paint", () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()} title="Hidden">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.queryByText("Body")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });

  it("renders title, subtitle, and children when open", () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Edit prompt" subtitle="Update fields">
        <p>Modal body</p>
      </Modal>,
    );
    expect(screen.getByRole("heading", { name: "Edit prompt" })).toBeInTheDocument();
    expect(screen.getByText("Update fields")).toBeInTheDocument();
    expect(screen.getByText("Modal body")).toBeInTheDocument();
  });

  it("calls onClose when ESC is pressed", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="t">
        <p>x</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose on ESC when closeOnEscape is false", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="t" closeOnEscape={false}>
        <p>x</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("locks body scroll while open and restores it after close", async () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <Modal isOpen onClose={vi.fn()} title="t">
        <p>x</p>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <Modal isOpen={false} onClose={vi.fn()} title="t">
        <p>x</p>
      </Modal>,
    );

    // Modal cleanup happens after a 200ms unmount delay; advance through it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(220);
    });
    expect(document.body.style.overflow).toBe("");
  });

  it("calls onClose when backdrop is clicked by default", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal isOpen onClose={onClose} title="t">
        <p>x</p>
      </Modal>,
    );
    // The backdrop is the first absolute-inset div inside the portal.
    const backdrop = container.ownerDocument.body.querySelector(
      ".bg-background\\/60",
    );
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on backdrop click when closeOnBackdrop is false", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal isOpen onClose={onClose} title="t" closeOnBackdrop={false}>
        <p>x</p>
      </Modal>,
    );
    const backdrop = container.ownerDocument.body.querySelector(
      ".bg-background\\/60",
    );
    fireEvent.click(backdrop!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("hides the X close button when showCloseButton is false", () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="t" showCloseButton={false}>
        <p>x</p>
      </Modal>,
    );
    // The X close button is the only icon-only button in the header. With
    // showCloseButton off, there should be no buttons in the header at all
    // unless the test passes headerActions.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders headerActions next to the close button", () => {
    render(
      <Modal
        isOpen
        onClose={vi.fn()}
        title="t"
        headerActions={<button type="button">Save</button>}
      >
        <p>x</p>
      </Modal>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});
