/** Safe user-facing messages for billing/checkout (never leak Cloudflare/Asaas HTML). */

const CLOUDFLARE_MARKERS = [
  "cloudflare",
  "origin web server",
  "invalid or incomplete response",
  "bad gateway",
  "error 502",
  "error 504",
  "attention required",
];

const ASAAS_HOST_ALLOWLIST = new Set([
  "asaas.com",
  "www.asaas.com",
  "sandbox.asaas.com",
]);

export const CHECKOUT_TEMPORARY_ERROR =
  "Não foi possível abrir o checkout agora. Aguarde alguns instantes e tente novamente.";

export const CHECKOUT_VERIFYING =
  "Estamos verificando sua solicitação de pagamento. Não clique novamente enquanto concluímos a consulta.";

export function sanitizeBillingErrorMessage(raw: string | null | undefined): string {
  const text = (raw || "").trim();
  if (!text) return CHECKOUT_TEMPORARY_ERROR;
  const lower = text.toLowerCase();
  if (CLOUDFLARE_MARKERS.some((m) => lower.includes(m))) {
    return CHECKOUT_TEMPORARY_ERROR;
  }
  if (lower.includes("<html") || lower.includes("<!doctype")) {
    return CHECKOUT_TEMPORARY_ERROR;
  }
  // Keep short Portuguese product messages; reject long English dumps.
  if (/[A-Za-z]{4,}/.test(text) && !/[áàâãéêíóôõúç]/i.test(text) && text.length > 80) {
    return CHECKOUT_TEMPORARY_ERROR;
  }
  return text;
}

export function isAllowedAsaasCheckoutUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return ASAAS_HOST_ALLOWLIST.has(host);
  } catch {
    return false;
  }
}
