"use client";

import { useRef, useState } from "react";
import { apiFetch, type ClientIntakeLink } from "@/lib/api";
import { ActionSheet } from "@/components/ui/action-sheet";
import { Button } from "@/components/ui/button";
import { IconLink, IconWhatsApp } from "@/components/ui/icons";

type InviteState = "idle" | "loading" | "ready" | "error";

type Props = {
  clientId: string;
  label?: string;
};

export function ClientIntakeInviteButton({ clientId, label = "Enviar cadastro" }: Props) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<InviteState>("idle");
  const [link, setLink] = useState<ClientIntakeLink | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  async function ensureLink() {
    if (inFlight.current) return inFlight.current;
    const task = (async () => {
      setState("loading");
      const res = await apiFetch<ClientIntakeLink>(`/api/v1/clients/${clientId}/intake-link`, {
        method: "POST",
        body: "{}",
      });
      if (res.error || !res.data?.public_url) {
        setState("error");
        return;
      }
      setLink(res.data);
      setState("ready");
    })();
    inFlight.current = task;
    try {
      await task;
    } finally {
      inFlight.current = null;
    }
  }

  function openSheet() {
    setOpen(true);
    void ensureLink();
  }

  function sendWhatsApp() {
    if (!link?.wa_message_url) {
      setState("error");
      return;
    }
    window.open(link.wa_message_url, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <Button
        variant="secondary"
        className="min-h-11 whitespace-nowrap"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openSheet}
      >
        <IconLink className="mr-1.5 h-4 w-4" />
        {label}
      </Button>
      <ActionSheet open={open} onClose={() => setOpen(false)} labelledBy="client-invite-title">
        <h2 id="client-invite-title" className="text-base font-semibold text-[var(--color-ink)]">
          Envie o formulário para este aluno completar o cadastro
        </h2>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          O aluno abre o link, revisa os dados que você já cadastrou e conclui a anamnese.
        </p>

        {state === "loading" ? (
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">Preparando convite…</p>
        ) : null}

        {state === "error" ? (
          <div className="mt-3 space-y-2">
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              Não foi possível preparar o convite. Tente novamente.
            </p>
            <Button fullWidth variant="secondary" onClick={() => void ensureLink()}>
              Tentar novamente
            </Button>
          </div>
        ) : null}

        {state === "ready" && link ? (
          <div className="mt-3">
            <Button
              fullWidth
              onClick={sendWhatsApp}
              className="inline-flex items-center justify-center gap-2"
            >
              <IconWhatsApp className="h-5 w-5" aria-hidden />
              Enviar pelo WhatsApp
            </Button>
          </div>
        ) : null}
      </ActionSheet>
    </>
  );
}
