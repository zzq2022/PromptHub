import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CollapsibleThinking } from "../../../src/renderer/components/ui/CollapsibleThinking";

describe("CollapsibleThinking", () => {
  it("renders nothing when content is null and not loading", () => {
    const { container } = render(
      <CollapsibleThinking content={null} isLoading={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the trigger button when there is content", () => {
    render(<CollapsibleThinking content="Reasoning text" />);
    // The trigger is the only top-level button.
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("starts collapsed by default and expands on click", () => {
    render(<CollapsibleThinking content="Step 1\nStep 2" />);
    const trigger = screen.getByRole("button");
    const contentEl = trigger.parentElement!.querySelector(".overflow-hidden") as HTMLElement;

    expect(contentEl.className).toContain("max-h-0");
    expect(contentEl.className).toContain("opacity-0");

    fireEvent.click(trigger);

    expect(contentEl.className).toContain("max-h-60");
    expect(contentEl.className).toContain("opacity-100");
  });

  it("respects defaultExpanded", () => {
    render(<CollapsibleThinking content="x" defaultExpanded />);
    const trigger = screen.getByRole("button");
    const contentEl = trigger.parentElement!.querySelector(".overflow-hidden") as HTMLElement;
    expect(contentEl.className).toContain("max-h-60");
  });

  it("auto-expands when loading starts with content", () => {
    const { rerender } = render(
      <CollapsibleThinking content="" isLoading={false} />,
    );
    const trigger = screen.getByRole("button");
    const contentEl = trigger.parentElement!.querySelector(".overflow-hidden") as HTMLElement;
    expect(contentEl.className).toContain("max-h-0");

    rerender(<CollapsibleThinking content="streaming" isLoading />);
    expect(contentEl.className).toContain("max-h-60");
  });

  it("shows character count when content is non-empty", () => {
    render(<CollapsibleThinking content="abc" />);
    expect(screen.getByText(/^3\b/)).toBeInTheDocument();
  });
});
