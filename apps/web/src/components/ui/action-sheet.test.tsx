import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionSheet } from "@/components/ui/action-sheet";

describe("ActionSheet", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when closed", () => {
    render(
      <ActionSheet open={false} onClose={vi.fn()} labelledBy="t">
        content
      </ActionSheet>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders as a modal dialog when open", () => {
    render(
      <ActionSheet open onClose={vi.fn()} labelledBy="t">
        <h2 id="t">Title</h2>
      </ActionSheet>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "t");
  });

  it("calls onClose on backdrop click but not on inner content click", () => {
    const onClose = vi.fn();
    render(
      <ActionSheet open onClose={onClose} labelledBy="t">
        <button type="button">Inside</button>
      </ActionSheet>,
    );
    fireEvent.click(screen.getByText("Inside"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(
      <ActionSheet open onClose={onClose} labelledBy="t">
        content
      </ActionSheet>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not listen for Escape while closed", () => {
    const onClose = vi.fn();
    render(
      <ActionSheet open={false} onClose={onClose} labelledBy="t">
        content
      </ActionSheet>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
