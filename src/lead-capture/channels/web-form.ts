/**
 * Formulario de contacto del sitio web. Acepta JSON o
 * application/x-www-form-urlencoded, guarda los UTM para saber qué campaña
 * trajo la visita y descarta bots con un campo trampa ("website") oculto.
 */
import type { InboundLead } from "../types.ts";
import { cleanName, normalizeEmail, normalizePhone } from "../normalize.ts";

export const HONEYPOT_FIELD = "website";

const KNOWN = new Set([
  "name", "nombre", "phone", "telefono", "whatsapp", "email", "message", "mensaje",
  "page_url", "submission_id", HONEYPOT_FIELD,
]);

export type WebFormResult =
  | { ok: true; lead: InboundLead }
  | { ok: false; reason: "spam" | "missing_contact" };

export function parseWebForm(fields: Record<string, string>, now = new Date()): WebFormResult {
  if (fields[HONEYPOT_FIELD]) return { ok: false, reason: "spam" };

  const phoneRaw = fields.phone || fields.telefono || fields.whatsapp || undefined;
  const phone = normalizePhone(phoneRaw);
  const email = normalizeEmail(fields.email);
  if (!phone && !email) return { ok: false, reason: "missing_contact" };

  const utm: Record<string, string> = {};
  const answers: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!v) continue;
    if (k.startsWith("utm_") || k === "fbclid" || k === "gclid") utm[k] = v;
    else if (!KNOWN.has(k)) answers[k] = v;
  }

  return {
    ok: true,
    lead: {
      source: "web_form",
      externalId: fields.submission_id || crypto.randomUUID(),
      name: cleanName(fields.name || fields.nombre),
      phone,
      phoneRaw,
      email,
      message: fields.message || fields.mensaje || undefined,
      answers: Object.keys(answers).length ? answers : undefined,
      attribution: {
        platform: "web",
        pageUrl: fields.page_url || undefined,
        utm: Object.keys(utm).length ? utm : undefined,
      },
      receivedAt: now.toISOString(),
      raw: fields,
    },
  };
}

export async function readFormFields(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = await req.json();
    return Object.fromEntries(
      Object.entries(body ?? {}).map(([k, v]) => [k, v == null ? "" : String(v)]),
    );
  }
  if (type.includes("multipart/form-data")) {
    const form = await req.formData();
    const out: Record<string, string> = {};
    form.forEach((v, k) => {
      if (typeof v === "string") out[k] = v;
    });
    return out;
  }
  const form = new URLSearchParams(await req.text());
  return Object.fromEntries(form.entries());
}
