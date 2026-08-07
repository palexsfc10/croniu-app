"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

type FeedbackItem = {
  id: string;
  organization_id: string;
  organization_name: string | null;
  user_id: string;
  user_name: string | null;
  user_email_masked: string | null;
  category: string;
  subject: string | null;
  message: string;
  status: string;
  technical_context: Record<string, string> | null;
  created_at: string;
  updated_at: string;
  status_changed_at?: string | null;
  status_changed_by_name?: string | null;
};

type FeedbackList = {
  items: FeedbackItem[];
  total: number;
  page: number;
  page_size: number;
};

const CATEGORY_LABEL: Record<string, string> = {
  suggestion: "Sugestão",
  problem: "Problema",
  question: "Dúvida",
  praise: "Elogio",
  other: "Outro",
};

const STATUS_LABEL: Record<string, string> = {
  new: "Novo",
  reviewing: "Em análise",
  resolved: "Resolvido",
  archived: "Descartado",
};

const STATUSES = ["new", "reviewing", "resolved", "archived"] as const;

export default function AdminFeedbacksPage() {
  const [data, setData] = useState<FeedbackList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: "1", page_size: "30" });
    if (category) params.set("category", category);
    if (status) params.set("status", status);
    const result = await apiFetch<FeedbackList>(`/api/v1/platform/feedbacks?${params}`);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setData(result.data || null);
  }, [category, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateStatus(id: string, next: string) {
    setBusyId(id);
    const result = await apiFetch<FeedbackItem>(`/api/v1/platform/feedbacks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: next }),
    });
    setBusyId(null);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    await load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-ink)]">Feedbacks</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Mensagens enviadas pelo app. Sem e-mail — persistência interna.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="text-sm">
          <span className="sr-only">Categoria</span>
          <select
            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Todas as categorias</option>
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="sr-only">Status</span>
          <select
            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Todos os status</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" variant="secondary" onClick={() => void load()}>
          Atualizar
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <p className="text-xs text-[var(--color-ink-muted)]">
        {data ? `${data.total} feedback(s)` : "Carregando…"}
      </p>

      <ul className="space-y-3">
        {(data?.items || []).map((item) => {
          const open = expanded === item.id;
          return (
            <li
              key={item.id}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold text-[var(--color-ink)]">
                    {CATEGORY_LABEL[item.category] || item.category}
                    {item.subject ? ` · ${item.subject}` : ""}
                  </p>
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    {item.user_name}
                    {item.user_email_masked ? ` · ${item.user_email_masked}` : ""} ·{" "}
                    {item.organization_name} ·{" "}
                    {new Date(item.created_at).toLocaleString("pt-BR")}
                  </p>
                  <p className="text-xs font-medium text-[var(--color-ink-muted)]">
                    {STATUS_LABEL[item.status] || item.status}
                    {item.status_changed_by_name
                      ? ` · alterado por ${item.status_changed_by_name}`
                      : ""}
                    {item.status_changed_at
                      ? ` em ${new Date(item.status_changed_at).toLocaleString("pt-BR")}`
                      : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setExpanded(open ? null : item.id)}
                >
                  {open ? "Recolher" : "Ver"}
                </Button>
              </div>
              {open ? (
                <div className="mt-3 space-y-3 border-t border-[var(--color-border)] pt-3">
                  <p className="whitespace-pre-wrap text-sm text-[var(--color-ink)]">{item.message}</p>
                  {item.technical_context ? (
                    <pre className="overflow-x-auto rounded bg-[var(--color-surface-subtle)] p-2 text-xs text-[var(--color-ink-muted)]">
                      {JSON.stringify(item.technical_context, null, 2)}
                    </pre>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {STATUSES.map((next) => (
                      <Button
                        key={next}
                        type="button"
                        variant="secondary"
                        disabled={busyId === item.id || item.status === next}
                        onClick={() => void updateStatus(item.id, next)}
                      >
                        {STATUS_LABEL[next]}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
