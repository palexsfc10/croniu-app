"use client";

import { BackLink } from "@/components/app/back-link";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  apiFetch,
  appointmentStatusLabel,
  formatOrgDateTime,
  isoToLocalInput,
  localInputToIso,
  type Appointment,
  type Client,
  type Location,
  type OrgPreferences,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { ContextualBar } from "@/components/app/contextual-bar";

export default function AppointmentDetailPage() {
  const params = useParams<{ appointmentId: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Appointment | null>(null);
  const [prefs, setPrefs] = useState<OrgPreferences | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [startsLocal, setStartsLocal] = useState("");
  const [endsLocal, setEndsLocal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const [appt, pref, c, l] = await Promise.all([
        apiFetch<Appointment>(`/api/v1/appointments/${params.appointmentId}`),
        apiFetch<OrgPreferences>("/api/v1/organization/preferences"),
        apiFetch<Client[]>("/api/v1/clients?status=active"),
        apiFetch<Location[]>("/api/v1/locations?status=active"),
      ]);
      if (appt.error) {
        setError(appt.error.message);
        return;
      }
      if (appt.data) {
        setItem(appt.data);
        setStartsLocal(isoToLocalInput(appt.data.starts_at));
        setEndsLocal(isoToLocalInput(appt.data.ends_at));
      }
      setPrefs(pref.data ?? null);
      setClients(c.data ?? []);
      setLocations(l.data ?? []);
    })();
  }, [params.appointmentId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
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
    const result = await apiFetch<Appointment>(`/api/v1/appointments/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        client_id: item.client_id,
        location_id: item.location_id,
        starts_at: starts,
        ends_at: ends,
        notes: item.notes,
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
              `${c.client_name ?? "Cliente"} · ${new Date(c.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
          ),
        );
      }
      return;
    }
    router.replace("/app");
  }

  async function setStatus(status: string) {
    if (!item) return;
    if (status === "cancelled" && !window.confirm("Cancelar este compromisso?")) return;
    const result = await apiFetch<Appointment>(`/api/v1/appointments/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    if (result.error) {
      setError(result.error.message);
      return;
    }
    router.replace("/app");
  }

  const closed = item?.status === "completed" || item?.status === "no_show";

  if (!item && !error) {
    return <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>;
  }

  const tz = prefs?.timezone ?? "America/Sao_Paulo";

  return (
    <div className="space-y-4 animate-fade-up">
      <ContextualBar
        label={
          item
            ? `${formatOrgDateTime(item.starts_at, tz)} · ${item.client_name}`
            : null
        }
      />
      <BackLink href="/app/agenda" label="Agenda" />
      <h1 className="h-display text-3xl text-[var(--color-ink)]">Compromisso</h1>
      {item ? (
        <p className="text-sm text-[var(--color-ink-muted)]">
          Status: {appointmentStatusLabel(item.status)}
        </p>
      ) : null}
      {closed ? (
        <p
          role="status"
          className="rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm"
        >
          Aula encerrada
          {item?.status === "completed" ? " (realizada)" : " (falta)"}
          {item?.cycle_id
            ? " · contabilizada no ciclo do cliente"
            : " · sem ciclo vinculado para contabilizar"}
          .
        </p>
      ) : null}

      {item ? (
        <form onSubmit={save} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Cliente</span>
            <select
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
              value={item.client_id}
              onChange={(e) => setItem({ ...item, client_id: e.target.value })}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Local</span>
            <select
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
              value={item.location_id ?? ""}
              onChange={(e) =>
                setItem({ ...item, location_id: e.target.value || null })
              }
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
          />
          <TextField
            label="Fim"
            type="datetime-local"
            value={endsLocal}
            onChange={(e) => setEndsLocal(e.target.value)}
          />
          <TextField
            label="Observação interna"
            value={item.notes ?? ""}
            onChange={(e) => setItem({ ...item, notes: e.target.value || null })}
          />
          {error ? (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          ) : null}
          {conflicts.length ? (
            <ul className="text-sm text-[var(--color-danger)]">
              {conflicts.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : null}
          <Button type="submit" fullWidth disabled={saving || item.status === "cancelled"}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </form>
      ) : null}

      {item && item.status === "scheduled" ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-[var(--color-ink)]">Resultado (opcional)</p>
          <Button variant="secondary" fullWidth onClick={() => void setStatus("completed")}>
            Marcar como realizado
          </Button>
          <Button variant="secondary" fullWidth onClick={() => void setStatus("no_show")}>
            Falta do cliente
          </Button>
          <Button variant="secondary" fullWidth onClick={() => void setStatus("cancelled")}>
            Cancelar compromisso
          </Button>
        </div>
      ) : null}
    </div>
  );
}
