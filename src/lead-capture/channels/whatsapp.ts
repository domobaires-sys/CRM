/**
 * WhatsApp Business Platform (Cloud API). Cada mensaje entrante de un cliente
 * llega por el webhook con object = "whatsapp_business_account". Si la charla
 * empezó desde un anuncio Click-to-WhatsApp, el mensaje trae `referral` con el
 * id del anuncio y el ctwa_clid.
 */
import type { InboundLead } from "../types.ts";
import { cleanName, normalizePhone } from "../normalize.ts";

export function messageText(msg: any): string | undefined {
  switch (msg?.type) {
    case "text":
      return msg.text?.body;
    case "button":
      return msg.button?.text;
    case "interactive":
      return msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title;
    case "image":
    case "video":
    case "document":
      return msg[msg.type]?.caption ?? `[${msg.type}]`;
    case "audio":
      return "[audio]";
    case "location":
      return `[ubicación] ${msg.location?.latitude},${msg.location?.longitude}`;
    default:
      return msg?.type ? `[${msg.type}]` : undefined;
  }
}

export function parseWhatsAppWebhook(payload: any): InboundLead[] {
  const out: InboundLead[] = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (change?.field !== "messages") continue;
      const value = change.value ?? {};
      const names = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c?.wa_id) names.set(c.wa_id, c.profile?.name);
      }
      // Los "statuses" (entregado, leído) no son consultas nuevas: se ignoran.
      for (const msg of value.messages ?? []) {
        const waId: string | undefined = msg?.from;
        if (!waId || !msg.id) continue;
        const ref = msg.referral;
        out.push({
          source: "whatsapp",
          externalId: msg.id,
          contactHandle: waId,
          name: cleanName(names.get(waId)),
          phone: normalizePhone(`+${waId}`),
          phoneRaw: waId,
          message: messageText(msg),
          attribution: ref
            ? {
                platform: "ctwa",
                adId: ref.source_type === "ad" ? ref.source_id : undefined,
                ctwaClid: ref.ctwa_clid,
                sourceUrl: ref.source_url,
              }
            : undefined,
          receivedAt: msg.timestamp
            ? new Date(Number(msg.timestamp) * 1000).toISOString()
            : new Date().toISOString(),
          raw: { metadata: value.metadata, message: msg },
        });
      }
    }
  }
  return out;
}
