/** Greeting and local clock helpers for the org timezone. */

export function greetingForHour(hour: number): "Bom dia" | "Boa tarde" | "Boa noite" {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

export function hourInTimeZone(now: Date, timeZone: string): number {
  try {
    const raw = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    }).formatToParts(now);
    const hour = Number(raw.find((p) => p.type === "hour")?.value ?? "0");
    return Number.isFinite(hour) ? hour : now.getHours();
  } catch {
    return now.getHours();
  }
}

export function formatDateAndTime(now: Date, timeZone: string): string {
  try {
    const date = new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(now);
    const time = new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now);
    return `${date} · ${time}`;
  } catch {
    return now.toLocaleString("pt-BR");
  }
}

export function firstName(fullName: string | null | undefined): string | null {
  const part = fullName?.trim().split(/\s+/)[0];
  return part || null;
}

const FALLBACK_TZ = "America/Sao_Paulo";

/** Personalized greeting using org timezone (fallback America/Sao_Paulo). */
export function personalGreeting(
  fullName: string | null | undefined,
  timeZone?: string | null,
  now: Date = new Date(),
): { headline: string; first: string | null } {
  const tz = (timeZone || "").trim() || FALLBACK_TZ;
  const greet = greetingForHour(hourInTimeZone(now, tz));
  const name = firstName(fullName);
  if (name) {
    return { headline: `${greet}, ${name}`, first: name };
  }
  return { headline: "Olá", first: null };
}
