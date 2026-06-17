import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  Collapsible,
  Pressable,
  Reveal,
  ViewTransition,
} from "../../../src/renderer/components/ui/motion";

describe("motion primitives", () => {
  describe("Pressable", () => {
    it("applies the press-in scale and instant duration by default", () => {
      render(<Pressable data-testid="btn">click</Pressable>);
      const btn = screen.getByTestId("btn");
      expect(btn).toHaveClass("transition-transform");
      expect(btn.className).toMatch(/duration-instant/);
      expect(btn.className).toMatch(/active:scale-press-in/);
    });

    it("forwards click events", () => {
      const handler = vi.fn();
      render(<Pressable onClick={handler}>x</Pressable>);
      fireEvent.click(screen.getByText("x"));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("opts out of the scale effect when disablePressEffect is set", () => {
      render(
        <Pressable data-testid="btn" disablePressEffect>
          x
        </Pressable>,
      );
      const btn = screen.getByTestId("btn");
      expect(btn.className).not.toMatch(/active:scale-press-in/);
    });
  });

  describe("Reveal", () => {
    it("uses fade-zoom enter classes by default", () => {
      render(<Reveal data-testid="reveal">x</Reveal>);
      const node = screen.getByTestId("reveal");
      expect(node.className).toMatch(/animate-in/);
      expect(node.className).toMatch(/fade-in/);
      expect(node.className).toMatch(/zoom-in-95/);
      expect(node.className).toMatch(/duration-base/);
      expect(node.className).toMatch(/ease-enter/);
    });

    it("switches to exit classes when intent is exit", () => {
      render(
        <Reveal data-testid="reveal" intent="exit" variant="fade-slide-down">
          x
        </Reveal>,
      );
      const node = screen.getByTestId("reveal");
      expect(node.className).toMatch(/animate-out/);
      expect(node.className).toMatch(/fade-out/);
      expect(node.className).toMatch(/slide-out-to-top-1/);
      expect(node.className).toMatch(/duration-quick/);
      expect(node.className).toMatch(/ease-exit/);
    });

    it("respects an explicit durationToken override", () => {
      render(
        <Reveal data-testid="reveal" durationToken="smooth">
          x
        </Reveal>,
      );
      expect(screen.getByTestId("reveal").className).toMatch(/duration-smooth/);
    });
  });

  describe("Collapsible", () => {
    it("emits open / closed states via data-state", () => {
      const { rerender } = render(
        <Collapsible data-testid="root" open={false}>
          <p>hidden</p>
        </Collapsible>,
      );
      const root = screen.getByTestId("root");
      expect(root).toHaveAttribute("data-state", "closed");
      expect(root.className).toMatch(/grid-rows-\[0fr\]/);
      expect(root).toHaveAttribute("aria-hidden", "true");

      rerender(
        <Collapsible data-testid="root" open>
          <p>visible</p>
        </Collapsible>,
      );
      expect(root).toHaveAttribute("data-state", "open");
      expect(root.className).toMatch(/grid-rows-\[1fr\]/);
      expect(root).not.toHaveAttribute("aria-hidden", "true");
    });
  });

  describe("ViewTransition", () => {
    it("remounts the child subtree when activeKey changes", () => {
      const { rerender } = render(
        <ViewTransition activeKey="list">
          <span>list-view</span>
        </ViewTransition>,
      );
      expect(screen.getByText("list-view")).toBeInTheDocument();

      rerender(
        <ViewTransition activeKey="gallery">
          <span>gallery-view</span>
        </ViewTransition>,
      );
      expect(screen.queryByText("list-view")).not.toBeInTheDocument();
      expect(screen.getByText("gallery-view")).toBeInTheDocument();
    });
  });
});
