import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SafeChatMarkdown } from "./safe-chat-markdown";

describe("SafeChatMarkdown", () => {
  it("renders bold without raw asterisks", () => {
    render(<SafeChatMarkdown text={"Serviço: **Aula padrão**"} />);
    expect(screen.getByText("Aula padrão").tagName).toBe("STRONG");
    expect(screen.queryByText(/\*\*Aula/)).toBeNull();
  });

  it("renders lists and line breaks", () => {
    const { container } = render(
      <SafeChatMarkdown
        text={"Itens:\n\n- um\n- dois\n\nLinha A\nLinha B"}
      />,
    );
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelectorAll("br").length).toBeGreaterThanOrEqual(1);
  });

  it("does not execute script tags as HTML", () => {
    const { container } = render(
      <SafeChatMarkdown text={'<script>alert(1)</script> **ok**'} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("ok").tagName).toBe("STRONG");
    expect(container.textContent).toContain("<script>");
  });

  it("only allows safe http(s) links", () => {
    const { container } = render(
      <SafeChatMarkdown
        text={"[site](https://croniu.example) e [x](javascript:alert(1))"}
      />,
    );
    const anchors = container.querySelectorAll("a");
    expect(anchors).toHaveLength(1);
    expect(anchors[0].getAttribute("href")).toBe("https://croniu.example");
  });
});
