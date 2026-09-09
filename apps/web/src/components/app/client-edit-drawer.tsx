"use client";

import { useEffect, useRef, useState } from "react";
import type { Client } from "@/lib/api";
import { ClientEditForm } from "@/components/app/client-edit-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconX } from "@/components/ui/icons";

type Props = {
  open: boolean;
  client: Client;
  onClose: () => void;
  onSaved: (updated: Client) => void;
};

/**
 * Desktop's "Editar cliente" — a side panel over the Cliente 360°, which
 * stays visible and mounted behind it (no navigation happens), instead of
 * the old full page that replaced the whole screen. Mobile still uses the
 * standalone `/edit` page — see its own comment for why. Shares
 * `ClientEditForm` with that page so both save the exact same way.
 */
export function ClientEditDrawer({ open, client, onClose, onSaved }: Props) {
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  function requestClose() {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dirty]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Decorative — Escape and the header's own "Fechar" button already
          cover this action accessibly; a second identically-labeled
          control here would just be noise for keyboard/screen-reader
          navigation. */}
      <div aria-hidden className="absolute inset-0 bg-[var(--color-ink)]/35" onClick={requestClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-edit-drawer-title"
        tabIndex={-1}
        className="relative flex h-full w-full max-w-md flex-col overflow-hidden border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg animate-fade-up outline-none"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3.5">
          <h2 id="client-edit-drawer-title" className="text-base font-semibold text-[var(--color-ink)]">
            Editar cliente
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={requestClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-subtle)]"
          >
            <IconX className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <ClientEditForm
            client={client}
            onDirtyChange={setDirty}
            onSaved={(updated) => {
              setDirty(false);
              onSaved(updated);
            }}
          />
        </div>
      </div>
      <ConfirmDialog
        open={confirmDiscard}
        title="Descartar alterações?"
        description="Você tem alterações não salvas neste cadastro. Ao fechar agora, elas serão perdidas."
        confirmLabel="Descartar"
        confirmVariant="danger"
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          setDirty(false);
          onClose();
        }}
      />
    </div>
  );
}
