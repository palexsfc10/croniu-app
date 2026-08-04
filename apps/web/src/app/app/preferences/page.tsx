"use client";

import { BackLink } from "@/components/app/back-link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, type OrgPreferences, type PaymentSettings } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

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

export default function PreferencesPage() {
  const zones = useMemo(() => listTimeZones(), []);
  const [prefs, setPrefs] = useState<OrgPreferences | null>(null);
  const [query, setQuery] = useState("");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [pay, setPay] = useState<PaymentSettings>({
    show_on_my_cycle: true,
    institution: null,
  });
  const [paySaved, setPaySaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await apiFetch<OrgPreferences>("/api/v1/organization/preferences");
      if (result.data) {
        setPrefs(result.data);
        setTimezone(result.data.timezone);
      } else if (result.error) {
        setError(result.error.message);
      }
      const payRes = await apiFetch<PaymentSettings>("/api/v1/organization/payment-settings");
      if (payRes.data) setPay(payRes.data);
    })();
  }, []);

  const filtered = zones.filter((z) => z.toLowerCase().includes(query.trim().toLowerCase()));

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

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="space-y-4 animate-fade-up">
      <BackLink href="/app/profile" label="Mais" />
      <div>
        <h1 className="h-display text-3xl text-[var(--color-ink)]">Preferências</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Fuso IANA da organização. Instantes ficam em UTC; a interface usa este fuso — não o do
          navegador ({browserTz}).
        </p>
      </div>
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
          Preferências salvas.
        </p>
      ) : null}
      <Button fullWidth onClick={() => void save()} disabled={saving}>
        {saving ? "Salvando…" : "Salvar fuso"}
      </Button>

      <section className="space-y-3 border-t border-[var(--color-border)] pt-6">
        <h2 className="text-lg font-semibold">Recebimentos</h2>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Instruções exibidas no Meu Ciclo (Pix ou link https). Sem gateway.
        </p>
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
        {paySaved ? (
          <p role="status" className="text-sm text-[var(--color-success)]">
            Recebimentos salvos.
          </p>
        ) : null}
        <Button
          fullWidth
          variant="secondary"
          onClick={() => {
            void (async () => {
              setPaySaved(false);
              const res = await apiFetch<PaymentSettings>(
                "/api/v1/organization/payment-settings",
                {
                  method: "PUT",
                  body: JSON.stringify({
                    holder_name: pay.holder_name || null,
                    pix_key_type: pay.pix_key_type || null,
                    pix_key: pay.pix_key || null,
                    institution: pay.institution || null,
                    instructions: pay.instructions || null,
                    external_payment_url: pay.external_payment_url || null,
                    show_on_my_cycle: pay.show_on_my_cycle,
                  }),
                },
              );
              if (res.error) setError(res.error.message);
              else {
                if (res.data) setPay(res.data);
                setPaySaved(true);
              }
            })();
          }}
        >
          Salvar recebimentos
        </Button>
      </section>
    </div>
  );
}
