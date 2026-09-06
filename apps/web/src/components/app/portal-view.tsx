"use client";

import { useState } from "react";
import { formatBRL, type PublicMyCycle } from "@/lib/api";
import {
  formatCycleDetailLines,
  formatHumanDate,
  formatInstantDayMonth,
  formatInstantWeekday,
  formatLessonClock,
} from "@/lib/date-format";
import { EvolutionEntry } from "@/components/app/evolution-entry";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TextField } from "@/components/ui/text-field";
import {
  IconActivity,
  IconBanknote,
  IconCalendarDays,
  IconClock,
  IconLayers,
  IconTarget,
  IconWhatsApp,
} from "@/components/ui/icons";

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
  cancelado: "Cobrança cancelada",
};

const PAY_TONE: Record<string, "warning" | "success" | "neutral"> = {
  pendente: "warning",
  confirmado: "success",
  aguardando_confirmacao: "warning",
  nao_confirmado: "warning",
  sem_cobranca: "neutral",
  cancelado: "neutral",
};

type Props = {
  data: PublicMyCycle;
  mode?: "public" | "preview";
  busy?: boolean;
  onRequestRenewal?: () => void;
  onDeclareRenewalPayment?: () => void;
  onReportPayment?: (methodNote: string, notes: string) => void;
};

