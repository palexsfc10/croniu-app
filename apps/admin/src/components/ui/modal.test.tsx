import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/ui/modal";

describe("ConfirmDialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("moves focus into the dialog and closes on Escape", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Confirmar ação"
        description="Tem certeza?"
        confirmLabel="Confirmar"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "Confirmar" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not render anything when closed", () => {
    render(
      <ConfirmDialog
        open={false}
        title="Confirmar ação"
        confirmLabel="Confirmar"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("disables confirm and cancel while busy", () => {
    render(
      <ConfirmDialog
        open
        title="Excluindo"
        confirmLabel="Excluir"
        busy
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Excluir" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  });
});
