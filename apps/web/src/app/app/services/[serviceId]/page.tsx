"use client";

import { BackLink } from "@/components/app/back-link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, reaisToCents, type Service } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

function centsToInput(cents: number | null) {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

export default function ServiceDetailPage() {
  const params = useParams<{ serviceId: string }>();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceReais, setPriceReais] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [status, setStatus] = useState("active");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<Service>(`/api/v1/services/${params.serviceId}`);
      if (cancelled) return;
      if (result.error) {
        setError(result.error.message);
        return;
      }
      const row = result.data;
      if (!row) return;
      setName(row.name);
      setDescription(row.description ?? "");
      setPriceReais(centsToInput(row.default_price_cents));
      setMinutes(row.default_duration_minutes);
      setStatus(row.status);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [params.serviceId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const cents = reaisToCents(priceReais);
    if (cents == null) {
      setSaving(false);
      setError("Valor por aula inválido.");
      return;
    }
    const result = await apiFetch<Service>(`/api/v1/services/${params.serviceId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name,
        description: description || null,
        default_duration_minutes: minutes,
        default_price_cents: cents,
      }),
    });
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    router.replace("/app/services");
  }

  async function archive() {
    const ok = window.confirm(
      "Arquivar este serviço? Ele some da lista ativa; ciclos já criados não mudam.",
    );
    if (!ok) return;
    setSaving(true);
    setError(null);
    const result = await apiFetch<Service>(`/api/v1/services/${params.serviceId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "archived" }),
    });
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    router.replace("/app/services");
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <BackLink href="/app/services" label="Serviços" />
      <h1 className="h-display text-3xl text-[var(--color-ink)]">Editar serviço</h1>
      <p className="text-sm text-[var(--color-ink-muted)]">
        Alterar o preço não muda ciclos já criados.
        {status === "archived" ? " Este serviço está arquivado." : ""}
      </p>
      {!loaded && !error ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>
      ) : null}
      {loaded ? (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
          <TextField
            label="Descrição (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <TextField
            label="Valor por aula (R$)"
            inputMode="decimal"
            value={priceReais}
            onChange={(e) => setPriceReais(e.target.value)}
            required
          />
          <TextField
            label="Duração padrão da aula (minutos)"
            type="number"
            value={String(minutes)}
            onChange={(e) => setMinutes(Number(e.target.value) || 60)}
            required
          />
          {error ? (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          ) : null}
          <Button type="submit" fullWidth disabled={saving}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
          {status === "active" ? (
            <Button type="button" variant="secondary" fullWidth disabled={saving} onClick={() => void archive()}>
              Excluir serviço
            </Button>
          ) : null}
        </form>
      ) : error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
