/** Calendar dates (YYYY-MM-DD) without UTC shift. */

const MONTHS = [
  "jan.",
  "fev.",
  "mar.",
  "abr.",
  "maio",
  "jun.",
  "jul.",
  "ago.",
  "set.",
  "out.",
  "nov.",
  "dez.",
];

export function parseIsoDate(iso: string): { y: number; m: number; d: number } | null {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

export function formatHumanDate(iso: string): string {
  const p = parseIsoDate(iso);
  if (!p) return iso;
  return `${p.d} ${MONTHS[p.m - 1]}`;
}

export function formatHumanDateRange(startIso: string, endIso: string): string {
  const a = parseIsoDate(startIso);
  const b = parseIsoDate(endIso);
  if (!a || !b) return `${startIso} — ${endIso}`;
  if (a.y === b.y && a.m === b.m) {
    return `${a.d}–${b.d} ${MONTHS[a.m - 1]}`;
  }
  if (a.y === b.y) {
    return `${a.d} ${MONTHS[a.m - 1]} a ${b.d} ${MONTHS[b.m - 1]}`;
  }
  return `${a.d} ${MONTHS[a.m - 1]} ${a.y} a ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
}

export function addDaysIso(iso: string, days: number): string {
  const p = parseIsoDate(iso);
  if (!p) return iso;
  const dt = new Date(p.y, p.m - 1, p.d + days);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function startOfMonth(iso: string): string {
  const p = parseIsoDate(iso);
  if (!p) return iso;
  return `${p.y}-${String(p.m).padStart(2, "0")}-01`;
}

export function endOfMonth(iso: string): string {
  const p = parseIsoDate(iso);
  if (!p) return iso;
  const dt = new Date(p.y, p.m, 0);
  const d = String(dt.getDate()).padStart(2, "0");
  return `${p.y}-${String(p.m).padStart(2, "0")}-${d}`;
}

export function shiftMonth(iso: string, delta: number): string {
  const p = parseIsoDate(iso);
  if (!p) return iso;
  const dt = new Date(p.y, p.m - 1 + delta, 1);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export function monthTitle(iso: string): string {
  const p = parseIsoDate(iso);
  if (!p) return iso;
  const name = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(p.y, p.m - 1, 1),
  );
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && aEnd >= bStart;
}

export function formatSubmittedAt(iso: string | null | undefined, timeZone = "America/Sao_Paulo"): string {
  if (!iso) return "";
  try {
    const when = new Date(iso);
    const date = new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      day: "numeric",
      month: "short",
    }).format(when);
    const time = new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(when);
    return `enviada ${date} às ${time}`;
  } catch {
    return "";
  }
}

export function maskContact(value: string | null | undefined): string {
  if (!value) return "—";
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 4) return `••••${digits.slice(-4)}`;
  if (value.includes("@")) {
    const [u, d] = value.split("@");
    return `${u.slice(0, 1)}••@${d}`;
  }
  return "••••";
}
