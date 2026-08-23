import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccompanimentCard } from "@/components/app/accompaniment-card";

describe("AccompanimentCard — state is never plain unstyled text", () => {
  it("colors an urgent state (pending) as a warning badge, not a same-toned label as 'em dia'", () => {
    render(
      <AccompanimentCard
        icon={<span>i</span>}
        title="Rotinas"
        state="3 pendentes"
        stateTone="warning"
        summary="3 ocorrências aguardando ação."
      />,
    );
    const badge = screen.getByText("3 pendentes");
    expect(badge).toHaveClass("badge-warning");
    expect(badge).not.toHaveClass("badge-neutral");
  });

  it("colors an all-clear state as success", () => {
    render(
      <AccompanimentCard
        icon={<span>i</span>}
        title="Rotinas"
        state="Em dia"
        stateTone="success"
        summary="Nenhuma pendência de rotina para este aluno agora."
      />,
    );
    expect(screen.getByText("Em dia")).toHaveClass("badge-success");
  });

  it("defaults to neutral when no tone is given", () => {
    render(
      <AccompanimentCard icon={<span>i</span>} title="Plano" state="Vazio" summary="Plano ainda não criado" />,
    );
    expect(screen.getByText("Vazio")).toHaveClass("badge-neutral");
  });
});
