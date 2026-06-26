const DEFAULT_WHATSAPP_NUMBER = "6587470061";

export function getWhatsAppNumber(): string {
  const raw = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? DEFAULT_WHATSAPP_NUMBER;
  return raw.replace(/\D/g, "");
}

export function getWhatsAppUrl(
  message = "Hi, I'd like to learn more about AI Cafe."
): string {
  const params = new URLSearchParams({ text: message });
  return `https://wa.me/${getWhatsAppNumber()}?${params}`;
}
