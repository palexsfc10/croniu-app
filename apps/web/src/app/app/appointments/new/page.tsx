"use client";

import { BackLink } from "@/components/app/back-link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  apiFetch,
  isoToLocalInput,
  localInputToIso,
  type Appointment,
  type Client,
  type Location,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

function NewAppointmentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const day = searchParams.get("day");

  const [clients, setClients] = useState<Client[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [clientId, setClientId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [startsLocal, setStartsLocal] = useState(
    day ? `${day}T09:00` : isoToLocalInput(new Date().toISOString()),
  );
  const [endsLocal, setEndsLocal] = useState(() => {
    if (day) return `${day}T10:00`;
    const end = new Date();
    end.setHours(end.getHours() + 1);
    return isoToLocalInput(end.toISOString());
  });
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const [c, l] = await Promise.all([
        apiFetch<Client[]>("/api/v1/clients?status=active"),
        apiFetch<Location[]>("/api/v1/locations?status=active"),
      ]);
      setClients(c.data ?? []);
      setLocations(l.data ?? []);
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setConflicts([]);
    const starts = localInputToIso(startsLocal);
    const ends = localInputToIso(endsLocal);
    if (!starts || !ends) {
      setSaving(false);
      setError("Informe início e fim válidos.");
      return;
    }
    const result = await apiFetch<Appointment>("/api/v1/appointments", {
      method: "POST",
      body: JSON.stringify({
        client_id: clientId,
        location_id: locationId || null,
        starts_at: starts,
        ends_at: ends,
        notes: notes || null,
      }),
    });
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      const details = result.error.details as
        | { conflicts?: { client_name?: string; starts_at: string; ends_at: string }[] }
        | undefined;
      if (details?.conflicts?.length) {
        setConflicts(
          details.conflicts.map(
            (c) =>
              `${c.client_name ?? "Cliente"} · ${new Date(c.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}–${new Date(c.ends_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
          ),
        );
      }
      return;
    }
    router.replace(`/app/appointments/${result.data?.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4 animate-fade-up">
      <BackLink href="/app/agenda" label="Agenda" />
      <h1 className="h-display text-3xl text-[var(--color-ink)]">Novo compromisso</h1>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Cliente</span>
        <select
          required
          className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        >
          <option value="">Selecione</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Local (opcional)</span>
        <select
          className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
        >
          <option value="">Sem local</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>

      <TextField
        label="Início"
        type="datetime-local"
        value={startsLocal}
        onChange={(e) => setStartsLocal(e.target.value)}
        required
      />
      <TextField
        label="Fim"
        type="datetime-local"
        value={endsLocal}
        onChange={(e) => setEndsLocal(e.target.value)}
        required
      />
      <TextField label="Observação interna" value={notes} onChange={(e) => setNotes(e.target.value)} />

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {conflicts.length ? (
        <ul className="rounded-[var(--radius-md)] bg-red-50 px-3 py-2 text-sm text-[var(--color-danger)]">
          {conflicts.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : null}

      <Button type="submit" fullWidth disabled={saving}>
        {saving ? "Salvando…" : "Criar compromisso"}
      </Button>
    </form>
  );
}

export default function NewAppointmentPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>}>
      <NewAppointmentForm />
    </Suspense>
  );
}
