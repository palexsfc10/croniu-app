/** Build a wa.me URL without duplicating Brazil country code 55. */

export function whatsappShareHref(phone: string | null | undefined, message: string): string {
  const text = encodeURIComponent(message);
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) {
    return `https://wa.me/?text=${text}`;
  }
  let e164 = digits.startsWith("00") ? digits.slice(2) : digits;
  if (e164.length === 10 || e164.length === 11) {
    e164 = `55${e164}`;
  }
  return `https://wa.me/${e164}?text=${text}`;
}

export function portalWhatsAppMessage(firstName: string, publicUrl: string): string {
  const name = firstName.trim() || "olá";
  return (
    `Olá, ${name}. Aqui está seu acesso ao Croniu para acompanhar sua agenda, ciclo e conteúdos publicados:\n\n` +
    publicUrl
  );
}
