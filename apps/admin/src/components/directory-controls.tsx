"use client";

import { Button } from "@/components/ui/button";
import { IconChevronLeft, IconChevronRight, IconSearch } from "@/components/ui/icons";
import { formatCount } from "@/lib/presentation";

export function DirectorySearch({ query, placeholder, submit }: { query: string; placeholder: string; submit: (query: string) => void }) {
  return <form aria-label="Pesquisar registros" className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => {
    event.preventDefault();
    submit(String(new FormData(event.currentTarget).get("directory-search") ?? ""));
  }}>
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3 focus-within:outline-2 focus-within:outline-[var(--color-focus)]">
      <IconSearch className="h-4 w-4 shrink-0 text-[var(--color-ink-muted)]" />
      <input key={query} type="search" name="directory-search" aria-label="Pesquisar registros" minLength={2} maxLength={100} defaultValue={query} placeholder={placeholder} className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" />
    </div>
    <Button type="submit">Buscar</Button>
    {query ? <Button variant="secondary" onClick={() => submit("")}>Limpar busca</Button> : null}
  </form>;
}

export function DirectoryPagination({ page, total, size, loading, navigate }: {
  page: number; total: number; size: number; loading: boolean;
  navigate: (next: { page?: number; size?: number }) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return <div className="flex flex-wrap items-center justify-between gap-4 py-2">
    <label className="flex items-center gap-2 text-xs text-[var(--color-ink-muted)]">Por página<select aria-label="Registros por página" value={size} disabled={loading} onChange={(event) => navigate({ size: Number(event.target.value), page: 1 })} className="min-h-11 rounded-lg border border-[var(--color-border)] bg-white px-2 text-sm"><option value={20}>20</option><option value={50}>50</option></select></label>
    <div className="flex flex-wrap items-center gap-2"><Button variant="secondary" disabled={loading || page <= 1} onClick={() => navigate({ page: page - 1 })}><IconChevronLeft className="h-4 w-4" /><span className="sr-only sm:not-sr-only">Anterior</span></Button><p aria-live="polite" className="px-1 text-xs text-[var(--color-ink-muted)]">Página {formatCount(page)} de {formatCount(pages)}</p><Button variant="secondary" disabled={loading || page >= pages} onClick={() => navigate({ page: page + 1 })}><span className="sr-only sm:not-sr-only">Próxima</span><IconChevronRight className="h-4 w-4" /></Button></div>
  </div>;
}
