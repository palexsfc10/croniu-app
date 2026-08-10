"use client";

import { BackLink } from "@/components/app/back-link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, type Location } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

export default function NewLocationPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await apiFetch<Location>("/api/v1/locations", {
      method: "POST",
      body: JSON.stringify({
        name,
        address: address || null,
        address_detail: addressDetail || null,
        map_url: mapUrl || null,
        meeting_url: meetingUrl || null,
        notes: notes || null,
      }),
    });
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    router.replace(`/app/locations/${result.data?.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4 animate-fade-up">
      <BackLink href="/app/locations" label="Locais" />
      <h1 className="h-display text-3xl text-[var(--color-ink)]">Novo local</h1>
      <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
      <TextField label="Endereço" value={address} onChange={(e) => setAddress(e.target.value)} />
      <TextField
        label="Complemento / referência"
        value={addressDetail}
        onChange={(e) => setAddressDetail(e.target.value)}
      />
      <TextField label="URL do mapa" value={mapUrl} onChange={(e) => setMapUrl(e.target.value)} />
      <TextField
        label="URL de reunião online"
        value={meetingUrl}
        onChange={(e) => setMeetingUrl(e.target.value)}
      />
      <TextField label="Observação interna" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
      <Button type="submit" fullWidth disabled={saving}>
        {saving ? "Salvando…" : "Salvar local"}
      </Button>
    </form>
  );
}
