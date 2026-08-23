"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch, formatDateBR } from "@/lib/api";
import { safeReturnTo } from "@/lib/nomenclature";
import { BackLink } from "@/components/app/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type BoardItem = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  plan_title: string | null;
  due_on: string;
  overdue: boolean;
  type_label: string;
};

type BoardGroup = {
  occurrence_type: string;
  label: string;
  count: number;
  occurrence_count?: number;
  client_count?: number;
  overdue_count: number;
  items: BoardItem[];
};

function groupByClient(items: BoardItem[]) {
  const map = new Map<string, BoardItem[]>();
  for (const item of items) {
    const key = item.client_id || item.id;
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return [...map.values()].map((list) => {
    const sorted = [...list].sort((a, b) => a.due_on.localeCompare(b.due_on));
    return { next: sorted[0], rest: sorted.slice(1) };
  });
}

function OccurrenceRow({
  item,
  busy,
  onComplete,
}: {
  item: BoardItem;
  busy: boolean;
  onComplete: (id: string) => void;
}) {
  const situation = item.overdue ? "Atrasada" : "Em dia";
  return (
    <div>
      <span
        className={
          item.overdue
            ? "font-semibold text-[var(--color-danger)]"
            : "font-medium text-[var(--color-ink-muted)]"
        }
      >
        {situation}
      </span>
      {" · "}
      <span className="font-medium">{item.client_name || "Cliente"}</span>
      {item.plan_title ? ` · ${item.plan_title}` : ""}
      {" · "}até {formatDateBR(item.due_on)}
      <div className="mt-1">
        <Button variant="secondary" disabled={busy} onClick={() => onComplete(item.id)}>
          Marcar realizado
        </Button>
      </div>
    </div>
  );
}

export default function RoutinesPendingPage() {
  const search = useSearchParams();
  const clientId = search.get("clientId");
  const returnTo = safeReturnTo(search.get("returnTo"));
  const [board, setBoard] = useState<BoardGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const boardQuery = useMemo(() => {
    const qs = new URLSearchParams();
    if (clientId) qs.set("client_id", clientId);
    return qs.toString();
  }, [clientId]);

  async function load() {
    const result = await apiFetch<{ groups: BoardGroup[] }>(
      `/api/v1/routines/board${boardQuery ? `?${boardQuery}` : ""}`,
    );
    if (result.error) setError(result.error.message);
    else setBoard(result.data?.groups ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remote hydrate
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardQuery]);

  async function completeOccurrence(id: string) {
    setBusy(true);
    const result = await apiFetch(`/api/v1/routines/occurrences/${id}/decide`, {
      method: "POST",
      body: JSON.stringify({ status: "completed" }),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setInfo("Ocorrência marcada como realizada.");
    await load();
  }

  const backHref = returnTo || (clientId ? `/app/clients/${clientId}` : "/app/routines");

  return (
    <div className="space-y-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] animate-fade-up">
      <BackLink href={backHref} label="Voltar" />
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Pendências de rotina</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Cada marco permanece visível até ser concluído.
        </p>
      </header>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {info ? (
        <p role="status" className="text-sm text-[var(--color-success)]">
          {info}
        </p>
      ) : null}

      {board.length ? (
        <section className="space-y-2" aria-label="Pendências">
          {board.map((group) => {
            const occ = group.occurrence_count ?? group.count;
            const clients =
              group.client_count ?? new Set(group.items.map((i) => i.client_id)).size;
            return (
              <details
                key={group.occurrence_type}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2"
                open
              >
                <summary className="flex flex-wrap items-center gap-x-2 gap-y-1 cursor-pointer min-h-11">
                  <span className="font-semibold">{group.label}</span>
                  <span className="text-sm text-[var(--color-ink-muted)]">
                    {occ} ocorrência{occ === 1 ? "" : "s"} · {clients} cliente
                    {clients === 1 ? "" : "s"}
                  </span>
                  {group.overdue_count ? (
                    <Badge tone="danger">
                      {group.overdue_count} atrasado{group.overdue_count === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                </summary>
                <ul className="mt-2 space-y-3">
                  {groupByClient(group.items).map(({ next, rest }) => (
                    <li key={next.id} className="text-sm">
                      <OccurrenceRow item={next} busy={busy} onComplete={completeOccurrence} />
                      {rest.length ? (
                        <details className="mt-1">
                          <summary className="flex min-h-11 cursor-pointer items-center text-sm text-[var(--color-ink-muted)]">
                            Ver {rest.length} ocorrência{rest.length === 1 ? "" : "s"} seguinte
                            {rest.length === 1 ? "" : "s"}
                          </summary>
                          <ul className="mt-2 space-y-2 pl-2">
                            {rest.map((item) => (
                              <li key={item.id}>
                                <OccurrenceRow
                                  item={item}
                                  busy={busy}
                                  onComplete={completeOccurrence}
                                />
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </section>
      ) : (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] px-3 py-4">
          <p className="font-medium">Tudo em dia.</p>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Nenhuma pendência de rotina no momento.
          </p>
        </div>
      )}
    </div>
  );
}
