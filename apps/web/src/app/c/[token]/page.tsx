"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatBRL, formatDateBR, type PublicMyCycle } from "@/lib/api";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { EvolutionEntry } from "@/components/app/evolution-entry";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TextField } from "@/components/ui/text-field";

const STATUS_LABEL: Record<string, string> = {
  vigente: "Ciclo em andamento",
  encerrando: "Ciclo perto do fim",
  encerrado: "Ciclo encerrado",
  proximo: "Próximo ciclo",
};

const STATUS_TONE: Record<string, "progress" | "warning" | "neutral" | "info"> = {
  vigente: "progress",
  encerrando: "warning",
  encerrado: "neutral",
  proximo: "info",
};

const PAY_LABEL: Record<string, string> = {
  pendente: "Pagamento pendente",
  confirmado: "Pagamento confirmado",
  aguardando_confirmacao: "Pagamento informado — aguardando confirmação",
  nao_confirmado: "Pagamento ainda não confirmado",
  sem_cobranca: "Sem cobrança vinculada",
};

const PAY_TONE: Record<string, "warning" | "success" | "neutral"> = {
  pendente: "warning",
  confirmado: "success",
  aguardando_confirmacao: "warning",
  nao_confirmado: "warning",
  sem_cobranca: "neutral",
};

