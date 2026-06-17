import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BackgroundImageBackdrop } from "../../../src/renderer/components/ui/BackgroundImageBackdrop";

describe("BackgroundImageBackdrop", () => {
  it("applies opacity and blur from props", () => {
    const { container } = render(
      <BackgroundImageBackdrop
        src="https://example.com/wallpaper.jpg"
        opacity={0.5}
        blur={12}
        alt="Wall"
      />,
    );
    const backdrop = container.querySelector("[aria-hidden='true']") as HTMLElement;
    expect(backdrop).toBeTruthy();
    expect(backdrop.style.opacity).toBe("0.5");
    expect(backdrop.style.filter).toBe("blur(12px)");
    // Slight scale-up only when blur > 0 to avoid hard edges.
    expect(backdrop.style.transform).toBe("scale(1.03)");
  });

  it("omits scale when blur is 0", () => {
    const { container } = render(
      <BackgroundImageBackdrop
        src="https://example.com/wallpaper.jpg"
        opacity={1}
        blur={0}
        alt="Wall"
      />,
    );
    const backdrop = container.querySelector("[aria-hidden='true']") as HTMLElement;
    expect(backdrop.style.transform).toBe("");
  });

  it("renders both the image layer and the wallpaper blanket overlay", () => {
    const { container } = render(
      <BackgroundImageBackdrop
        src="https://example.com/wallpaper.jpg"
        opacity={0.8}
        blur={4}
        alt="Wall"
      />,
    );
    const ariaHidden = container.querySelectorAll("[aria-hidden='true']");
    // First is the image container, second is the blanket overlay.
    expect(ariaHidden.length).toBe(2);
    expect(ariaHidden[1].className).toContain("app-wallpaper-blanket");
  });
});
