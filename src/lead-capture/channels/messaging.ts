/**
 * Mensajes directos de Instagram (object = "instagram") y de Messenger
 * (object = "page", arreglo `messaging`). Estos canales no dan teléfono ni
 * email: el contacto se identifica por su IGSID o PSID hasta que el vendedor
 * o el bot de calificación le pida el WhatsApp.
 */
import type { InboundLead, LeadSource } from "../types.ts";

export function parseMessagingWebhook(payload: any): InboundLead[] {
  const source: LeadSource | undefined =
    payload?.object === "instagram" ? "instagram_dm" : payload?.object === "page" ? "messenger" : undefined;
  if (!source) return [];

  const out: InboundLead[] = [];
  for (const entry of payload.entry ?? []) {
    for (const ev of entry?.messaging ?? []) {
      const msg = ev?.message;
      const senderId: string | undefined = ev?.sender?.id;
      if (!msg?.mid || !senderId) continue;
      // Ignora los mensajes que manda la propia cuenta de DOMO.
      if (msg.is_echo || senderId === entry.id) continue;

      const ref = msg.referral ?? ev.referral;
      const attachments: string[] = (msg.attachments ?? []).map((a: any) => `[${a?.type ?? "adjunto"}]`);
      out.push({
        source,
        externalId: msg.mid,
        contactHandle: senderId,
        message: [msg.text, ...attachments].filter(Boolean).join(" ") || undefined,
        attribution: ref
          ? {
              platform: source === "instagram_dm" ? "ig" : "fb",
              adId: ref.ad_id,
              ctwaClid: ref.ads_context_data?.ctwa_clid,
              sourceUrl: ref.ads_context_data?.photo_url ?? ref.ref,
            }
          : undefined,
        receivedAt: ev.timestamp ? new Date(Number(ev.timestamp)).toISOString() : new Date().toISOString(),
        raw: ev,
      });
    }
  }
  return out;
}
