import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
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

  it("renders through a portal into document.body, not inside the local render container", () => {
    const { container } = render(
      <ActionSheet open onClose={vi.fn()} labelledBy="t">
        <h2 id="t">Title</h2>
      </ActionSheet>,
    );
    // The render container only ever gets whatever the component returns
    // inline — a portaled node is NOT a descendant of it.
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("renders the optional footer alongside the scrollable body", () => {
    render(
      <ActionSheet
        open
        onClose={vi.fn()}
        labelledBy="t"
        footer={<button type="button">Ação primária</button>}
      >
        <h2 id="t">Title</h2>
      </ActionSheet>,
    );
    expect(screen.getByRole("button", { name: "Ação primária" })).toBeInTheDocument();
  });

  it("omits the footer region entirely when none is given", () => {
    const { container } = render(
      <ActionSheet open onClose={vi.fn()} labelledBy="t">
        <h2 id="t">Title</h2>
      </ActionSheet>,
    );
    // No stray empty footer wrapper left in the DOM.
    expect(container.ownerDocument.body.querySelectorAll(".border-t").length).toBe(0);
  });

  it("locks body scroll while open and restores the PREVIOUS value (not just empty) on close", () => {
    document.body.style.overflow = "scroll"; // simulate a page that already set something
    const { rerender } = render(
      <ActionSheet open onClose={vi.fn()} labelledBy="t">
        content
      </ActionSheet>,
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <ActionSheet open={false} onClose={vi.fn()} labelledBy="t">
        content
      </ActionSheet>,
    );
    expect(document.body.style.overflow).toBe("scroll");
    document.body.style.overflow = "";
  });

  it("restores body scroll on unmount while still open (not just on close)", () => {
    document.body.style.overflow = "auto";
    const { unmount } = render(
      <ActionSheet open onClose={vi.fn()} labelledBy="t">
        content
      </ActionSheet>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("auto");
    document.body.style.overflow = "";
  });

  it("moves focus into the dialog on open and restores it to the trigger on close", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Abrir
          </button>
          <ActionSheet open={open} onClose={() => setOpen(false)} labelledBy="t">
            <h2 id="t">Title</h2>
          </ActionSheet>
        </div>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Abrir" });
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("supports opening, closing, and reopening the same sheet instance repeatedly", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Abrir
          </button>
          <ActionSheet open={open} onClose={() => setOpen(false)} labelledBy="t">
            <h2 id="t">Title</h2>
          </ActionSheet>
        </div>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Abrir" });

    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(trigger);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    }
    // Body scroll ends up unlocked, not stuck from a previous open/close.
    expect(document.body.style.overflow).toBe("");
  });

  it("unmounting while open doesn't throw and leaves no orphaned portal node or listener", () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <ActionSheet open onClose={onClose} labelledBy="t">
        <h2 id="t">Title</h2>
      </ActionSheet>,
    );
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();

    expect(() => unmount()).not.toThrow();

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    // The keydown listener registered on `document` while open must be
    // gone too — Escape after unmount must not call a now-stale onClose.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not leave the previous portal node behind when toggled closed then open again", async () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <ActionSheet open={open} onClose={() => setOpen(false)} labelledBy="t">
          <h2 id="t">Title</h2>
        </ActionSheet>
      );
    }
    render(<Harness />);
    expect(document.body.querySelectorAll('[role="dialog"]').length).toBe(1);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(document.body.querySelectorAll('[role="dialog"]').length).toBe(0);
    });
  });
});