export function PortalView({
  data,
  mode = "public",
  busy = false,
  onRequestRenewal,
  onDeclareRenewalPayment,
  onReportPayment,
}: Props) {
  const preview = mode === "preview";
  const [renewConfirm, setRenewConfirm] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [methodNote, setMethodNote] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--color-ink-muted)]">Com {data.professional_display_name}</p>

      {data.next_appointment ? (
        <section
          aria-label="Próximo compromisso"
          className="card-rail card-rail-info space-y-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm"
        >
          <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-muted)]">
            <IconClock className="h-4 w-4 shrink-0" aria-hidden />
            Próximo compromisso
          </p>
          <p className="text-lg font-semibold text-[var(--color-ink)]">
            {formatInstantWeekday(data.next_appointment.starts_at, data.org_timezone)},{" "}
            {formatInstantDayMonth(data.next_appointment.starts_at, data.org_timezone)} ·{" "}
            {formatLessonClock(data.next_appointment.starts_at, data.org_timezone)}
          </p>
          {data.next_appointment.service_name ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              {data.next_appointment.service_name}
            </p>
          ) : null}
        </section>
      ) : null}

      {data.empty_message || !data.cycle ? (
        <p className="text-base text-[var(--color-ink)]">{data.empty_message}</p>
      ) : (
        <>
          <section
            className={[
              "space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm",
              data.cycle.status_summary === "encerrando"
                ? "card-rail card-rail-warning"
                : data.cycle.status_summary === "vigente"
                  ? "card-rail card-rail-progress"
                  : "",
            ].join(" ")}
          >
            <div className="flex flex-wrap items-center gap-2">
              <IconCalendarDays className="h-5 w-5 shrink-0 text-[var(--color-ink-muted)]" aria-hidden />
              <h2 className="text-lg font-semibold text-[var(--color-ink)]">
                {STATUS_LABEL[data.cycle.status_summary] ?? data.cycle.status_summary}
              </h2>
              <Badge tone={STATUS_TONE[data.cycle.status_summary] ?? "neutral"}>
                {STATUS_LABEL[data.cycle.status_summary] ?? data.cycle.status_summary}
              </Badge>
            </div>
            <p className="text-sm text-[var(--color-ink-muted)]">{data.cycle.service_name}</p>
            <p className="text-sm">
              {formatCycleDetailLines(data.cycle.starts_on, data.cycle.ends_on).vigency}
            </p>
            <p className="text-sm text-[var(--color-ink-muted)]">
              {formatCycleDetailLines(data.cycle.starts_on, data.cycle.ends_on).lessonsUntil}
            </p>
            <p className="text-sm text-[var(--color-ink-muted)]">
              {formatCycleDetailLines(data.cycle.starts_on, data.cycle.ends_on).renewal}
            </p>
          </section>

          <section className="space-y-2">
            <p className="flex items-center gap-1.5 text-sm text-[var(--color-ink-muted)]">
              <IconActivity className="h-4 w-4 shrink-0" aria-hidden />
              Aulas
            </p>
            <p className="text-base font-semibold">
              {Math.max(0, (data.cycle.lessons_completed ?? 0) - (data.cycle.lessons_no_show ?? 0))}{" "}
              realizadas
              {(data.cycle.lessons_no_show ?? 0) > 0
                ? ` · ${data.cycle.lessons_no_show} falta${data.cycle.lessons_no_show === 1 ? "" : "s"}`
                : ""}
              {data.cycle.lesson_count != null
                ? ` · ${data.cycle.remaining_planned_lessons ?? data.cycle.lesson_count} restantes`
                : ""}
              {data.cycle.lesson_count != null ? ` · ${data.cycle.lesson_count} no ciclo` : ""}
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
            <p className="flex items-center gap-1.5 text-sm text-[var(--color-ink-muted)]">
              <IconBanknote className="h-4 w-4 shrink-0" aria-hidden />
              Valor e pagamento
            </p>
            <p className="text-xl font-semibold">{formatBRL(data.cycle.value_cents)}</p>
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={PAY_TONE[data.cycle.payment_status] ?? "neutral"}>
                {PAY_LABEL[data.cycle.payment_status] ?? data.cycle.payment_status}
              </Badge>
            </p>
            <p className="text-sm text-[var(--color-ink-muted)]">
              Combine a forma de pagamento diretamente com seu profissional. A chave Pix aparece
              apenas na etapa de renovação.
            </p>
          </section>

          {data.can_request_renewal && !data.cycle.renewal_request_status ? (
            <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-[var(--color-ink)]">
                Seu ciclo está chegando ao fim
              </h2>
              <p className="text-sm text-[var(--color-ink-muted)]">
                Se quiser continuar seu acompanhamento com {data.professional_display_name}, envie
                sua solicitação de renovação.
              </p>
              {!renewConfirm ? (
                <Button fullWidth disabled={preview} onClick={() => setRenewConfirm(true)}>
                  Quero continuar
                </Button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-semibold">Pagamento da renovação</p>
                  <p className="text-sm text-[var(--color-ink-muted)]">
                    Use os dados abaixo para realizar o pagamento. Depois, envie o comprovante pelo
                    WhatsApp do profissional.
                  </p>
                  {data.renewal_payment_instructions?.configured ? (
                    <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-progress-subtle)]/40 p-3 text-sm">
                      {data.renewal_payment_instructions.holder_name ? (
                        <p>Favorecido · {data.renewal_payment_instructions.holder_name}</p>
                      ) : null}
                      {data.renewal_payment_instructions.institution ? (
                        <p>Instituição · {data.renewal_payment_instructions.institution}</p>
                      ) : null}
                      {data.renewal_payment_instructions.pix_key ? (
                        <p>
                          Pix ({data.renewal_payment_instructions.pix_key_type}) ·{" "}
                          <span className="font-semibold">
                            {data.renewal_payment_instructions.pix_key}
                          </span>
                        </p>
                      ) : null}
                      {data.renewal_payment_instructions.instructions ? (
                        <p className="whitespace-pre-wrap">
                          {data.renewal_payment_instructions.instructions}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--color-ink-muted)]">
                      {data.professional_display_name} recebeu seu interesse e combinará com você os
                      próximos passos.
                    </p>
                  )}
                  {data.renewal_whatsapp?.available && data.renewal_whatsapp.whatsapp_url ? (
                    <a
                      href={data.renewal_whatsapp.whatsapp_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-success)] px-4 text-sm font-semibold text-white"
                    >
                      <IconWhatsApp className="h-5 w-5 text-white" />
                      Enviar comprovante pelo WhatsApp
                    </a>
                  ) : null}
                  <Button
                    fullWidth
                    disabled={busy || preview}
                    onClick={() => onRequestRenewal?.()}
                  >
                    Enviar interesse
                  </Button>
                  <Button variant="secondary" fullWidth onClick={() => setRenewConfirm(false)}>
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          ) : null}

          {data.cycle.renewal_request_status ? (
            <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                Seu interesse foi enviado para {data.professional_display_name}.
              </p>
              {data.cycle.renewal_request_status === "resolved" ? (
                <p className="text-sm text-[var(--color-success)]">
                  Renovação confirmada. Seu novo ciclo segue a data configurada pelo profissional.
                </p>
              ) : (
                <>
                  {data.can_declare_renewal_payment &&
                  data.cycle.renewal_request_status !== "payment_reported" ? (
                    <Button
                      variant="secondary"
                      fullWidth
                      disabled={busy || preview}
                      onClick={() => onDeclareRenewalPayment?.()}
                    >
                      Já realizei o pagamento
                    </Button>
                  ) : null}
                  {data.cycle.renewal_request_status === "payment_reported" ? (
                    <p className="text-sm text-[var(--color-ink-muted)]">
                      Pagamento informado. Agora é só aguardar a conferência de{" "}
                      {data.professional_display_name}. Seu novo ciclo ainda não foi iniciado.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {data.can_report_payment ? (
            <div className="space-y-2">
              {!payOpen ? (
                <Button variant="secondary" fullWidth disabled={preview} onClick={() => setPayOpen(true)}>
                  Já paguei (ciclo atual)
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
                  <Button
                    fullWidth
                    disabled={busy}
                    onClick={() => onReportPayment?.(methodNote, notes)}
                  >
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

      {data.plan ? (
        <section aria-label={data.plan.section_title} className="space-y-3">
          <div>
            <h2 className="flex items-center gap-1.5 text-lg font-semibold text-[var(--color-ink)]">
              <IconLayers className="h-5 w-5 shrink-0 text-[var(--color-ink-muted)]" aria-hidden />
              {data.plan.section_title}
            </h2>
            <p className="mt-0.5 text-sm font-medium text-[var(--color-ink)]">{data.plan.title}</p>
          </div>
          {data.plan.summary ? (
            <p className="text-sm text-[var(--color-ink)]">{data.plan.summary}</p>
          ) : null}
          {data.plan.starts_on || data.plan.ends_on ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              {data.plan.starts_on && data.plan.ends_on
                ? `${formatHumanDate(data.plan.starts_on)} — ${formatHumanDate(data.plan.ends_on)}`
                : data.plan.starts_on
                  ? `A partir de ${formatHumanDate(data.plan.starts_on)}`
                  : `Até ${formatHumanDate(data.plan.ends_on!)}`}
            </p>
          ) : null}
          {data.plan.milestones.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--color-ink)]">
              {data.plan.milestones.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {data.plan.external_url ? (
            <a
              href={data.plan.external_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center text-sm text-[var(--color-link)]"
            >
              {data.plan.external_title || "Abrir material"}
            </a>
          ) : null}
        </section>
      ) : null}

      <section aria-label="Sua evolução" className="space-y-4">
        <div>
          <h2 className="flex items-center gap-1.5 text-lg font-semibold text-[var(--color-ink)]">
            <IconTarget className="h-5 w-5 shrink-0 text-[var(--color-ink-muted)]" aria-hidden />
            Sua evolução
          </h2>
          <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">
            Acompanhamento compartilhado pelo seu profissional
          </p>
        </div>
        {!data.evaluations || data.evaluations.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">Ainda não há registros compartilhados.</p>
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
  );
}
