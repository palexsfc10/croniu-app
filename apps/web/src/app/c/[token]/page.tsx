"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatBRL, formatDateBR, type PublicMyCycle } from "@/lib/api";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

const STATUS_LABEL: Record<string, string> = {
  vigente: "Ciclo em andamento",
  encerrando: "Ciclo perto do fim",
  encerrado: "Ciclo encerrado",
  proximo: "Próximo ciclo",
};

const PAY_LABEL: Record<string, string> = {
  pendente: "Pagamento pendente",
  confirmado: "Pagamento confirmado",
  aguardando_confirmacao: "Pagamento informado — aguardando confirmação",
  nao_confirmado: "Pagamento ainda não confirmado",
  sem_cobranca: "Sem cobrança vinculada",
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
    <div className="min-h-dvh bg-[linear-gradient(165deg,#f7f4ef_0%,#eef6f3_45%,#f7f4ef_100%)]">
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
            className="rounded-[var(--radius-md)] bg-[var(--color-surface)] px-4 py-4 text-sm text-[var(--color-ink)]"
          >
            {error}
          </p>
        ) : null}
        {flash ? (
          <p role="status" className="mb-3 rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm">
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
                <section className="space-y-1">
                  <h2 className="text-lg font-semibold text-[var(--color-ink)]">
                    {STATUS_LABEL[data.cycle.status_summary] ?? data.cycle.status_summary}
                  </h2>
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

                <section>
                  <p className="text-sm text-[var(--color-ink-muted)]">Aulas</p>
                  <p className="text-base font-semibold">
                    {data.cycle.lessons_completed ?? 0} realizadas
                    {data.cycle.lesson_count != null
                      ? ` · ${data.cycle.remaining_planned_lessons ?? data.cycle.lesson_count} restantes`
                      : ""}
                    {data.cycle.lesson_count != null ? ` · ${data.cycle.lesson_count} no ciclo` : ""}
                  </p>
                </section>

                <section className="space-y-2">
                  <p className="text-sm text-[var(--color-ink-muted)]">Valor e pagamento</p>
                  <p className="text-xl font-semibold">{formatBRL(data.cycle.value_cents)}</p>
                  <p className="text-sm">
                    {PAY_LABEL[data.cycle.payment_status] ?? data.cycle.payment_status}
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

            <section aria-label="Sua evolução" className="space-y-3">
              <h2 className="text-lg font-semibold text-[var(--color-ink)]">Sua evolução</h2>
              {!data.evaluations || data.evaluations.length === 0 ? (
                <p className="text-sm text-[var(--color-ink-muted)]">
                  Ainda não há avaliações compartilhadas.
                </p>
              ) : (
                <ul className="space-y-4">
                  {data.evaluations.map((ev, index) => (
                    <li
                      key={`${ev.title}-${ev.published_at ?? index}`}
                      className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-2"
                    >
                      <p className="font-semibold">{ev.title}</p>
                      {ev.evaluated_from || ev.evaluated_to ? (
                        <p className="text-sm text-[var(--color-ink-muted)]">
                          {ev.evaluated_from ? formatDateBR(ev.evaluated_from) : "…"}
                          {" → "}
                          {ev.evaluated_to ? formatDateBR(ev.evaluated_to) : "…"}
                        </p>
                      ) : ev.published_at ? (
                        <p className="text-sm text-[var(--color-ink-muted)]">
                          {formatDateBR(ev.published_at.slice(0, 10))}
                        </p>
                      ) : null}
                      {ev.summary ? (
                        <p className="text-sm whitespace-pre-wrap">{ev.summary}</p>
                      ) : null}
                      {ev.achievements ? (
                        <div>
                          <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                            Conquistas
                          </p>
                          <p className="text-sm whitespace-pre-wrap">{ev.achievements}</p>
                        </div>
                      ) : null}
                      {ev.attention_points ? (
                        <div>
                          <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                            Pontos de atenção
                          </p>
                          <p className="text-sm whitespace-pre-wrap">{ev.attention_points}</p>
                        </div>
                      ) : null}
                      {ev.next_goals ? (
                        <div>
                          <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                            Próximos objetivos
                          </p>
                          <p className="text-sm whitespace-pre-wrap">{ev.next_goals}</p>
                        </div>
                      ) : null}
                      {ev.criteria?.length ? (
                        <ul className="space-y-1 text-sm">
                          {ev.criteria.map((c, i) => (
                            <li key={`${c.name}-${i}`}>
                              {c.name}
                              {c.score != null ? ` · ${c.score}/${c.scale_max}` : ""}
                              {c.comment ? ` — ${c.comment}` : ""}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {ev.client_message ? (
                        <p className="text-sm whitespace-pre-wrap border-t border-[var(--color-border)] pt-2">
                          {ev.client_message}
                        </p>
                      ) : null}
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
