"use client";

import { useEffect, useMemo, useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useAuth } from "@/components/auth/auth-provider";
import {
  apiFetch,
  WEEKDAY_OPTIONS,
  type AvailabilitySettings,
  type DaySchedule,
  type OrgPreferences,
  type PaymentSettings,
  type ProfessionProfile,
} from "@/lib/api";
import {
  PROFESSION_OPTIONS,
  SPORTS_SPECIALTIES,
  TUTOR_SPECIALTIES,
  USE_CASE_OPTIONS,
  recommendedFormLabel,
} from "@/lib/nomenclature";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

function SectionCard({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-border)]/80 bg-[var(--color-surface)] p-4 scroll-mt-20"
    >
      <div>
        <h2 className="text-base font-semibold text-[var(--color-ink)]">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function ProfessionSection() {
  const { refresh } = useAuth();
  const [profile, setProfile] = useState<ProfessionProfile | null>(null);
  const [code, setCode] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [other, setOther] = useState("");
  const [useCases, setUseCases] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await apiFetch<ProfessionProfile>("/api/v1/organization/profession");
      if (result.error) {
        setError(result.error.message);
        return;
      }
      const data = result.data;
      if (!data) return;
      setProfile(data);
      setCode(data.profession_code ?? "");
      setSpecialty(data.profession_specialty ?? "");
      setOther(data.profession_other ?? "");
      setUseCases(data.use_cases ?? []);
    })();
  }, []);

  function toggleUseCase(value: string) {
    setUseCases((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    setInfo(null);
    const result = await apiFetch<ProfessionProfile>("/api/v1/organization/profession", {
      method: "PATCH",
      body: JSON.stringify({
        profession_code: code || null,
        profession_specialty: specialty || null,
        profession_other: other || null,
        use_cases: useCases,
        profession_onboarding_done: true,
      }),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setProfile(result.data ?? null);
    setInfo("Perfil profissional atualizado. Dados históricos foram preservados.");
    await refresh();
  }

  return (
    <SectionCard
      id="perfil-profissional"
      title="Perfil profissional"
      description="Usamos sua área para recomendar formulários e adaptar a linguagem — sem bloquear recursos."
    >
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

      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Qual é a sua área de atuação?</span>
        <select
          className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setSpecialty("");
          }}
        >
          <option value="">Selecionar…</option>
          {PROFESSION_OPTIONS.map((opt) => (
            <option key={opt.code} value={opt.code}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      {code === "sports_teacher" ? (
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Especialidade (opcional)</span>
          <select
            className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
          >
            <option value="">—</option>
            {SPORTS_SPECIALTIES.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {code === "private_tutor" ? (
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Área (opcional)</span>
          <select
            className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
          >
            <option value="">—</option>
            {TUTOR_SPECIALTIES.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {code === "other" ? (
        <TextField
          label="Como você descreve sua atuação?"
          value={other}
          onChange={(e) => setOther(e.target.value)}
        />
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          Como você acompanha seus clientes ou alunos?
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {USE_CASE_OPTIONS.map((opt) => (
            <label
              key={opt.code}
              className="flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm"
            >
              <input
                type="checkbox"
                checked={useCases.includes(opt.code)}
                onChange={() => toggleUseCase(opt.code)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      {code ? (
        <p className="text-sm text-[var(--color-ink-muted)]">
          Formulário recomendado para novos links:{" "}
          <strong>{recommendedFormLabel(code, specialty)}</strong>
          {profile?.recommended_form_kind
            ? ` (atual no servidor: ${profile.recommended_form_kind})`
            : ""}
          .
        </p>
      ) : null}

      <Button disabled={busy || !code} onClick={() => void save()}>
        Salvar perfil profissional
      </Button>
    </SectionCard>
  );
}

function listTimeZones(): string[] {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf;
    if (typeof supported === "function") {
      return supported("timeZone");
    }
  } catch {
    // fall through
  }
  return [
    "America/Sao_Paulo",
    "America/Manaus",
    "America/Belem",
    "America/Fortaleza",
    "America/Recife",
    "America/Bahia",
    "America/Cuiaba",
    "America/Porto_Velho",
    "America/Rio_Branco",
    "America/Noronha",
    "UTC",
  ];
}

function TimezoneSection() {
  const zones = useMemo(() => listTimeZones(), []);
  const [prefs, setPrefs] = useState<OrgPreferences | null>(null);
  const [query, setQuery] = useState("");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await apiFetch<OrgPreferences>("/api/v1/organization/preferences");
      if (result.data) {
        setPrefs(result.data);
        setTimezone(result.data.timezone);
      } else if (result.error) {
        setError(result.error.message);
      }
    })();
  }, []);

  const filtered = zones.filter((z) => z.toLowerCase().includes(query.trim().toLowerCase()));
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await apiFetch<OrgPreferences>("/api/v1/organization/preferences", {
      method: "PATCH",
      body: JSON.stringify({ timezone }),
    });
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (result.data) {
      setPrefs(result.data);
      setSaved(true);
    }
  }

  return (
    <SectionCard
      id="fuso-horario"
      title="Fuso horário"
      description={`Fuso IANA da organização. Instantes ficam em UTC; a interface usa este fuso — não o do navegador (${browserTz}).`}
    >
      {prefs ? (
        <p className="text-sm text-[var(--color-ink-muted)]">
          Hoje na organização: <strong>{prefs.local_today}</strong>
        </p>
      ) : null}
      <TextField
        label="Buscar fuso"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ex.: Sao_Paulo"
      />
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-[var(--color-ink)]">Fuso horário</span>
        <select
          className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-base"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          aria-label="Fuso horário IANA"
        >
          {(filtered.includes(timezone) ? filtered : [timezone, ...filtered]).map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-sm text-[var(--color-success)]">
          Fuso salvo.
        </p>
      ) : null}
      <Button onClick={() => void save()} disabled={saving}>
        {saving ? "Salvando…" : "Salvar fuso"}
      </Button>
    </SectionCard>
  );
}

const DURATION_OPTIONS = [30, 45, 60, 90];
const FULL_WEEKDAY_LABELS = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];

function defaultDay(weekday: number): DaySchedule {
  const active = weekday < 5;
  return {
    weekday,
    is_active: active,
    starts_time: "08:00",
    ends_time: "18:00",
    break_starts_time: active ? "12:00" : null,
    break_ends_time: active ? "13:00" : null,
    default_duration_minutes: 60,
  };
}

function defaultWeek(): DaySchedule[] {
  return WEEKDAY_OPTIONS.map((opt) => defaultDay(opt.value));
}

function AvailabilitySection() {
  const [days, setDays] = useState<DaySchedule[]>(defaultWeek());
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await apiFetch<AvailabilitySettings>("/api/v1/availability/settings");
      if (result.data) {
        setConfigured(result.data.configured);
        if (result.data.configured && result.data.days.length === 7) {
          setDays([...result.data.days].sort((a, b) => a.weekday - b.weekday));
        }
      } else if (result.error) {
        setError(result.error.message);
      }
      setLoading(false);
    })();
  }, []);

  function updateDay(weekday: number, patch: Partial<DaySchedule>) {
    setDays((prev) => prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
    setSaved(false);
  }

  function applyMondayToWeekdays() {
    const monday = days.find((d) => d.weekday === 0);
    if (!monday) return;
    setDays((prev) =>
      prev.map((d) =>
        d.weekday >= 1 && d.weekday <= 4
          ? {
              ...d,
              is_active: monday.is_active,
              starts_time: monday.starts_time,
              ends_time: monday.ends_time,
              break_starts_time: monday.break_starts_time,
              break_ends_time: monday.break_ends_time,
              default_duration_minutes: monday.default_duration_minutes,
            }
          : d,
      ),
    );
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await apiFetch<AvailabilitySettings>("/api/v1/availability/settings", {
      method: "PUT",
      body: JSON.stringify({ days }),
    });
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (result.data) {
      setConfigured(result.data.configured);
      setSaved(true);
    }
  }

  return (
    <SectionCard
      id="disponibilidade"
      title="Jornada e disponibilidade"
      description="Configure seus horários de atendimento para que o Croniu identifique vagas disponíveis na sua agenda."
    >
      <div className="flex items-center gap-2">
        {configured ? (
          <span className="rounded-full bg-[var(--color-success-subtle)] px-2 py-0.5 text-xs font-semibold text-[var(--color-success)]">
            Configurado
          </span>
        ) : null}
      </div>

      {loading ? <p className="text-sm text-[var(--color-ink-muted)]">Carregando…</p> : null}

      {!loading ? (
        <>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={applyMondayToWeekdays}>
              Aplicar segunda aos dias úteis
            </Button>
          </div>

          <div className="space-y-3">
            {WEEKDAY_OPTIONS.map((opt) => {
              const day = days.find((d) => d.weekday === opt.value);
              if (!day) return null;
              return (
                <div
                  key={opt.value}
                  className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-muted)]/40 p-3.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[var(--color-ink)]">
                      {FULL_WEEKDAY_LABELS[opt.value]}
                    </span>
                    <label className="flex min-h-9 items-center gap-2 text-sm text-[var(--color-ink-muted)]">
                      <input
                        type="checkbox"
                        checked={day.is_active}
                        onChange={(e) => updateDay(opt.value, { is_active: e.target.checked })}
                      />
                      Atende
                    </label>
                  </div>

                  {day.is_active ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <TextField
                          label="Início"
                          type="time"
                          value={day.starts_time.slice(0, 5)}
                          onChange={(e) => updateDay(opt.value, { starts_time: e.target.value })}
                        />
                        <TextField
                          label="Fim"
                          type="time"
                          value={day.ends_time.slice(0, 5)}
                          onChange={(e) => updateDay(opt.value, { ends_time: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <TextField
                          label="Intervalo — início"
                          type="time"
                          value={day.break_starts_time?.slice(0, 5) ?? ""}
                          onChange={(e) =>
                            updateDay(opt.value, {
                              break_starts_time: e.target.value || null,
                              break_ends_time:
                                e.target.value ? day.break_ends_time || day.ends_time : null,
                            })
                          }
                        />
                        <TextField
                          label="Intervalo — fim"
                          type="time"
                          value={day.break_ends_time?.slice(0, 5) ?? ""}
                          onChange={(e) =>
                            updateDay(opt.value, { break_ends_time: e.target.value || null })
                          }
                        />
                      </div>
                      <label className="block space-y-1.5 text-sm">
                        <span className="font-medium text-[var(--color-ink)]">
                          Duração padrão do atendimento
                        </span>
                        <select
                          className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
                          value={day.default_duration_minutes}
                          onChange={(e) =>
                            updateDay(opt.value, {
                              default_duration_minutes: Number(e.target.value),
                            })
                          }
                        >
                          {DURATION_OPTIONS.map((m) => (
                            <option key={m} value={m}>
                              {m} minutos
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--color-ink-subtle)]">
                      Sem atendimento neste dia.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {error ? (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          ) : null}
          {saved ? (
            <p role="status" className="text-sm text-[var(--color-success)]">
              Horários salvos.
            </p>
          ) : null}
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Salvando…" : "Salvar horários"}
          </Button>
        </>
      ) : null}
    </SectionCard>
  );
}

function ReceivingSettingsSection() {
  const [pay, setPay] = useState<PaymentSettings>({
    show_on_my_cycle: true,
    institution: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const payRes = await apiFetch<PaymentSettings>("/api/v1/organization/payment-settings");
      if (payRes.data) setPay(payRes.data);
      else if (payRes.error) setError(payRes.error.message);
    })();
  }, []);

  async function save() {
    setSaved(false);
    setError(null);
    const res = await apiFetch<PaymentSettings>("/api/v1/organization/payment-settings", {
      method: "PUT",
      body: JSON.stringify({
        holder_name: pay.holder_name || null,
        pix_key_type: pay.pix_key_type || null,
        pix_key: pay.pix_key || null,
        institution: pay.institution || null,
        instructions: pay.instructions || null,
        external_payment_url: pay.external_payment_url || null,
        show_on_my_cycle: pay.show_on_my_cycle,
        whatsapp_e164: pay.whatsapp_e164 || null,
        whatsapp_enabled: Boolean(pay.whatsapp_enabled),
      }),
    });
    if (res.error) setError(res.error.message);
    else {
      if (res.data) setPay(res.data);
      setSaved(true);
    }
  }

  return (
    <SectionCard
      id="recebimentos"
      title="Recebimentos"
      description="Instruções exibidas no Portal do cliente para o pagamento do próprio acompanhamento (Pix ou link https). Sem gateway. Isto é diferente da assinatura do Croniu."
    >
      <TextField
        label="Nome do titular"
        value={pay.holder_name ?? ""}
        onChange={(e) => setPay((p) => ({ ...p, holder_name: e.target.value }))}
      />
      <label className="block space-y-1.5 text-sm">
        Tipo da chave Pix
        <select
          className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
          value={pay.pix_key_type ?? ""}
          onChange={(e) =>
            setPay((p) => ({
              ...p,
              pix_key_type: e.target.value || null,
            }))
          }
        >
          <option value="">—</option>
          <option value="cpf">CPF</option>
          <option value="cnpj">CNPJ</option>
          <option value="email">E-mail</option>
          <option value="phone">Telefone</option>
          <option value="random">Chave aleatória</option>
        </select>
      </label>
      <TextField
        label="Chave Pix"
        value={pay.pix_key ?? ""}
        onChange={(e) => setPay((p) => ({ ...p, pix_key: e.target.value }))}
      />
      <TextField
        label="Instituição (opcional)"
        value={pay.institution ?? ""}
        onChange={(e) => setPay((p) => ({ ...p, institution: e.target.value }))}
      />
      <TextField
        label="Instruções adicionais"
        value={pay.instructions ?? ""}
        onChange={(e) => setPay((p) => ({ ...p, instructions: e.target.value }))}
      />
      <TextField
        label="Link externo (https)"
        value={pay.external_payment_url ?? ""}
        onChange={(e) => setPay((p) => ({ ...p, external_payment_url: e.target.value }))}
      />
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={pay.show_on_my_cycle}
          onChange={(e) => setPay((p) => ({ ...p, show_on_my_cycle: e.target.checked }))}
        />
        Disponibilizar Pix na etapa de renovação do cliente
      </label>
      <TextField
        label="WhatsApp (DDI + DDD + número)"
        value={pay.whatsapp_e164 ?? ""}
        onChange={(e) => setPay((p) => ({ ...p, whatsapp_e164: e.target.value }))}
        placeholder="5511999999999"
      />
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(pay.whatsapp_enabled)}
          onChange={(e) => setPay((p) => ({ ...p, whatsapp_enabled: e.target.checked }))}
        />
        Disponibilizar envio de comprovante pelo WhatsApp na renovação
      </label>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-sm text-[var(--color-success)]">
          Recebimentos salvos.
        </p>
      ) : null}
      <Button variant="secondary" onClick={() => void save()}>
        Salvar recebimentos
      </Button>
    </SectionCard>
  );
}

export default function WorkspacePage() {
  const { me } = useAuth();

  return (
    <div className="mx-auto max-w-2xl space-y-5 animate-fade-up">
      <BackLink href="/app/settings" label="Conta e configurações" />
      <div>
        <h1 className="h-display text-3xl text-[var(--color-ink)]">Workspace</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Dados do seu negócio — separados da sua conta pessoal e da assinatura do Croniu.
        </p>
        {me ? (
          <p className="mt-2 text-sm font-medium text-[var(--color-ink)]">
            {me.organization.name}
          </p>
        ) : null}
      </div>

      <ProfessionSection />
      <TimezoneSection />
      <AvailabilitySection />
      <ReceivingSettingsSection />
    </div>
  );
}
