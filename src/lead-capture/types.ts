/**
 * Contrato de la captura de leads.
 *
 * `InboundLead` es un DTO de captura, no el modelo de datos del CRM: cada canal
 * (Meta Lead Ads, WhatsApp, Instagram, Messenger, formulario web) se normaliza a
 * esta forma y se entrega a un `LeadSink`. El modelo definitivo de Lead/Contacto
 * vive en la base del CRM, que implementa `LeadSink`.
 */

export type LeadSource =
  | "meta_lead_ad"
  | "whatsapp"
  | "instagram_dm"
  | "messenger"
  | "web_form";

export interface Attribution {
  /** "fb" | "ig" para Lead Ads; "ctwa" para anuncios que abren WhatsApp. */
  platform?: string;
  campaignId?: string;
  campaignName?: string;
  adsetId?: string;
  adId?: string;
  adName?: string;
  formId?: string;
  /** Click ID de anuncios Click-to-WhatsApp / Click-to-Direct. */
  ctwaClid?: string;
  sourceUrl?: string;
  pageUrl?: string;
  utm?: Record<string, string>;
}

export interface InboundLead {
  source: LeadSource;
  /** Id único del evento en el canal (leadgen_id, wamid, mid, id del formulario). Sirve para idempotencia. */
  externalId: string;
  /** Id del contacto en el canal: wa_id, IGSID o PSID. */
  contactHandle?: string;
  name?: string;
  /** Teléfono en formato E.164 (+5491155551234). */
  phone?: string;
  /** Teléfono tal como llegó, antes de normalizar. */
  phoneRaw?: string;
  email?: string;
  message?: string;
  /** Respuestas a preguntas del formulario (uso del domo, diámetro, ubicación, etc.). */
  answers?: Record<string, string>;
  attribution?: Attribution;
  /** ISO 8601. */
  receivedAt: string;
  raw: unknown;
}

export interface UpsertResult {
  leadId: string;
  /** true si se creó un lead nuevo; false si se sumó a uno existente. */
  created: boolean;
  /** true si este mismo evento (source + externalId) ya se había procesado. */
  duplicate: boolean;
}

export interface LeadSink {
  /**
   * Guarda el lead. Debe ser idempotente por (source, externalId), porque Meta
   * reintenta los webhooks, y deduplicar contactos por teléfono, email o
   * contactHandle.
   */
  upsert(lead: InboundLead): Promise<UpsertResult>;
}

export interface Logger {
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}
