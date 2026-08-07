import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProposalCard } from "@/components/app/assistant/proposal-card";

describe("ProposalCard", () => {
  afterEach(() => cleanup());

  const pending = {
    id: "p1",
    tool_name: "propose_create_appointment",
    summary: "Aula com Juliana amanhã às 08:00",
    summary_fields: { Cliente: "Juliana", Horário: "08:00" },
    arguments: {},
    expires_at: new Date().toISOString(),
    risk_class: "write_common",
  };

  it("shows confirm actions only while pending", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <ProposalCard
        pending={pending}
        actionStatus="pending"
        busy={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText("Novo compromisso")).toBeInTheDocument();
    expect(screen.getByText("Aguardando sua confirmação")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    rerender(
      <ProposalCard
        pending={pending}
        actionStatus="executed"
        busy={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
    expect(screen.getByText("Ação concluída")).toBeInTheDocument();
  });

  it("disables actions while busy/executing", () => {
    render(
      <ProposalCard
        pending={pending}
        actionStatus="pending"
        busy
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "Confirmando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  });
});
