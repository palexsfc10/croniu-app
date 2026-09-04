"use client";

import { BackLink } from "@/components/app/back-link";
import { PageTitle } from "@/components/ui/page-title";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, formatBRL, type Service, type ServiceUsage } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TableShell, Th, Tr, Td } from "@/components/ui/table-shell";

/** What the professional charges, in words — never a raw enum. */
function priceLabel(service: Service): string {
  return service.pricing_mode === "fixed_period"
    ? `${formatBRL(service.fixed_price_cents)} por período`
    : `${formatBRL(service.default_price_cents)} por aula`;
}

function billingLabel(service: Service): string {
  return service.pricing_mode === "fixed_period" ? "Valor fixo" : "Por aula";
}

export default function ServicesPage() {
  const [items, setItems] = useState<Service[]>([]);
  const [usage, setUsage] = useState<Record<string, ServiceUsage>>({});
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [list, use] = await Promise.all([
        apiFetch<Service[]>(`/api/v1/services?status=${showArchived ? "archived" : "active"}`),
        apiFetch<ServiceUsage[]>("/api/v1/services/usage"),
      ]);
      if (cancelled) return;
      if (list.error) setError(list.error.message);
      else {
        setError(null);
        setItems(list.data ?? []);
      }
      setUsage(Object.fromEntries((use.data ?? []).map((u) => [u.service_id, u])));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [showArchived]);

  const rows = useMemo(
    () =>
      items.map((service) => ({
        service,
        usage:
          usage[service.id] ??
          ({ service_id: service.id, running_cycles: 0, total_cycles: 0, distinct_clients: 0 } as ServiceUsage),
      })),
    [items, usage],
  );

  return (
    <div className="space-y-5 animate-fade-up">
      <BackLink href="/app/profile" label="Mais" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <PageTitle>Serviços</PageTitle>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            O que você oferece e como cobra. É a configuração reutilizável — o contrato de cada
            cliente vive em{" "}
            <Link href="/app/cycles" className="font-medium text-[var(--color-link)] hover:underline">
              Ciclos
            </Link>
            .
          </p>
        </div>
        <Link href="/app/services/new" className="shrink-0">
          <Button className="whitespace-nowrap">Novo serviço</Button>
        </Link>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className="text-sm font-medium text-[var(--color-primary)]"
        onClick={() => setShowArchived((v) => !v)}
      >
        {showArchived ? "Ver serviços ativos" : "Ver serviços arquivados"}
      </button>

      {loading ? <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p> : null}

      {!loading && !rows.length ? (
        <EmptyState
          title={showArchived ? "Nenhum serviço arquivado" : "Nenhum serviço"}
          description={
            showArchived
              ? "Serviços que você arquivar aparecem aqui — os ciclos já criados com eles continuam válidos."
              : "Cadastre um serviço para poder criar ciclos de clientes."
          }
          action={
            showArchived ? null : (
              <Link href="/app/services/new">
                <Button>Novo serviço</Button>
              </Link>
            )
          }
        />
      ) : null}

      {/* Desktop: tabela densa */}
      {rows.length ? (
        <div className="hidden lg:block">
          <TableShell>
            <table className="w-full text-sm">
              <thead>
                <Tr>
                  <Th>Serviço</Th>
                  <Th>Situação</Th>
                  <Th>Cobrança</Th>
                  <Th>Valor</Th>
                  <Th>Duração</Th>
                  <Th>Ciclos em andamento</Th>
                  <Th>Clientes</Th>
                  <Th>Ações</Th>
                </Tr>
              </thead>
              <tbody>
                {rows.map(({ service, usage: u }) => (
                  <Tr key={service.id}>
                    <Td className="font-medium text-[var(--color-ink)]">{service.name}</Td>
                    <Td>
                      <Badge tone={service.status === "archived" ? "neutral" : "info"}>
                        {service.status === "archived" ? "Arquivado" : "Ativo"}
                      </Badge>
                    </Td>
                    <Td className="text-[var(--color-ink-muted)]">{billingLabel(service)}</Td>
                    <Td className="tabular-nums text-[var(--color-ink)]">
                      {service.pricing_mode === "fixed_period"
                        ? formatBRL(service.fixed_price_cents)
                        : formatBRL(service.default_price_cents)}
                    </Td>
                    <Td className="tabular-nums text-[var(--color-ink-muted)]">
                      {service.default_duration_minutes} min
                    </Td>
                    <Td className="tabular-nums text-[var(--color-ink-muted)]">{u.running_cycles}</Td>
                    <Td className="tabular-nums text-[var(--color-ink-muted)]">{u.distinct_clients}</Td>
                    <Td>
                      <Link
                        href={`/app/services/${service.id}`}
                        className="font-medium text-[var(--color-primary)] hover:underline"
                      >
                        Editar
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </div>
      ) : null}

      {/* Mobile: cards, sem tabela comprimida */}
      {rows.length ? (
        <ul className="space-y-2 lg:hidden">
          {rows.map(({ service, usage: u }) => (
            <li key={service.id}>
              <Link
                href={`/app/services/${service.id}`}
                className="block rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate font-semibold text-[var(--color-ink)]">
                    {service.name}
                  </p>
                  <Badge tone={service.status === "archived" ? "neutral" : "info"}>
                    {billingLabel(service)}
                  </Badge>
                </div>
                <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">
                  {priceLabel(service)} · {service.default_duration_minutes} min
                </p>
                <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">
                  {u.running_cycles} ciclo{u.running_cycles === 1 ? "" : "s"} em andamento ·{" "}
                  {u.distinct_clients} cliente{u.distinct_clients === 1 ? "" : "s"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
