import { createHmac } from "node:crypto";

export const APP_SECRET = "secreto-de-prueba";
export const VERIFY_TOKEN = "token-domo";

export function signedMetaRequest(payload: unknown, secret = APP_SECRET): Request {
  const body = JSON.stringify(payload);
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  return new Request("https://crm.test/api/webhooks/meta", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${sig}` },
    body,
  });
}

export const silentLogger = { info() {}, warn() {}, error() {} };

export const whatsappPayload = (opts: { id: string; from?: string; text?: string; referral?: unknown }) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "5491100000000", phone_number_id: "PNID" },
            contacts: [{ profile: { name: "Juan Pérez" }, wa_id: opts.from ?? "5491155551234" }],
            messages: [
              {
                from: opts.from ?? "5491155551234",
                id: opts.id,
                timestamp: "1790650000",
                type: "text",
                text: { body: opts.text ?? "Hola, quiero info del domo de 6 m" },
                ...(opts.referral ? { referral: opts.referral } : {}),
              },
            ],
          },
        },
      ],
    },
  ],
});

export const leadgenPayload = (leadgenId: string) => ({
  object: "page",
  entry: [
    {
      id: "PAGE_ID",
      time: 1790650000,
      changes: [
        {
          field: "leadgen",
          value: { leadgen_id: leadgenId, page_id: "PAGE_ID", form_id: "FORM_1", ad_id: "AD_1", created_time: 1790650000 },
        },
      ],
    },
  ],
});

export const graphLead = (id: string, platform = "ig") => ({
  id,
  created_time: "2026-09-29T03:00:00+0000",
  platform,
  ad_id: "AD_1",
  ad_name: "Domo glamping - video",
  adset_id: "ADSET_1",
  campaign_id: "CAMP_1",
  campaign_name: "Glamping Primavera 2026",
  form_id: "FORM_1",
  field_data: [
    { name: "full_name", values: ["María  Gómez"] },
    { name: "phone_number", values: ["+54 9 351 555-1234"] },
    { name: "email", values: ["Maria@Example.com"] },
    { name: "¿para_qué_querés_el_domo?", values: ["glamping"] },
  ],
});

export const instagramPayload = (mid: string, sender = "IGSID_1") => ({
  object: "instagram",
  entry: [
    {
      id: "IG_ACCOUNT",
      time: 1790650000,
      messaging: [
        {
          sender: { id: sender },
          recipient: { id: "IG_ACCOUNT" },
          timestamp: 1790650000000,
          message: { mid, text: "Precio del domo de 8 m?" },
        },
      ],
    },
  ],
});
