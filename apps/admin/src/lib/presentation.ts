const counts = new Intl.NumberFormat("pt-BR");
const dates = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

export function formatCount(value: number | null | undefined) {
  return value == null ? "Indisponível" : counts.format(value);
}

export function formatAdminDate(value: string | null | undefined) {
  if (!value) return "Não registrado";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data indisponível" : dates.format(date);
}

const labels: Record<string, string> = {
  active: "Ativa", evaluating: "Em avaliação", trial: "Em teste", expired: "Expirada",
  suspended: "Suspensa", disabled: "Desativada", blocked: "Bloqueada", past_due: "Em atraso",
  pending: "Pendente", canceled: "Cancelada", cancelled: "Cancelada", inactive: "Inativa",
  billing_attention: "Atenção à cobrança", grace_period: "Prazo de tolerância", unknown: "Não informado",
  platform_admin: "Administrador", platform_viewer: "Somente leitura", owner: "Titular",
  admin: "Administrador", member: "Membro",
};

export function statusLabel(value: string | null | undefined) {
  return value ? labels[value] ?? value : "Não informado";
}

export function initials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
