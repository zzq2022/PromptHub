import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CloseDialog } from "../../../src/renderer/components/ui/CloseDialog";

describe("CloseDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when closed", () => {
    render(<CloseDialog isOpen={false} onClose={vi.fn()} />);
    // Dialog content uses i18n keys; assert by querying actions buttons that
    // would be rendered when open.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("notifies main process and closes on cancel (X / backdrop / Esc)", () => {
    const onClose = vi.fn();
    const cancelMock = vi.fn();
    (window.electron as unknown as { sendCloseDialogCancel: typeof cancelMock })
      .sendCloseDialogCancel = cancelMock;

    const { container } = render(<CloseDialog isOpen onClose={onClose} />);
    expect(container.ownerDocument.body.querySelector(".max-w-sm")).toHaveClass(
      "animate-in",
    );
    expect(container.ownerDocument.body.querySelector(".max-w-sm")).toHaveClass(
      "zoom-in-95",
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    cancelMock.mockClear();
    onClose.mockClear();

    // Backdrop click also cancels.
    const backdrop = container.ownerDocument.body.querySelector(
      ".bg-background\\/60",
    );
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sends 'minimize' / 'exit' results with the rememberChoice flag", () => {
    const onClose = vi.fn();
    const sendResult = vi.fn();
    (window.electron as unknown as {
      sendCloseDialogResult: typeof sendResult;
    }).sendCloseDialogResult = sendResult;

    render(<CloseDialog isOpen onClose={onClose} />);

    // Buttons appear in DOM order: close (X), minimize, exit.
    const buttons = screen.getAllByRole("button");
    // Skip the X close button; minimize is next, exit follows.
    const minimizeButton = buttons[1];
    const exitButton = buttons[2];

    fireEvent.click(minimizeButton);
    expect(sendResult).toHaveBeenCalledWith("minimize", false);
    expect(onClose).toHaveBeenCalledTimes(1);

    sendResult.mockClear();
    onClose.mockClear();

    // Re-render to test exit.
    fireEvent.click(exitButton);
    expect(sendResult).toHaveBeenCalledWith("exit", false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
