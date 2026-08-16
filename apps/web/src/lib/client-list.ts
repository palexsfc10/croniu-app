import type { Client, Cycle } from "@/lib/api";
import { cycleBucket } from "@/lib/cycle-period";
import { formatPhoneBR } from "@/lib/status-labels";

export type ClientListBadge =
  | { tone: "neutral"; label: string }
  | { tone: "warning"; label: string }
  | { tone: "muted"; label: string };

export function clientInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function clientListPresentation(
  client: Client,
  cycles: Cycle[],
  today: string,
  terms: { session: string; accompaniment: string },
): { subtitle: string; badge: ClientListBadge } {
  if (client.status === "archived") {
    return { subtitle: formatPhoneBR(client.phone) === "—" ? "Arquivado" : formatPhoneBR(client.phone), badge: { tone: "muted", label: "Arquivado" } };
  }
  const mine = cycles.filter((c) => c.client_id === client.id);
  const current = mine.find((c) => cycleBucket(c, today) === "active");
  const upcoming = mine.find((c) => cycleBucket(c, today) === "upcoming");
  if (current) {
    const days = current.days_remaining;
    if (current.is_nearing_end && days != null) {
      return {
        subtitle: `Ciclo termina em ${days} ${days === 1 ? "dia" : "dias"}`,
        badge: { tone: "warning", label: "Precisa de atenção" },
      };
    }
    return {
      subtitle: `Ciclo em andamento`,
      badge: { tone: "neutral", label: "Ativo" },
    };
  }
  if (upcoming) {
    return {
      subtitle: `Aguardando início`,
      badge: { tone: "neutral", label: "Aguardando início" },
    };
  }
  return {
    subtitle: `${terms.accompaniment.charAt(0).toUpperCase()}${terms.accompaniment.slice(1)} ainda não preparado`,
    badge: { tone: "muted", label: "Sem ciclo" },
  };
}
