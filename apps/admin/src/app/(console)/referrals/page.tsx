"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, type Paginated, type UserListItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, THead, Th, TBody, Tr, Td, TableSkeleton } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { IconCheck, IconGift, IconSearch } from "@/components/ui/icons";

type PartnerSummary = {
  partner_id: string;
  user_id: string;
  user_full_name: string;
  user_email: string;
  enabled: boolean;
  campaign_id: string | null;
  code: string | null;
  status: string | null;
  discount_percent: number | null;
  commission_percent: string | null;
  signups: number;
  payers: number;
  active: number;
  projected_monthly_commission_cents: number;
  link: string | null;
};

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ReferralsPage() {
  const [partners, setPartners] = useState<PartnerSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<UserListItem[]>([]);
  const [userSearchStatus, setUserSearchStatus] = useState<"idle" | "empty" | "error">("idle");
  const [selectedUser, setSelectedUser] = useState<UserListItem | null>(null);
  const [code, setCode] = useState("");
  const [commission, setCommission] = useState("10");
  const [codeAvailable, setCodeAvailable] = useState<boolean | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadPartners = useCallback(async () => {
    setLoading(true);
    const result = await apiFetch<{ items: PartnerSummary[] }>("/api/v1/platform/referrals");
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setPartners(result.data?.items ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount reload
    void loadPartners();
  }, [loadPartners]);

  async function searchUsers() {
    if (userSearch.trim().length < 2) return;
    const result = await apiFetch<Paginated<UserListItem>>(
      `/api/v1/platform/users?page=1&page_size=10&search=${encodeURIComponent(userSearch.trim())}`,
    );
    if (result.error) {
      setUserResults([]);
      setUserSearchStatus("error");
      return;
    }
    const items = result.data?.items ?? [];
    setUserResults(items);
    setUserSearchStatus(items.length === 0 ? "empty" : "idle");
  }

  async function checkCodeAvailability(value: string) {
    setCode(value);
    setCodeAvailable(null);
    const normalized = value.trim();
    if (normalized.length < 3) return;
    const result = await apiFetch<{ available: boolean }>(
      `/api/v1/platform/referrals/code-availability?code=${encodeURIComponent(normalized)}`,
    );
    if (!result.error) setCodeAvailable(result.data?.available ?? null);
  }

  async function enablePartner() {
    if (!selectedUser) {
      setFormError("Selecione um usuário.");
      return;
    }
    if (code.trim().length < 3) {
      setFormError("Informe um código com pelo menos 3 caracteres.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const result = await apiFetch<PartnerSummary>("/api/v1/platform/referrals", {
      method: "POST",
      body: JSON.stringify({
        user_id: selectedUser.id,
        code: code.trim(),
        commission_percent: commission,
      }),
    });
    setSubmitting(false);
    if (result.error) {
      setFormError(result.error.message);
      return;
    }
    setSelectedUser(null);
    setUserSearch("");
    setUserResults([]);
    setUserSearchStatus("idle");
    setCode("");
    setCommission("10");
    setCodeAvailable(null);
    await loadPartners();
  }

  async function toggleStatus(partner: PartnerSummary) {
    const result = await apiFetch<PartnerSummary>(
      `/api/v1/platform/referrals/${partner.partner_id}/status?enabled=${!partner.enabled}`,
      { method: "PATCH" },
    );
    if (result.error) {
      setError(result.error.message);
      return;
    }
    await loadPartners();
  }

  async function updateCommission(partner: PartnerSummary, value: string) {
    const result = await apiFetch<PartnerSummary>(
      `/api/v1/platform/referrals/${partner.partner_id}/commission`,
      { method: "PATCH", body: JSON.stringify({ commission_percent: value }) },
    );
    if (result.error) {
      setError(result.error.message);
      return;
    }
    await loadPartners();
  }

  async function copyLink(partner: PartnerSummary) {
    if (!partner.link) return;
    try {
      await navigator.clipboard.writeText(partner.link);
      setCopiedId(partner.partner_id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard API unavailable — link is still visible in the table.
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h-display text-3xl">Parceiros e indicações</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Habilite divulgadores, defina o código do cupom e acompanhe cadastros, pagantes e
          ativos. A comissão é uma projeção interna — não gera pagamento nem repasse automático.
        </p>
      </div>

      <Card>
        <CardHeader title="Habilitar divulgador" />

        {!selectedUser ? (
          <div className="space-y-2">
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                void searchUsers();
              }}
            >
              <div className="flex-1">
                <TextField
                  label="Buscar usuário por nome ou e-mail"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
              </div>
              <Button type="submit">
                <IconSearch className="h-4 w-4" /> Buscar
              </Button>
            </form>
            {userSearchStatus === "empty" ? (
              <p className="text-sm text-[var(--color-ink-muted)]">
                Nenhum usuário encontrado para “{userSearch.trim()}”. Verifique o nome ou e-mail e
                tente novamente.
              </p>
            ) : null}
            {userSearchStatus === "error" ? (
              <p role="alert" className="text-sm text-[var(--color-danger)]">
                Não foi possível buscar usuários agora. Tente novamente.
              </p>
            ) : null}
            {userResults.length > 0 ? (
              <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
                {userResults.map((user) => (
                  <li key={user.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{user.full_name}</p>
                      <p className="truncate text-xs text-[var(--color-ink-muted)]">
                        {user.email_masked}
                        {user.organization_name ? ` · ${user.organization_name}` : ""}
                      </p>
                    </div>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedUser(user)}>
                      Selecionar
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{selectedUser.full_name}</p>
                <p className="truncate text-xs text-[var(--color-ink-muted)]">
                  {selectedUser.email_masked}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedUser(null)}>
                Trocar
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <TextField
                  label="Código do cupom"
                  value={code}
                  onChange={(e) => void checkCodeAvailability(e.target.value)}
                />
                <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                  Letras, números, hífen ou underscore. 3 a 32 caracteres.
                </p>
                {codeAvailable === false ? (
                  <p className="mt-1 text-xs text-[var(--color-danger)]">
                    Este código já está em uso ou é reservado.
                  </p>
                ) : null}
                {codeAvailable === true ? (
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-[var(--color-success)]">
                    <IconCheck className="h-3.5 w-3.5" /> Código disponível.
                  </p>
                ) : null}
              </div>
              <div>
                <TextField
                  label="Comissão prevista (%)"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={commission}
                  onChange={(e) => setCommission(e.target.value)}
                />
                <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                  Apenas projeção interna. Não altera o desconto do cliente (fixo em 10%).
                </p>
              </div>
            </div>
            {formError ? (
              <p role="alert" className="text-sm text-[var(--color-danger)]">
                {formError}
              </p>
            ) : null}
            <Button type="button" disabled={submitting} onClick={() => void enablePartner()}>
              {submitting ? "Habilitando…" : "Habilitar divulgador"}
            </Button>
          </div>
        )}
      </Card>

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">Divulgadores</h2>
        {loading ? <TableSkeleton columns={9} /> : null}
        {!loading && partners.length === 0 ? (
          <EmptyState icon={<IconGift className="h-8 w-8" />} title="Nenhum divulgador habilitado ainda" />
        ) : null}
        {!loading && partners.length > 0 ? (
          <Table>
            <THead>
              <Th>Divulgador</Th>
              <Th>Código</Th>
              <Th>Status</Th>
              <Th>Desconto</Th>
              <Th>Comissão prevista</Th>
              <Th>Cadastros</Th>
              <Th>Pagantes</Th>
              <Th>Ativos</Th>
              <Th title="Estimativa baseada nas assinaturas ativas. Não representa comissão paga.">
                Comissão mensal prevista ⓘ
              </Th>
              <Th>Ações</Th>
            </THead>
            <TBody>
              {partners.map((partner) => (
                <Tr key={partner.partner_id}>
                  <Td>
                    <p className="font-medium">{partner.user_full_name}</p>
                    <p className="text-xs text-[var(--color-ink-muted)]">{partner.user_email}</p>
                  </Td>
                  <Td className="font-mono text-xs">{partner.code ?? "—"}</Td>
                  <Td>
                    <Badge tone={partner.enabled ? "success" : "neutral"}>
                      {partner.enabled ? "Ativo" : "Inativo"}
                    </Badge>
                  </Td>
                  <Td>{partner.discount_percent ?? 10}%</Td>
                  <Td>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      defaultValue={partner.commission_percent ?? ""}
                      className="w-20 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm"
                      onBlur={(e) => {
                        if (e.target.value && e.target.value !== partner.commission_percent) {
                          void updateCommission(partner, e.target.value);
                        }
                      }}
                    />
                    %
                  </Td>
                  <Td>{partner.signups}</Td>
                  <Td>{partner.payers}</Td>
                  <Td>{partner.active}</Td>
                  <Td>{formatCents(partner.projected_monthly_commission_cents)}</Td>
                  <Td>
                    <div className="flex flex-col gap-1">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={!partner.link}
                        onClick={() => void copyLink(partner)}
                      >
                        {copiedId === partner.partner_id ? "Copiado!" : "Copiar link"}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => void toggleStatus(partner)}>
                        {partner.enabled ? "Desabilitar" : "Habilitar"}
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : null}
      </section>
    </div>
  );
}
