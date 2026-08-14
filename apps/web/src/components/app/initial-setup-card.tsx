"use client";

import Link from "next/link";
import { IconBriefcase, IconCheck, IconClipboardList, IconLayers } from "@/components/ui/icons";
import { encodeAppReturnTo, setupCopyFor } from "@/lib/setup-copy";

type Props = {
  professionCode?: string | null;
  hasService: boolean;
  hasTemplate: boolean;
  compact?: boolean;
  onDismissLater?: () => void;
  returnTo?: string;
};

export function InitialSetupCard({
  professionCode,
  hasService,
  hasTemplate,
  compact = false,
  onDismissLater,
  returnTo = "/app/setup",
}: Props) {
  const copy = setupCopyFor(professionCode);
  const doneCount = Number(hasService) + Number(hasTemplate);
  const complete = doneCount === 2;
  const rt = encodeAppReturnTo(returnTo);
  const serviceHref = `/app/services/new?returnTo=${rt}`;
  const templateHref = `/app/cycle-templates/new?returnTo=${rt}`;

  return (
    <section
      aria-label="Configuração inicial"
      className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] text-[var(--color-ink-muted)]">
          <IconClipboardList className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-[var(--color-ink)]">{copy.cardTitle}</h2>
          <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">{copy.cardDescription}</p>
          <p className="mt-1 text-xs font-medium text-[var(--color-ink-muted)]">
            {complete ? "Configuração inicial concluída" : `${doneCount} de 2 etapas concluídas`}
          </p>
        </div>
      </div>

      {!complete ? (
        <ul className="mt-3 space-y-2">
          <li className="flex items-start gap-2.5 rounded-[var(--radius-sm)] px-0.5 py-1">
            <span
              className={[
                "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                hasService
                  ? "bg-[var(--color-success-subtle)] text-[var(--color-success)]"
                  : "bg-[var(--color-surface-subtle)] text-[var(--color-ink-muted)]",
              ].join(" ")}
              aria-hidden
            >
              {hasService ? <IconCheck className="h-4 w-4" /> : <IconBriefcase className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--color-ink)]">{copy.serviceTitle}</p>
              <p className="text-xs text-[var(--color-ink-muted)]">{copy.serviceHint}</p>
              <p className="text-xs text-[var(--color-ink-subtle)]">{copy.serviceExample}</p>
              {!hasService ? (
                <Link
                  href={serviceHref}
                  className="mt-1 inline-block text-sm font-semibold text-[var(--color-primary)]"
                >
                  Criar serviço
                </Link>
              ) : (
                <p className="mt-1 text-xs font-medium text-[var(--color-success)]">Concluído</p>
              )}
            </div>
          </li>
          <li className="flex items-start gap-2.5 rounded-[var(--radius-sm)] px-0.5 py-1">
            <span
              className={[
                "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                hasTemplate
                  ? "bg-[var(--color-success-subtle)] text-[var(--color-success)]"
                  : "bg-[var(--color-surface-subtle)] text-[var(--color-ink-muted)]",
              ].join(" ")}
              aria-hidden
            >
              {hasTemplate ? <IconCheck className="h-4 w-4" /> : <IconLayers className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--color-ink)]">{copy.templateTitle}</p>
              <p className="text-xs text-[var(--color-ink-muted)]">{copy.templateHint}</p>
              <p className="text-xs text-[var(--color-ink-subtle)]">{copy.templateExample}</p>
              {!hasTemplate ? (
                <Link
                  href={templateHref}
                  className="mt-1 inline-block text-sm font-semibold text-[var(--color-primary)]"
                >
                  Criar modelo
                </Link>
              ) : (
                <p className="mt-1 text-xs font-medium text-[var(--color-success)]">Concluído</p>
              )}
            </div>
          </li>
        </ul>
      ) : null}

      {compact && onDismissLater && !complete ? (
        <button
          type="button"
          className="mt-2 text-sm font-medium text-[var(--color-ink-muted)] underline-offset-2 hover:underline"
          onClick={onDismissLater}
        >
          Ver depois
        </button>
      ) : null}
    </section>
  );
}
