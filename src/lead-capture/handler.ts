/**
 * Handler HTTP único para toda la captura de leads. Usa Request/Response
 * estándar, así que se monta igual en un route handler de Next.js, en Hono,
 * en Cloudflare Workers o en una Supabase Edge Function.
 *
 *   GET  /webhooks/meta   verificación del webhook (hub.challenge)
 *   POST /webhooks/meta   Lead Ads, WhatsApp, Instagram DM y Messenger
 *   POST /leads/web       formulario del sitio web
 */
import type { InboundLead, LeadSink, Logger } from "./types.ts";
import { verifyMetaSignature } from "./signature.ts";
import { extractLeadgenChanges, fetchLead, mapGraphLead } from "./channels/meta-lead-ads.ts";
import { parseWhatsAppWebhook } from "./channels/whatsapp.ts";
import { parseMessagingWebhook } from "./channels/messaging.ts";
import { parseWebForm, readFormFields } from "./channels/web-form.ts";

export interface CaptureConfig {
  meta?: {
    /** Texto que se carga en "Verify token" al configurar el webhook en Meta. */
    verifyToken: string;
    /** App Secret de la app de Meta, para validar la firma de cada webhook. */
    appSecret: string;
    /** Token de la Página con leads_retrieval; necesario para Lead Ads. */
    pageAccessToken?: string;
    graphVersion?: string;
  };
  web?: {
    /** Orígenes que pueden enviar el formulario, p. ej. "https://domobaires.com". */
    allowedOrigins: string[];
  };
  /** Prefijo si el handler se monta bajo una ruta, p. ej. "/api". */
  basePath?: string;
}

export interface CaptureOptions {
  sink: LeadSink;
  config: CaptureConfig;
  fetch?: typeof fetch;
  logger?: Logger;
}

const DEFAULT_GRAPH_VERSION = "v23.0";

export function createCaptureHandler(opts: CaptureOptions): (req: Request) => Promise<Response> {
  const { sink, config } = opts;
  const doFetch = opts.fetch ?? fetch;
  const log = opts.logger ?? console;
  const base = config.basePath ?? "";

  return async (req) => {
    const path = new URL(req.url).pathname;
    if (path === `${base}/webhooks/meta`) {
      if (req.method === "GET") return verifyWebhook(req);
      if (req.method === "POST") return handleMeta(req);
    }
    if (path === `${base}/leads/web`) {
      if (req.method === "OPTIONS") return withCors(req, new Response(null, { status: 204 }));
      if (req.method === "POST") return withCors(req, await handleWeb(req));
    }
    return new Response("Not found", { status: 404 });
  };

  function verifyWebhook(req: Request): Response {
    const params = new URL(req.url).searchParams;
    if (
      config.meta &&
      params.get("hub.mode") === "subscribe" &&
      params.get("hub.verify_token") === config.meta.verifyToken
    ) {
      return new Response(params.get("hub.challenge") ?? "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  async function handleMeta(req: Request): Promise<Response> {
    if (!config.meta) return new Response("Meta no configurado", { status: 404 });
    const raw = await req.text();
    const valid = await verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), config.meta.appSecret);
    if (!valid) {
      log.warn("Webhook de Meta con firma inválida");
      return new Response("Invalid signature", { status: 401 });
    }

    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch {
      return new Response("Bad JSON", { status: 400 });
    }

    const leads: InboundLead[] = [];
    let failed = false;

    if (payload.object === "whatsapp_business_account") {
      leads.push(...parseWhatsAppWebhook(payload));
    } else if (payload.object === "instagram" || payload.object === "page") {
      leads.push(...parseMessagingWebhook(payload));
      for (const change of extractLeadgenChanges(payload)) {
        try {
          if (!config.meta.pageAccessToken) throw new Error("Falta pageAccessToken para leer Lead Ads");
          const lead = await fetchLead(change.leadgen_id, {
            accessToken: config.meta.pageAccessToken,
            graphVersion: config.meta.graphVersion ?? DEFAULT_GRAPH_VERSION,
            fetch: doFetch,
          });
          leads.push(mapGraphLead(lead, change));
        } catch (err) {
          failed = true;
          log.error("No se pudo leer el lead de Meta", { leadgenId: change.leadgen_id, err: String(err) });
        }
      }
    }

    failed = !(await deliver(leads)) || failed;
    // Un 500 hace que Meta reintente; el sink es idempotente, así que no duplica.
    return new Response(failed ? "Error" : "OK", { status: failed ? 500 : 200 });
  }

  async function handleWeb(req: Request): Promise<Response> {
    let fields: Record<string, string>;
    try {
      fields = await readFormFields(req);
    } catch {
      return json({ ok: false, error: "invalid_body" }, 400);
    }
    const result = parseWebForm(fields);
    if (!result.ok) {
      // Al bot se le responde como si todo hubiera salido bien.
      if (result.reason === "spam") return json({ ok: true }, 200);
      return json({ ok: false, error: result.reason }, 422);
    }
    const ok = await deliver([result.lead]);
    return ok ? json({ ok: true }, 201) : json({ ok: false, error: "storage_error" }, 500);
  }

  async function deliver(leads: InboundLead[]): Promise<boolean> {
    let ok = true;
    for (const lead of leads) {
      try {
        const res = await sink.upsert(lead);
        log.info("Lead capturado", { source: lead.source, externalId: lead.externalId, ...res });
      } catch (err) {
        ok = false;
        log.error("No se pudo guardar el lead", { source: lead.source, externalId: lead.externalId, err: String(err) });
      }
    }
    return ok;
  }

  function withCors(req: Request, res: Response): Response {
    const origin = req.headers.get("origin");
    if (origin && config.web?.allowedOrigins.includes(origin)) {
      res.headers.set("access-control-allow-origin", origin);
      res.headers.set("access-control-allow-methods", "POST, OPTIONS");
      res.headers.set("access-control-allow-headers", "content-type");
      res.headers.set("vary", "origin");
    }
    return res;
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
