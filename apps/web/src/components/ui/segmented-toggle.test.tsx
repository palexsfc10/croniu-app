import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";

describe("SegmentedToggle", () => {
  it("reflects the active state via aria-pressed and the filled style", () => {
    render(
      <SegmentedToggle active onClick={() => {}}>
        1x por semana
      </SegmentedToggle>,
    );
    const btn = screen.getByRole("button", { name: "1x por semana" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(btn).toHaveClass("bg-[var(--color-primary)]");
  });

  it("reflects the inactive state", () => {
    render(
      <SegmentedToggle active={false} onClick={() => {}}>
        Personalizar
      </SegmentedToggle>,
    );
    const btn = screen.getByRole("button", { name: "Personalizar" });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(btn).not.toHaveClass("bg-[var(--color-primary)]");
  });

  it("calls onClick when pressed", () => {
    const onClick = vi.fn();
    render(
      <SegmentedToggle active={false} onClick={onClick}>
        Seg
      </SegmentedToggle>,
    );
    screen.getByRole("button", { name: "Seg" }).click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("uses a square minimum width when square is set", () => {
    render(
      <SegmentedToggle active={false} onClick={() => {}} square>
        Seg
      </SegmentedToggle>,
    );
    expect(screen.getByRole("button", { name: "Seg" })).toHaveClass("min-w-11");
  });
});
