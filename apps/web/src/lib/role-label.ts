/** Friendly labels for membership roles (never show raw `owner`). */
export function formatMembershipRole(role: string | null | undefined): string {
  const key = (role || "").trim().toLowerCase();
  if (key === "owner") return "Proprietário";
  if (key === "admin") return "Administrador";
  if (key === "member") return "Colaborador";
  if (!key) return "—";
  return role!.trim();
}
