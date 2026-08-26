"use client";

import { BackLink } from "@/components/app/back-link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  apiFetch,
  formatConflictLines,
  isoToLocalInput,
  localInputToIso,
  type Appointment,
  type Client,
  type Location,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { useAuth } from "@/components/auth/auth-provider";

function NewAppointmentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { me } = useAuth();
  const orgTz = me?.organization.timezone || "America/Sao_Paulo";
  const day = searchParams.get("day");
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");

  const [clients, setClients] = useState<Client[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [clientId, setClientId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [startsLocal, setStartsLocal] = useState(
    day ? `${day}T${startParam || "09:00"}` : isoToLocalInput(new Date().toISOString()),
  );
  const [endsLocal, setEndsLocal] = useState(() => {
    if (day) return `${day}T${endParam || "10:00"}`;
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
      setError(
        result.error.code === "appointment_conflict"
          ? "Não foi possível adicionar o compromisso"
          : result.error.message,
      );
      const details = result.error.details as
        | { conflicts?: { client_name?: string; starts_at: string; ends_at: string }[] }
        | undefined;
      if (details?.conflicts?.length) {
        setConflicts(formatConflictLines(details.conflicts, orgTz));
      }
      return;
    }
    router.replace(`/app/appointments/${result.data?.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4 animate-fade-up">
      <BackLink href="/app/agenda" label="Agenda" />
      <h1 className="h-display text-3xl text-[var(--color-ink)]">Novo compromisso</h1>

      <label className="block space-y-1.5" htmlFor="appointment-client">
        <span className="text-sm font-medium">Cliente</span>
        <select
          id="appointment-client"
          required
          aria-label="Cliente"
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

      <label className="block space-y-1.5" htmlFor="appointment-location">
        <span className="text-sm font-medium">Local (opcional)</span>
        <select
          id="appointment-location"
          aria-label="Local (opcional)"
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
        <div
          role="alert"
          className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-danger)]/25 bg-[var(--color-danger-subtle)] px-3 py-3"
        >
          <p className="text-sm font-semibold text-[var(--color-danger)]">{error}</p>
          {conflicts.length ? (
            <>
              <p className="text-sm text-[var(--color-ink)]">Já existem compromissos nestes horários:</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--color-ink)]">
                {conflicts.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
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
