"use client";

import { BackLink } from "@/components/app/back-link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, type Location } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

export default function LocationDetailPage() {
  const params = useParams<{ locationId: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Location | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await apiFetch<Location>(`/api/v1/locations/${params.locationId}`);
      if (result.error) setError(result.error.message);
      else setItem(result.data ?? null);
    })();
  }, [params.locationId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    setSaving(true);
    setError(null);
    const result = await apiFetch<Location>(`/api/v1/locations/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: item.name,
        address: item.address,
        address_detail: item.address_detail,
        map_url: item.map_url,
        meeting_url: item.meeting_url,
        notes: item.notes,
      }),
    });
    setSaving(false);
    if (result.error) setError(result.error.message);
    else setItem(result.data ?? item);
  }

  async function archive() {
    if (!item) return;
    if (!window.confirm(`Arquivar “${item.name}”? Ele permanecerá em compromissos históricos.`)) {
      return;
    }
    const result = await apiFetch<Location>(`/api/v1/locations/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "archived" }),
    });
    if (result.error) {
      setError(result.error.message);
      return;
    }
    router.replace("/app/locations");
  }

  if (!item && !error) {
    return <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>;
  }

  return (
    <form onSubmit={save} className="space-y-4 animate-fade-up">
      <BackLink href="/app/locations" label="Locais" />
      <h1 className="h-display text-3xl text-[var(--color-ink)]">Editar local</h1>
      {item ? (
        <>
          <TextField
            label="Nome"
            value={item.name}
            onChange={(e) => setItem({ ...item, name: e.target.value })}
            required
          />
          <TextField
            label="Endereço"
            value={item.address ?? ""}
            onChange={(e) => setItem({ ...item, address: e.target.value || null })}
          />
          <TextField
            label="Complemento"
            value={item.address_detail ?? ""}
            onChange={(e) => setItem({ ...item, address_detail: e.target.value || null })}
          />
          <TextField
            label="URL do mapa"
            value={item.map_url ?? ""}
            onChange={(e) => setItem({ ...item, map_url: e.target.value || null })}
          />
          <TextField
            label="URL online"
            value={item.meeting_url ?? ""}
            onChange={(e) => setItem({ ...item, meeting_url: e.target.value || null })}
          />
          <TextField
            label="Observação interna"
            value={item.notes ?? ""}
            onChange={(e) => setItem({ ...item, notes: e.target.value || null })}
          />
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      <Button type="submit" fullWidth disabled={saving}>
        {saving ? "Salvando…" : "Salvar"}
      </Button>
      <Button type="button" variant="secondary" fullWidth onClick={() => void archive()}>
        Arquivar local
      </Button>
    </form>
  );
}
