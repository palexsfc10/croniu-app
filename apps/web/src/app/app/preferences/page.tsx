"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, type OrgPreferences } from "@/lib/api";
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
      <Link href="/app/profile" className="text-sm font-semibold text-[var(--color-ink-muted)]">
        ← Mais
      </Link>
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
    </div>
  );
}
