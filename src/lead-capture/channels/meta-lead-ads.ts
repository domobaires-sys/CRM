/**
 * Meta Lead Ads (formularios instantáneos en Facebook e Instagram).
 *
 * El webhook de la Página (campo "leadgen") solo trae el leadgen_id; los datos
 * del formulario se piden a la Graph API con un token de la Página que tenga
 * el permiso leads_retrieval. El campo `platform` de la respuesta dice si el
 * lead vino de Facebook ("fb") o de Instagram ("ig").
 */
import type { InboundLead } from "../types.ts";
import { cleanName, normalizeEmail, normalizePhone } from "../normalize.ts";

export interface LeadgenChange {
  leadgen_id: string;
  page_id?: string;
  form_id?: string;
  ad_id?: string;
  adgroup_id?: string;
  created_time?: number;
}

interface GraphLead {
  id: string;
  created_time?: string;
  field_data?: Array<{ name: string; values?: string[] }>;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  platform?: string;
}

const LEAD_FIELDS =
  "id,created_time,field_data,ad_id,ad_name,adset_id,campaign_id,campaign_name,form_id,platform";

// Nombres estándar de Meta para los campos precargados del formulario.
const NAME_FIELDS = ["full_name", "nombre_completo"];
const FIRST_NAME_FIELDS = ["first_name", "nombre"];
const LAST_NAME_FIELDS = ["last_name", "apellido"];
const PHONE_FIELDS = ["phone_number", "telefono", "teléfono", "whatsapp"];
const EMAIL_FIELDS = ["email", "correo_electronico"];

/** Extrae los cambios "leadgen" de un webhook con object = "page". */
export function extractLeadgenChanges(payload: any): LeadgenChange[] {
  const out: LeadgenChange[] = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (change?.field === "leadgen" && change.value?.leadgen_id) out.push(change.value);
    }
  }
  return out;
}

export async function fetchLead(
  leadgenId: string,
  opts: { accessToken: string; graphVersion: string; fetch: typeof fetch },
): Promise<GraphLead> {
  const url =
    `https://graph.facebook.com/${opts.graphVersion}/${encodeURIComponent(leadgenId)}` +
    `?fields=${LEAD_FIELDS}&access_token=${encodeURIComponent(opts.accessToken)}`;
  const res = await opts.fetch(url);
  if (!res.ok) {
    throw new Error(`Graph API ${res.status} al leer el lead ${leadgenId}: ${await res.text()}`);
  }
  return (await res.json()) as GraphLead;
}

export function mapGraphLead(lead: GraphLead, change?: LeadgenChange): InboundLead {
  const answers: Record<string, string> = {};
  for (const f of lead.field_data ?? []) {
    answers[f.name] = (f.values ?? []).join(", ");
  }
  const pick = (keys: string[]) => {
    for (const k of keys) if (answers[k]) return answers[k];
    return undefined;
  };
  const known = new Set([...NAME_FIELDS, ...FIRST_NAME_FIELDS, ...LAST_NAME_FIELDS, ...PHONE_FIELDS, ...EMAIL_FIELDS]);
  const custom = Object.fromEntries(Object.entries(answers).filter(([k]) => !known.has(k)));

  const fullName =
    pick(NAME_FIELDS) ?? [pick(FIRST_NAME_FIELDS), pick(LAST_NAME_FIELDS)].filter(Boolean).join(" ");
  const phoneRaw = pick(PHONE_FIELDS);

  return {
    source: "meta_lead_ad",
    externalId: lead.id,
    name: cleanName(fullName),
    phone: normalizePhone(phoneRaw),
    phoneRaw,
    email: normalizeEmail(pick(EMAIL_FIELDS)),
    answers: Object.keys(custom).length ? custom : undefined,
    attribution: {
      platform: lead.platform,
      campaignId: lead.campaign_id,
      campaignName: lead.campaign_name,
      adsetId: lead.adset_id,
      adId: lead.ad_id ?? change?.ad_id,
      adName: lead.ad_name,
      formId: lead.form_id ?? change?.form_id,
    },
    receivedAt: lead.created_time
      ? new Date(lead.created_time).toISOString()
      : change?.created_time
        ? new Date(change.created_time * 1000).toISOString()
        : new Date().toISOString(),
    raw: { change, lead },
  };
}
