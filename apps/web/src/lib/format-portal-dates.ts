function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatPortalDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatPortalDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const day = formatPortalDate(iso);
  return `${day} às ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
