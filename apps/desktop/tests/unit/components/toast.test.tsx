import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToastProvider, useToast } from "../../../src/renderer/components/ui/Toast";

function ToastTrigger({ messages }: { messages: Array<[string, "success" | "error" | "info" | "warning"]> }) {
  const { showToast } = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        messages.forEach(([msg, type]) => showToast(msg, type));
      }}
    >
      Trigger
    </button>
  );
}

describe("ToastProvider / useToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("renders a toast via showToast", () => {
    render(
      <ToastProvider>
        <ToastTrigger messages={[["Saved", "success"]]} />
      </ToastProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "Trigger" }).click();
    });
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("auto-dismisses a toast after the configured duration", async () => {
    render(
      <ToastProvider>
        <ToastTrigger messages={[["Auto", "info"]]} />
      </ToastProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "Trigger" }).click();
    });
    expect(screen.getByText("Auto")).toBeInTheDocument();

    // Auto-dismiss kicks off after 3s; allow exit animation slack too.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(screen.queryByText("Auto")).not.toBeInTheDocument();
  });

  it("does not assign duplicate ids when multiple toasts fire in the same tick", () => {
    const messages: Array<[string, "success" | "error" | "info" | "warning"]> = [
      ["First", "success"],
      ["Second", "info"],
      ["Third", "warning"],
    ];

    render(
      <ToastProvider>
        <ToastTrigger messages={messages} />
      </ToastProvider>,
    );

    act(() => {
      screen.getByRole("button", { name: "Trigger" }).click();
    });

    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByText("Third")).toBeInTheDocument();
  });

  it("throws if useToast is called outside the provider", () => {
    const Bad = () => {
      useToast();
      return null;
    };
    // Suppress React's expected console.error for thrown render.
    const restore = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Bad />)).toThrow(/ToastProvider/);
    restore.mockRestore();
  });
});
