"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, type Client, type ClientAccess } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ContextualBar } from "@/components/app/contextual-bar";
import { ClientEvaluationsSection } from "@/components/app/client-evaluations-section";
import { BackLink } from "@/components/app/back-link";
import { TextField } from "@/components/ui/text-field";

export default function ClientDetailPage() {
  const params = useParams<{ clientId: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Client | null>(null);
  const [access, setAccess] = useState<ClientAccess | null>(null);
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [waMessage, setWaMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const loadAccess = useCallback(async () => {
    const result = await apiFetch<ClientAccess>(
      `/api/v1/clients/${params.clientId}/public-access`,
    );
    if (result.data) setAccess(result.data);
  }, [params.clientId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<Client>(`/api/v1/clients/${params.clientId}`);
      if (cancelled) return;
      if (result.error) setError(result.error.message);
      else setItem(result.data ?? null);
      await loadAccess();
    })();
    return () => {
      cancelled = true;
    };
  }, [params.clientId, loadAccess]);

  async function archive() {
    if (!item) return;
    const result = await apiFetch<Client>(`/api/v1/clients/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "archived" }),
    });
    if (result.error) {
      setError(result.error.message);
      return;
    }
    router.replace("/app/clients");
  }

  async function createOrRotate(rotate: boolean) {
    setError(null);
    setInfo(null);
    if (rotate) {
      const ok = window.confirm(
        "Gerar um novo link invalida o link atual. O cliente precisará do novo endereço.",
      );
      if (!ok) return;
    }
    const path = rotate
      ? `/api/v1/clients/${params.clientId}/public-access/rotate`
      : `/api/v1/clients/${params.clientId}/public-access`;
    const result = await apiFetch<ClientAccess>(path, { method: "POST", body: "{}" });
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setAccess(result.data ?? null);
    setRawToken(result.data?.token ?? null);
    setWaMessage(result.data?.wa_message_template ?? "");
    setInfo(
      "Link gerado. Copie agora — o token completo não será mostrado novamente.",
    );
  }

  async function revoke() {
    if (!window.confirm("Revogar o acesso do cliente a este link?")) return;
    const result = await apiFetch<ClientAccess>(
      `/api/v1/clients/${params.clientId}/public-access`,
      { method: "DELETE" },
    );
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setAccess(result.data ?? null);
    setRawToken(null);
    setInfo("Link revogado.");
  }

  async function copyLink() {
    const url = rawToken
      ? access?.public_url || `${window.location.origin}/c/${rawToken}`
      : null;
    if (!url) {
      setInfo("Gere um novo link para copiar o endereço completo.");
      return;
    }
    await navigator.clipboard.writeText(url);
    setInfo("Link copiado.");
  }

  function shareWhatsApp() {
    const text = encodeURIComponent(waMessage || "Acesse seu ciclo no Croniu.");
    const phone = (item?.phone || "").replace(/\D/g, "");
    const url = phone
      ? `https://wa.me/55${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <ContextualBar label={item ? `Cliente · ${item.full_name}` : null} />
      <BackLink href="/app/clients" label="Clientes" />
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {info ? (
        <p role="status" className="text-sm text-[var(--color-ink-muted)]">
          {info}
        </p>
      ) : null}
      {item ? (
        <>
          <h1 className="h-display text-3xl text-[var(--color-ink)]">{item.full_name}</h1>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-[var(--color-ink-muted)]">Telefone</dt>
              <dd>{item.phone || "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-ink-muted)]">E-mail</dt>
              <dd>{item.email || "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-ink-muted)]">Observações</dt>
              <dd>{item.notes || "—"}</dd>
            </div>
          </dl>

          <section
            aria-label="Acesso do cliente"
            className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          >
            <h2 className="text-base font-semibold">Acesso do cliente</h2>
            <p className="text-sm text-[var(--color-ink-muted)]">
              Link secreto para o Meu Ciclo. Trate como senha compartilhável.
            </p>
            <p className="text-sm">
              {access?.has_active_link
                ? "Há um link ativo."
                : "Nenhum link ativo."}
            </p>
            {!access?.has_active_link ? (
              <Button fullWidth onClick={() => void createOrRotate(false)}>
                Criar link
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <Button fullWidth onClick={() => void copyLink()}>
                  Copiar link
                </Button>
                {rawToken ? (
                  <a href={`/c/${rawToken}`} target="_blank" rel="noopener noreferrer" className="block">
                    <Button fullWidth>Abrir</Button>
                  </a>
                ) : null}
                {rawToken || waMessage ? (
                  <>
                    <TextField
                      label="Mensagem WhatsApp (editável)"
                      value={waMessage}
                      onChange={(e) => setWaMessage(e.target.value)}
                    />
                    <Button variant="secondary" fullWidth onClick={shareWhatsApp}>
                      Compartilhar pelo WhatsApp
                    </Button>
                  </>
                ) : null}
                <Button variant="secondary" fullWidth onClick={() => void createOrRotate(true)}>
                  Gerar novo link
                </Button>
                <Button variant="secondary" fullWidth onClick={() => void revoke()}>
                  Revogar
                </Button>
              </div>
            )}
          </section>

          <ClientEvaluationsSection clientId={item.id} />

          <div className="flex flex-col gap-3 pb-2">
            <Link href={`/app/cycles/new?clientId=${item.id}`} className="block">
              <Button fullWidth>Criar ciclo</Button>
            </Link>
            {item.status === "active" ? (
              <Button fullWidth onClick={() => void archive()}>
                Arquivar cliente
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
      )}
    </div>
  );
}
