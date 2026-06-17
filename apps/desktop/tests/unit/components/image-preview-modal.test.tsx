import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ImagePreviewModal } from "../../../src/renderer/components/ui/ImagePreviewModal";

describe("ImagePreviewModal", () => {
  it("renders nothing when closed", () => {
    render(
      <ImagePreviewModal
        isOpen={false}
        onClose={vi.fn()}
        imageSrc="/path.png"
      />,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders nothing when imageSrc is null", () => {
    render(<ImagePreviewModal isOpen onClose={vi.fn()} imageSrc={null} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders the image when open with a src", () => {
    render(
      <ImagePreviewModal isOpen onClose={vi.fn()} imageSrc="https://example.com/x.png" />,
    );
    const img = screen.getByRole("img");
    expect(img).toBeInTheDocument();
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(
      <ImagePreviewModal isOpen onClose={onClose} imageSrc="https://example.com/x.png" />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("falls back to an error placeholder when the image fails to load", () => {
    render(
      <ImagePreviewModal isOpen onClose={vi.fn()} imageSrc="https://example.com/x.png" />,
    );
    const img = screen.getByRole("img");
    fireEvent.error(img);
    // After error, the img is unmounted in favor of the placeholder.
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
