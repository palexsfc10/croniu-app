"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  apiFetch,
  type Client,
  type ClientAccess,
  type ClientJourney,
  type PrepareStartResult,
  type Protocol,
} from "@/lib/api";
import {
  EVALUATION_DECISION_OPTIONS,
  PROTOCOL_DECISION_OPTIONS,
} from "@/lib/intake";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ContextualBar } from "@/components/app/contextual-bar";
import { ClientEvaluationsSection } from "@/components/app/client-evaluations-section";
import { BackLink } from "@/components/app/back-link";
import { TextField } from "@/components/ui/text-field";
import { TextArea } from "@/components/ui/text-area";

export default function ClientDetailPage() {
  const params = useParams<{ clientId: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Client | null>(null);
  const [access, setAccess] = useState<ClientAccess | null>(null);
  const [journey, setJourney] = useState<ClientJourney | null>(null);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [waMessage, setWaMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [protocolTitle, setProtocolTitle] = useState("");
  const [protocolNotes, setProtocolNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const loadAccess = useCallback(async () => {
    const result = await apiFetch<ClientAccess>(
      `/api/v1/clients/${params.clientId}/public-access`,
    );
    if (result.data) setAccess(result.data);
  }, [params.clientId]);

  const loadJourney = useCallback(async () => {
    const result = await apiFetch<ClientJourney>(
      `/api/v1/clients/${params.clientId}/journey`,
    );
    if (result.data) setJourney(result.data);
  }, [params.clientId]);

  const loadProtocols = useCallback(async () => {
    const result = await apiFetch<Protocol[]>(
      `/api/v1/protocols?client_id=${params.clientId}`,
    );
    if (result.data) setProtocols(result.data);
  }, [params.clientId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<Client>(`/api/v1/clients/${params.clientId}`);
      if (cancelled) return;
      if (result.error) setError(result.error.message);
      else setItem(result.data ?? null);
      await Promise.all([loadAccess(), loadJourney(), loadProtocols()]);
    })();
    return () => {
      cancelled = true;
    };
  }, [params.clientId, loadAccess, loadJourney, loadProtocols]);

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

  async function setEvaluationDecision(decision: string) {
    setBusy(true);
    setError(null);
    const result = await apiFetch<ClientJourney>(
      `/api/v1/clients/${params.clientId}/journey/evaluation-decision`,
      { method: "POST", body: JSON.stringify({ decision }) },
    );
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setJourney(result.data ?? null);
    setInfo("Decisão de avaliação atualizada.");
  }

  async function setProtocolDecision(decision: string) {
    setBusy(true);
    setError(null);
    const result = await apiFetch<ClientJourney>(
      `/api/v1/clients/${params.clientId}/journey/protocol-decision`,
      { method: "POST", body: JSON.stringify({ decision }) },
    );
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setJourney(result.data ?? null);
    setInfo("Decisão de protocolo atualizada.");
  }

  async function prepareStart() {
    setBusy(true);
    setError(null);
    const result = await apiFetch<PrepareStartResult>(
      `/api/v1/clients/${params.clientId}/prepare-start`,
      { method: "POST", body: "{}" },
    );
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setInfo(
      result.data?.ready
        ? "Pronto para iniciar o acompanhamento."
        : "Checklist atualizado — ainda há pendências.",
    );
    await loadJourney();
  }

  async function createProtocol() {
    if (!protocolTitle.trim()) {
      setError("Informe o título do protocolo.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await apiFetch<Protocol>("/api/v1/protocols", {
      method: "POST",
      body: JSON.stringify({
        title: protocolTitle.trim(),
        protocol_type: "free",
        client_id: params.clientId,
        content_json: { notes: protocolNotes.trim() || "" },
        private_notes: null,
      }),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setProtocolTitle("");
    setProtocolNotes("");
    setInfo("Protocolo criado como rascunho.");
    await loadProtocols();
  }

  async function publishProtocol(protocolId: string) {
    if (!window.confirm("Publicar este protocolo para o cliente?")) return;
    setBusy(true);
    setError(null);
    const result = await apiFetch<Protocol>(`/api/v1/protocols/${protocolId}/publish`, {
      method: "POST",
      body: "{}",
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setInfo("Protocolo publicado.");
    await Promise.all([loadProtocols(), loadJourney()]);
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

          {journey ? (
            <section
              aria-label="Jornada do aluno"
              className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">Jornada</h2>
                <Badge tone="info">{journey.stage_label}</Badge>
                {journey.requires_professional_attention ? (
                  <Badge tone="warning">Atenção</Badge>
                ) : null}
              </div>
              {journey.next_action ? (
                <p className="text-sm text-[var(--color-ink-muted)]">
                  Próximo: {journey.next_action}
                </p>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block space-y-1 text-sm">
                  <span className="font-medium">Avaliação</span>
                  <select
                    className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
                    value={journey.evaluation_decision ?? ""}
                    disabled={busy}
                    onChange={(e) => {
                      if (e.target.value) void setEvaluationDecision(e.target.value);
                    }}
                  >
                    <option value="">Definir…</option>
                    {EVALUATION_DECISION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="font-medium">Protocolo</span>
                  <select
                    className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
                    value={journey.protocol_decision ?? ""}
                    disabled={busy}
                    onChange={(e) => {
                      if (e.target.value) void setProtocolDecision(e.target.value);
                    }}
                  >
                    <option value="">Definir…</option>
                    {PROTOCOL_DECISION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex flex-col gap-2">
                <Button fullWidth disabled={busy} onClick={() => void prepareStart()}>
                  Preparar início
                </Button>
                <Link href={`/app/clients/${item.id}#protocols`} className="block">
                  <Button fullWidth variant="secondary">
                    Criar / ver protocolos
                  </Button>
                </Link>
              </div>
            </section>
          ) : null}

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

          <section
            id="protocols"
            aria-label="Protocolos"
            className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          >
            <h2 className="text-base font-semibold">Protocolos</h2>
            <TextField
              label="Título"
              value={protocolTitle}
              onChange={(e) => setProtocolTitle(e.target.value)}
            />
            <TextArea
              label="Conteúdo (visível ao publicar)"
              value={protocolNotes}
              onChange={(e) => setProtocolNotes(e.target.value)}
              rows={3}
            />
            <Button fullWidth disabled={busy} onClick={() => void createProtocol()}>
              Criar protocolo
            </Button>
            <ul className="space-y-2">
              {protocols.map((p) => (
                <li
                  key={p.id}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{p.title}</p>
                    <Badge tone={p.status === "published" ? "success" : "neutral"}>
                      {p.status}
                    </Badge>
                    <span className="text-xs text-[var(--color-ink-muted)]">
                      v{p.current_version_number}
                    </span>
                  </div>
                  {p.status !== "published" ? (
                    <Button
                      className="mt-2"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void publishProtocol(p.id)}
                    >
                      Publicar
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            {!protocols.length ? (
              <p className="text-sm text-[var(--color-ink-muted)]">Nenhum protocolo ainda.</p>
            ) : null}
          </section>

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