export default function PublicMyCyclePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [data, setData] = useState<PublicMyCycle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renewConfirm, setRenewConfirm] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [methodNote, setMethodNote] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setError(null);
      const res = await fetch(`/api/v1/public/my-cycle/${token}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const body = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setError(body.message || "Este acesso não está disponível.");
        setData(null);
        return;
      }
      setData(body as PublicMyCycle);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function reload() {
    setError(null);
    const res = await fetch(`/api/v1/public/my-cycle/${token}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.message || "Este acesso não está disponível.");
      setData(null);
      return;
    }
    setData(body as PublicMyCycle);
  }

  async function requestRenewal() {
    setBusy(true);
    setFlash(null);
    const res = await fetch(`/api/v1/public/my-cycle/${token}/renewal`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    const body = await res.json();
    setBusy(false);
    setRenewConfirm(false);
    if (!res.ok) {
      setError(body.message || "Não foi possível enviar.");
      return;
    }
    setFlash(body.message);
    await reload();
  }

  async function reportPayment() {
    setBusy(true);
    setFlash(null);
    const form = new FormData();
    if (methodNote.trim()) form.append("method_note", methodNote.trim());
    if (notes.trim()) form.append("notes", notes.trim());
    if (file) form.append("proof", file);
    const res = await fetch(`/api/v1/public/my-cycle/${token}/payment-report`, {
      method: "POST",
      body: form,
      headers: { Accept: "application/json" },
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.message || "Não foi possível informar o pagamento.");
      return;
    }
    setPayOpen(false);
    setFlash(body.message);
    await reload();
  }

  return (
    <div className="min-h-dvh bg-[linear-gradient(165deg,var(--color-bg)_0%,var(--color-progress-subtle)_42%,var(--color-primary-subtle)_100%)]">
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
        <header className="mb-8 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-[var(--color-ink-muted)]">Meu Ciclo</p>
            {data ? (
              <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">
                Olá, {data.client_first_name}
              </h1>
            ) : (
              <h1 className="mt-1 text-2xl text-[var(--color-ink)]">Acesso</h1>
            )}
          </div>
          <BrandWordmark size="md" />
        </header>

        {error ? (
          <p
            role="alert"
            className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/25 bg-[var(--color-danger-subtle)] px-4 py-4 text-sm text-[var(--color-danger)]"
          >
            {error}
          </p>
        ) : null}
        {flash ? (
          <p
            role="status"
            className="mb-3 rounded-[var(--radius-md)] border border-[var(--color-success)]/20 bg-[var(--color-success-subtle)] px-3 py-2 text-sm text-[var(--color-success)]"
          >
            {flash}
          </p>
        ) : null}

        {!data && !error ? (
          <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
        ) : null}

        {data ? (
          <div className="space-y-5">
            <p className="text-sm text-[var(--color-ink-muted)]">
              Com {data.professional_display_name}
            </p>

            {data.empty_message || !data.cycle ? (
              <p className="text-base text-[var(--color-ink)]">{data.empty_message}</p>
            ) : (
              <>
                <section
                  className={[
                    "space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4",
                    data.cycle.status_summary === "encerrando"
                      ? "card-rail card-rail-warning"
                      : data.cycle.status_summary === "vigente"
                        ? "card-rail card-rail-progress"
                        : "",
                  ].join(" ")}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-[var(--color-ink)]">
                      {STATUS_LABEL[data.cycle.status_summary] ?? data.cycle.status_summary}
                    </h2>
                    <Badge tone={STATUS_TONE[data.cycle.status_summary] ?? "neutral"}>
                      {STATUS_LABEL[data.cycle.status_summary] ?? data.cycle.status_summary}
                    </Badge>
                  </div>
                  <p className="text-sm text-[var(--color-ink-muted)]">{data.cycle.service_name}</p>
                  <p className="text-sm">
                    {formatDateBR(data.cycle.starts_on)} → {formatDateBR(data.cycle.ends_on)}
                  </p>
                  {data.cycle.renewal_on ? (
                    <p className="text-sm text-[var(--color-ink-muted)]">
                      Renovação prevista · {formatDateBR(data.cycle.renewal_on)}
                    </p>
                  ) : null}
                </section>

                <section className="space-y-2">
                  <p className="text-sm text-[var(--color-ink-muted)]">Aulas</p>
                  <p className="text-base font-semibold">
                    {Math.max(
                      0,
                      (data.cycle.lessons_completed ?? 0) - (data.cycle.lessons_no_show ?? 0),
                    )}{" "}
                    realizadas
                    {(data.cycle.lessons_no_show ?? 0) > 0
                      ? ` · ${data.cycle.lessons_no_show} falta${
                          data.cycle.lessons_no_show === 1 ? "" : "s"
                        }`
                      : ""}
                    {data.cycle.lesson_count != null
                      ? ` · ${data.cycle.remaining_planned_lessons ?? data.cycle.lesson_count} restantes`
                      : ""}
                    {data.cycle.lesson_count != null
                      ? ` · ${data.cycle.lesson_count} no ciclo`
                      : ""}
                  </p>
                  {(data.cycle.lessons_no_show ?? 0) > 0 ? (
                    <p
                      role="status"
                      className="rounded-[var(--radius-md)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink-muted)]"
                    >
                      {data.cycle.lessons_no_show === 1
                        ? "Foi registrada 1 falta neste ciclo. A falta também desconta do saldo de aulas."
                        : `Foram registradas ${data.cycle.lessons_no_show} faltas neste ciclo. Cada falta também desconta do saldo de aulas.`}
                    </p>
                  ) : null}
                </section>

                <section className="space-y-2">
                  <p className="text-sm text-[var(--color-ink-muted)]">Valor e pagamento</p>
                  <p className="text-xl font-semibold">{formatBRL(data.cycle.value_cents)}</p>
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone={PAY_TONE[data.cycle.payment_status] ?? "neutral"}>
                      {PAY_LABEL[data.cycle.payment_status] ?? data.cycle.payment_status}
                    </Badge>
                  </p>
                  {data.payment_instructions.configured ? (
                    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
                      {data.payment_instructions.holder_name ? (
                        <p>Titular · {data.payment_instructions.holder_name}</p>
                      ) : null}
                      {data.payment_instructions.pix_key ? (
                        <p>
                          Pix ({data.payment_instructions.pix_key_type}) ·{" "}
                          {data.payment_instructions.pix_key}
                        </p>
                      ) : null}
                      {data.payment_instructions.instructions ? (
                        <p className="mt-1 whitespace-pre-wrap">
                          {data.payment_instructions.instructions}
                        </p>
                      ) : null}
                      {data.payment_instructions.external_payment_url ? (
                        <a
                          className="mt-2 inline-block font-semibold text-[var(--color-primary)]"
                          href={data.payment_instructions.external_payment_url}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          Abrir link de pagamento
                        </a>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--color-ink-muted)]">
                      Combine a forma de pagamento diretamente com seu profissional.
                    </p>
                  )}
                </section>

                {data.can_request_renewal && !data.cycle.renewal_request_status ? (
                  <div className="space-y-2">
                    {!renewConfirm ? (
                      <Button fullWidth onClick={() => setRenewConfirm(true)}>
                        Quero renovar
                      </Button>
                    ) : (
                      <>
                        <p className="text-sm">
                          Confirmar interesse? Seu profissional ainda precisará criar o próximo ciclo.
                        </p>
                        <Button fullWidth disabled={busy} onClick={() => void requestRenewal()}>
                          Confirmar interesse
                        </Button>
                        <Button variant="secondary" fullWidth onClick={() => setRenewConfirm(false)}>
                          Cancelar
                        </Button>
                      </>
                    )}
                  </div>
                ) : null}
                {data.cycle.renewal_request_status ? (
                  <p className="text-sm text-[var(--color-ink-muted)]">
                    Interesse em renovação já enviado.
                  </p>
                ) : null}

                {data.can_report_payment ? (
                  <div className="space-y-2">
                    {!payOpen ? (
                      <Button variant="secondary" fullWidth onClick={() => setPayOpen(true)}>
                        Já paguei
                      </Button>
                    ) : (
                      <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                        <p className="text-sm font-medium">
                          Valor esperado · {formatBRL(data.cycle.value_cents)}
                        </p>
                        <TextField
                          label="Forma utilizada (opcional)"
                          value={methodNote}
                          onChange={(e) => setMethodNote(e.target.value)}
                        />
                        <TextField
                          label="Observação (opcional)"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                        />
                        <label className="block text-sm">
                          Comprovante (opcional, JPEG/PNG/WebP, até 5 MB)
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="mt-1 block w-full text-sm"
                            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                          />
                        </label>
                        <Button fullWidth disabled={busy} onClick={() => void reportPayment()}>
                          Confirmar que paguei
                        </Button>
                        <Button variant="secondary" fullWidth onClick={() => setPayOpen(false)}>
                          Cancelar
                        </Button>
                      </div>
                    )}
                  </div>
                ) : null}
              </>
            )}

            <section aria-label="Sua evolução" className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--color-ink)]">Sua evolução</h2>
                <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">
                  Acompanhamento compartilhado pelo seu profissional
                </p>
              </div>
              {!data.evaluations || data.evaluations.length === 0 ? (
                <p className="text-sm text-[var(--color-ink-muted)]">
                  Ainda não há registros compartilhados.
                </p>
              ) : (
                <ul className="space-y-3">
                  {data.evaluations.map((ev, index) => (
                    <li key={`${ev.title}-${ev.published_at ?? index}`}>
                      <EvolutionEntry evaluation={ev} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <p className="pt-4 text-center text-sm text-[var(--color-ink-muted)]">
              Fale com seu profissional se precisar de ajuda.
            </p>
          </div>
        ) : null}
      </main>
    </div>
  );
}
