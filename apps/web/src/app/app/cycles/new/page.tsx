"use client";

import { BackLink } from "@/components/app/back-link";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  WEEKDAY_OPTIONS,
  apiFetch,
  formatBRL,
  formatDateBR,
  reaisToCents,
  type Client,
  type Cycle,
  type CyclePreview,
  type CycleTemplate,
  type Location,
  type Service,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { useAuth } from "@/components/auth/auth-provider";
import {
  ScheduleConflictAlert,
  isScheduleConflictCode,
  type ScheduleConflictItem,
} from "@/components/app/schedule-conflict-alert";
import {
  CycleOverlapAlert,
  isDuplicateCycleCode,
  isOverlappingCycleCode,
} from "@/components/app/cycle-overlap-alert";
import { lastInclusiveIso } from "@/lib/date-format";
import { safeReturnTo } from "@/lib/nomenclature";

function NewIntelligentCycleForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { me } = useAuth();
  const orgTz = me?.organization.timezone || "America/Sao_Paulo";
  const renewalRequestId = search.get("renewalRequestId");
  const [step, setStep] = useState(1);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [templates, setTemplates] = useState<CycleTemplate[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [listsReady, setListsReady] = useState(false);

  const clientIdFromQuery = search.get("clientId") ?? "";
  const [clientId, setClientId] = useState(clientIdFromQuery);
  const [serviceId, setServiceId] = useState(search.get("serviceId") ?? "");
  const [templateId, setTemplateId] = useState(search.get("templateId") ?? "");
  // Never default to "today" — the professional must choose when the cycle starts.
  const [startsOn, setStartsOn] = useState(search.get("startsOn") ?? "");
  const [weekdays, setWeekdays] = useState<number[]>(() => {
    const raw = search.get("weekdays");
    if (!raw) return [];
    return raw
      .split(",")
      .map((v) => Number.parseInt(v, 10))
      .filter((n) => n >= 0 && n <= 6);
  });
  const [discountReais, setDiscountReais] = useState("");
  const [finalReais, setFinalReais] = useState("");
  const [locationId, setLocationId] = useState("");
  const [startsTime, setStartsTime] = useState("09:00");
  const [preview, setPreview] = useState<CyclePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ScheduleConflictItem[]>([]);
  const [conflictCount, setConflictCount] = useState(0);
  const [cycleGuardCode, setCycleGuardCode] = useState<
    "DUPLICATE_CYCLE" | "OVERLAPPING_CYCLE" | null
  >(null);
  const [existingCycleId, setExistingCycleId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const template = templates.find((t) => t.id === templateId);
  const service = services.find((s) => s.id === serviceId);
  const client = clients.find((c) => c.id === clientId);
  const backHref = clientId
    ? `/app/clients/${clientId}/accompaniment`
    : "/app/cycles";
  const cycleReturnPath = (() => {
    const params = new URLSearchParams();
    if (clientId) params.set("clientId", clientId);
    if (serviceId) params.set("serviceId", serviceId);
    if (templateId) params.set("templateId", templateId);
    if (startsOn) params.set("startsOn", startsOn);
    if (weekdays.length) params.set("weekdays", weekdays.join(","));
    if (renewalRequestId) params.set("renewalRequestId", renewalRequestId);
    const existingReturn = safeReturnTo(search.get("returnTo"));
    if (existingReturn) params.set("returnTo", existingReturn);
    const q = params.toString();
    return q ? `/app/cycles/new?${q}` : "/app/cycles/new";
  })();

  useEffect(() => {
    void (async () => {
      const [c, s, t, l] = await Promise.all([
        apiFetch<Client[]>("/api/v1/clients?status=active"),
        apiFetch<Service[]>("/api/v1/services?status=active"),
        apiFetch<CycleTemplate[]>("/api/v1/cycle-templates?status=active"),
        apiFetch<Location[]>("/api/v1/locations?status=active"),
      ]);
      setClients(c.data ?? []);
      setServices(s.data ?? []);
      setTemplates(t.data ?? []);
      setLocations(l.data ?? []);
      setListsReady(true);
    })();
  }, []);

  function toggleDay(day: number) {
    setWeekdays((prev) => {
      if (prev.includes(day)) return prev.filter((d) => d !== day);
      if (template && prev.length >= template.weekly_frequency) return prev;
      return [...prev, day].sort((a, b) => a - b);
    });
  }

  async function loadPreview() {
    setError(null);
    setConflicts([]);
    setConflictCount(0);
    if (!startsOn) {
      setError("Informe a data de início do ciclo.");
      return false;
    }
    if (!serviceId || !templateId || weekdays.length === 0) {
      setError("Complete serviço, modelo e dias da semana.");
      return false;
    }
    if (template && weekdays.length !== template.weekly_frequency) {
      setError(`Selecione exatamente ${template.weekly_frequency} dia(s).`);
      return false;
    }
    const body: Record<string, unknown> = {
      service_id: serviceId,
      cycle_template_id: templateId,
      starts_on: startsOn,
      weekdays,
    };
    if (finalReais.trim()) {
      const cents = reaisToCents(finalReais);
      if (cents == null) {
        setError("Valor final inválido.");
        return false;
      }
      body.final_cents = cents;
    } else if (discountReais.trim()) {
      const cents = reaisToCents(discountReais);
      if (cents == null) {
        setError("Desconto inválido.");
        return false;
      }
      body.adjustment_cents = -Math.abs(cents);
    }
    const result = await apiFetch<CyclePreview>("/api/v1/cycles/preview", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (result.error) {
      setError(result.error.message);
      return false;
    }
    setPreview(result.data ?? null);
    return true;
  }

  async function goPreview() {
    const ok = await loadPreview();
    if (ok) setStep(4);
  }

  async function confirm() {
    if (!startsOn) {
      setError("Informe a data de início do ciclo.");
      return;
    }
    setSaving(true);
    setError(null);
    setConflicts([]);
    setConflictCount(0);
    setCycleGuardCode(null);
    setExistingCycleId(null);
    const body: Record<string, unknown> = {
      client_id: clientId,
      service_id: serviceId,
      cycle_template_id: templateId,
      starts_on: startsOn,
      weekdays,
      create_receivable: true,
      generate_appointments: true,
      starts_time: `${startsTime}:00`,
      location_id: locationId || null,
      idempotency_key: `web-${crypto.randomUUID()}`,
    };
    if (finalReais.trim()) {
      body.final_cents = reaisToCents(finalReais);
    } else if (discountReais.trim()) {
      const cents = reaisToCents(discountReais);
      body.adjustment_cents = cents == null ? 0 : -Math.abs(cents);
    }
    if (renewalRequestId) {
      body.renewal_request_id = renewalRequestId;
    }
    const result = await apiFetch<Cycle>("/api/v1/cycles/intelligent", {
      method: "POST",
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (result.error) {
      const details = result.error.details as
        | {
            conflicts?: ScheduleConflictItem[];
            conflict_count?: number;
            existing_cycle_id?: string;
          }
        | undefined;
      const items = details?.conflicts ?? [];
      setConflicts(items);
      setConflictCount(details?.conflict_count ?? items.length);
      if (isScheduleConflictCode(result.error.code)) {
        setError("schedule_conflict");
      } else if (
        isDuplicateCycleCode(result.error.code) ||
        isOverlappingCycleCode(result.error.code)
      ) {
        setCycleGuardCode(result.error.code as "DUPLICATE_CYCLE" | "OVERLAPPING_CYCLE");
        setExistingCycleId(details?.existing_cycle_id ?? null);
        setError(result.error.message);
      } else {
        setError(result.error.message);
      }
      return;
    }
    const returnTo = search.get("returnTo");
    if (returnTo && returnTo.startsWith("/app/") && !returnTo.includes("://")) {
      router.replace(`${returnTo}?done=cycle`);
      return;
    }
    router.replace(`/app/cycles/${result.data!.id}`);
  }

  const lessonSummary = useMemo(() => {
    if (!preview) return "";
    const shown = preview.lesson_dates.slice(0, 6).map(formatDateBR);
    const more = preview.lesson_dates.length > 6 ? ` +${preview.lesson_dates.length - 6}` : "";
    return `${shown.join(", ")}${more}`;
  }, [preview]);

  return (
    <div className="space-y-4 animate-fade-up">
      <BackLink
        href={backHref}
        label={clientId ? "Voltar ao acompanhamento" : "Ciclos"}
      />
      {client ? (
        <p className="text-sm text-[var(--color-ink-muted)]">
          Ciclo para <strong className="text-[var(--color-ink)]">{client.full_name}</strong>
        </p>
      ) : null}
      <h1 className="h-display text-3xl text-[var(--color-ink)]">Novo ciclo</h1>
      <p className="text-sm text-[var(--color-ink-muted)]">Passo {step} de 4</p>

      {step === 1 ? (
        <div className="space-y-4">
          <label className="block space-y-1.5" htmlFor="cycle-client">
            <span className="text-sm font-medium">Cliente</span>
            <select
              id="cycle-client"
              aria-label="Cliente"
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
            >
              <option value="">Selecione</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5" htmlFor="cycle-service">
            <span className="text-sm font-medium">Serviço</span>
            <select
              id="cycle-service"
              aria-label="Serviço"
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
            >
              <option value="">Selecione</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {formatBRL(s.default_price_cents)}/aula
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5" htmlFor="cycle-template">
            <span className="text-sm font-medium">Modelo de ciclo</span>
            <select
              id="cycle-template"
              aria-label="Modelo de ciclo"
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                setWeekdays([]);
              }}
            >
              <option value="">Selecione</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          {listsReady && !services.length ? (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3">
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                Você precisa de um serviço antes de criar um ciclo.
              </p>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                O serviço informa o que será oferecido, sua duração e o valor.
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                <Link
                  href={`/app/services/new?returnTo=${encodeURIComponent(cycleReturnPath)}`}
                  className="text-sm font-semibold text-[var(--color-primary)]"
                >
                  Criar serviço
                </Link>
                <Link href={backHref} className="text-sm font-medium text-[var(--color-ink-muted)]">
                  Voltar
                </Link>
              </div>
            </div>
          ) : null}
          {listsReady && services.length > 0 && !templates.length ? (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3">
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                Você ainda não criou um modelo de ciclo.
              </p>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                Nesta tela, o modelo é necessário para calcular frequência e período do ciclo.
              </p>
              <Link
                href={`/app/cycle-templates/new?returnTo=${encodeURIComponent(cycleReturnPath)}`}
                className="mt-2 inline-block text-sm font-semibold text-[var(--color-primary)]"
              >
                Criar modelo
              </Link>
            </div>
          ) : null}
          <Button
            fullWidth
            disabled={!clientId || !serviceId || !templateId}
            onClick={() => setStep(2)}
          >
            Continuar
          </Button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <TextField
            label="Data de início do ciclo"
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            required
          />
          <p className="text-sm text-[var(--color-ink-muted)]">
            Escolha quando o ciclo começa. A data de renovação é calculada pelo modelo; o ciclo
            atual fica vigente até o dia anterior.
          </p>
          {error && step === 2 ? (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          ) : null}
          <fieldset>
            <legend className="text-sm font-medium">
              Dias da semana
              {template ? ` (${template.weekly_frequency})` : ""}
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map((d) => {
                const active = weekdays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    aria-pressed={active}
                    className={`min-h-11 min-w-11 rounded-[var(--radius-md)] border px-3 text-sm font-semibold ${
                      active
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)]"
                    }`}
                    onClick={() => toggleDay(d.value)}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setStep(1)}>
              Voltar
            </Button>
            <Button fullWidth disabled={!startsOn || weekdays.length === 0} onClick={() => void goPreview()}>
              Calcular aulas
            </Button>
          </div>
        </div>
      ) : null}

      {step === 4 && preview ? (
        <div className="space-y-4">
          <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
            <p>
              <span className="text-[var(--color-ink-muted)]">Cliente</span> · {client?.full_name}
            </p>
            <p>
              <span className="text-[var(--color-ink-muted)]">Serviço</span> · {service?.name}
            </p>
            <p>
              <span className="text-[var(--color-ink-muted)]">Vigência</span> ·{" "}
              {formatDateBR(preview.starts_on)} a {formatDateBR(lastInclusiveIso(preview.ends_on))}
            </p>
            <p>
              <span className="text-[var(--color-ink-muted)]">Aulas até</span> ·{" "}
              {formatDateBR(lastInclusiveIso(preview.ends_on))}
            </p>
            <p>
              <span className="text-[var(--color-ink-muted)]">Data de renovação</span> ·{" "}
              {formatDateBR(preview.ends_on)}
            </p>
            <p>
              <span className="text-[var(--color-ink-muted)]">Aulas</span> · {preview.lesson_count}{" "}
              ({lessonSummary})
            </p>
            <p>
              <span className="text-[var(--color-ink-muted)]">Valor/aula</span> ·{" "}
              {formatBRL(preview.unit_price_cents)}
            </p>
            <p>
              <span className="text-[var(--color-ink-muted)]">Subtotal</span> ·{" "}
              {formatBRL(preview.subtotal_cents)}
            </p>
            <p>
              <span className="text-[var(--color-ink-muted)]">Ajuste</span> ·{" "}
              {formatBRL(preview.adjustment_cents)}
            </p>
            <p className="text-base font-semibold">
              Total · {formatBRL(preview.final_cents)}
            </p>
          </div>

          <TextField
            label="Data de início do ciclo"
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            required
          />
          <p className="text-sm text-[var(--color-ink-muted)]">
            Alterar a data recalcula vigência, renovação e lista de aulas.
          </p>

          <TextField
            label="Desconto (R$) — opcional"
            inputMode="decimal"
            value={discountReais}
            onChange={(e) => {
              setDiscountReais(e.target.value);
              setFinalReais("");
            }}
          />
          <TextField
            label="Ou valor final (R$) — opcional"
            inputMode="decimal"
            value={finalReais}
            onChange={(e) => {
              setFinalReais(e.target.value);
              setDiscountReais("");
            }}
          />
          <Button variant="secondary" fullWidth onClick={() => void loadPreview()}>
            Recalcular ciclo e valores
          </Button>

          <p className="text-sm text-[var(--color-ink-muted)]">
            As aulas serão adicionadas automaticamente à Agenda conforme a programação.
          </p>
          <div className="space-y-3">
            <TextField
              label="Horário"
              type="time"
              value={startsTime}
              onChange={(e) => setStartsTime(e.target.value)}
            />
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
          </div>

          {error === "schedule_conflict" ? (
            <ScheduleConflictAlert
              conflicts={conflicts}
              conflictCount={conflictCount}
              timeZone={orgTz}
              onAdjust={() => {
                setError(null);
                setStep(2);
              }}
            />
          ) : cycleGuardCode ? (
            <CycleOverlapAlert
              code={cycleGuardCode}
              message={error || ""}
              existingCycleId={existingCycleId}
              clientId={clientId}
              onAdjustPeriod={() => {
                setError(null);
                setCycleGuardCode(null);
              }}
              onCancel={() => {
                router.replace(
                  clientId ? `/app/clients/${clientId}` : "/app/cycles"
                );
              }}
            />
          ) : error ? (
            <div
              role="alert"
              className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-danger)]/25 bg-[var(--color-danger-subtle)] px-3 py-3"
            >
              <p className="text-sm font-semibold text-[var(--color-danger)]">{error}</p>
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setStep(2)}>
              Voltar
            </Button>
            <Button fullWidth disabled={saving} onClick={() => void confirm()}>
              {saving
                ? "Salvando…"
                : renewalRequestId
                  ? "Confirmar pagamento e aprovar renovação"
                  : "Confirmar ciclo"}
            </Button>
          </div>
        </div>
      ) : null}

      {error && step !== 4 ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function NewCyclePage() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p>}>
      <NewIntelligentCycleForm />
    </Suspense>
  );
}
