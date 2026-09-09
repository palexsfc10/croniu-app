import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@/lib/api";
import { ClientEditDrawer } from "@/components/app/client-edit-drawer";

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: fetchMock };
});

const CLIENT = {
  id: "c1",
  full_name: "Pedro Silva",
  phone: "11987654321",
  email: "pedro@example.com",
  notes: "",
  status: "active",
} as unknown as Client;

describe("ClientEditDrawer — desktop's inline panel over Cliente 360°", () => {
  afterEach(() => {
    cleanup();
    fetchMock.mockReset();
  });

  it("renders nothing when closed", () => {
    render(
      <ClientEditDrawer open={false} client={CLIENT} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the same fields as the standalone edit page, prefilled", () => {
    render(<ClientEditDrawer open client={CLIENT} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Editar cliente" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Pedro Silva")).toBeInTheDocument();
    expect(screen.getByDisplayValue("11987654321")).toBeInTheDocument();
    expect(screen.getByDisplayValue("pedro@example.com")).toBeInTheDocument();
  });

  it("closes immediately when there are no unsaved edits", () => {
    const onClose = vi.fn();
    render(<ClientEditDrawer open client={CLIENT} onClose={onClose} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Descartar alterações/)).not.toBeInTheDocument();
  });

  it("asks for confirmation instead of silently discarding real edits — protects against losing changes", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ClientEditDrawer open client={CLIENT} onClose={onClose} onSaved={vi.fn()} />);
    const nameField = screen.getByDisplayValue("Pedro Silva");
    await user.type(nameField, " Jr.");

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/Descartar alterações/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("also honors Escape, with the same discard confirmation when dirty", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ClientEditDrawer open client={CLIENT} onClose={onClose} onSaved={vi.fn()} />);
    await user.type(screen.getByDisplayValue("Pedro Silva"), " Jr.");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/Descartar alterações/)).toBeInTheDocument();
  });

  it("saves through the same PATCH endpoint the standalone page uses, then reports the updated client", async () => {
    fetchMock.mockResolvedValue({ data: { ...CLIENT, full_name: "Pedro S. Silva" } });
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<ClientEditDrawer open client={CLIENT} onClose={vi.fn()} onSaved={onSaved} />);
    const nameField = screen.getByDisplayValue("Pedro Silva");
    await user.clear(nameField);
    await user.type(nameField, "Pedro S. Silva");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/clients/c1",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ full_name: "Pedro S. Silva" }));
  });
});
