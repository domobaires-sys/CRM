/**
 * Sink que guarda las consultas en la base del CRM (modelo en prisma/schema.prisma).
 *
 * Reglas:
 * 1. Idempotencia: el primer evento de cada lead va en `Lead.externalId`
 *    (único por fuente) y los siguientes que se suman a él quedan en
 *    `Lead.rawPayload.eventIds`; si Meta reintenta un webhook, no se duplica.
 * 2. Si el teléfono o email ya es de un `Contact`, la consulta se registra como
 *    `Activity` del contacto; solo se abre un `Lead` nuevo (ligado al contacto)
 *    si no tiene uno abierto.
 * 3. Si ya hay un `Lead` abierto (NUEVO o CONTACTADO) con el mismo teléfono,
 *    email o id de Instagram/Messenger, el mensaje se suma a ese lead en
 *    `rawPayload.messages` en vez de crear otro. Así una charla de WhatsApp de
 *    diez mensajes es un solo lead.
 * 4. Si no, se crea un `Lead` NUEVO.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { InboundLead, LeadSink, UpsertResult } from "../types.ts";

type LeadSourceEnum = Prisma.LeadCreateInput["source"];

export interface LeadPayload {
  eventIds: string[];
  handles: Record<string, string>;
  attribution?: InboundLead["attribution"];
  answers?: Record<string, string>;
  messages: Array<{ at: string; source: InboundLead["source"]; text?: string; eventId: string }>;
  events: unknown[];
}

const OPEN_STATUSES = ["NUEVO", "CONTACTADO"] as const;

export function eventKey(lead: InboundLead): string {
  return `${lead.source}:${lead.externalId}`;
}

/** Traduce el canal de captura al enum LeadSource del CRM. */
export function mapSource(lead: InboundLead): LeadSourceEnum {
  switch (lead.source) {
    case "meta_lead_ad":
      return lead.attribution?.platform === "ig" ? "INSTAGRAM" : "FACEBOOK_ADS";
    case "instagram_dm":
      return "INSTAGRAM";
    case "messenger":
      return "FACEBOOK_ADS";
    case "whatsapp":
      return "WHATSAPP";
    case "web_form":
      return "WEB";
  }
}

/** Texto para `Lead.campaign`: campaña de Meta, anuncio o utm_campaign. */
export function campaignLabel(lead: InboundLead): string | undefined {
  const a = lead.attribution;
  if (!a) return undefined;
  return (
    a.campaignName ??
    a.adName ??
    a.utm?.utm_campaign ??
    (a.adId ? `Anuncio ${a.adId}` : undefined)
  );
}

export function initialPayload(lead: InboundLead): LeadPayload {
  return {
    eventIds: [eventKey(lead)],
    handles: lead.contactHandle ? { [lead.source]: lead.contactHandle } : {},
    attribution: lead.attribution,
    answers: lead.answers,
    messages: lead.message
      ? [{ at: lead.receivedAt, source: lead.source, text: lead.message, eventId: eventKey(lead) }]
      : [],
    events: [lead.raw],
  };
}

export function mergePayload(current: LeadPayload, lead: InboundLead): LeadPayload {
  return {
    eventIds: [...current.eventIds, eventKey(lead)],
    handles: lead.contactHandle ? { ...current.handles, [lead.source]: lead.contactHandle } : current.handles,
    attribution: current.attribution ?? lead.attribution,
    answers: lead.answers ? { ...current.answers, ...lead.answers } : current.answers,
    messages: lead.message
      ? [...current.messages, { at: lead.receivedAt, source: lead.source, text: lead.message, eventId: eventKey(lead) }]
      : current.messages,
    // Se guardan los últimos 50 payloads crudos para no inflar la fila.
    events: [...current.events, lead.raw].slice(-50),
  };
}

function asPayload(value: Prisma.JsonValue | null): LeadPayload {
  const v = (value ?? {}) as Partial<LeadPayload>;
  return {
    eventIds: v.eventIds ?? [],
    handles: v.handles ?? {},
    attribution: v.attribution,
    answers: v.answers,
    messages: v.messages ?? [],
    events: v.events ?? [],
  };
}

const toJson = (p: LeadPayload) => p as unknown as Prisma.InputJsonValue;

export class PrismaLeadSink implements LeadSink {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient) {
    this.db = db;
  }

  async upsert(lead: InboundLead): Promise<UpsertResult> {
    const seen = await this.findEvent(lead);
    if (seen) return { leadId: seen, created: false, duplicate: true };

    const identity: Prisma.LeadWhereInput[] = [];
    if (lead.phone) identity.push({ phone: lead.phone });
    if (lead.email) identity.push({ email: lead.email });
    if (lead.contactHandle) {
      identity.push({ rawPayload: { path: ["handles", lead.source], equals: lead.contactHandle } });
    }

    const contactWhere: Prisma.ContactWhereInput[] = [];
    if (lead.phone) contactWhere.push({ phone: lead.phone });
    if (lead.email) contactWhere.push({ email: lead.email });
    const contact = contactWhere.length
      ? await this.db.contact.findFirst({ where: { OR: contactWhere }, select: { id: true } })
      : null;

    if (contact) {
      await this.db.activity.create({
        data: {
          type: lead.source === "whatsapp" ? "WHATSAPP" : "NOTA",
          summary: `Consulta entrante por ${channelName(lead)}`,
          body: lead.message ?? null,
          contactId: contact.id,
        },
      });
      identity.push({ contactId: contact.id });
    }

    const open = identity.length
      ? await this.db.lead.findFirst({
          where: { status: { in: [...OPEN_STATUSES] }, OR: identity },
          orderBy: { createdAt: "desc" },
        })
      : null;

    if (open) {
      await this.db.lead.update({
        where: { id: open.id },
        data: {
          name: open.name ?? lead.name,
          phone: open.phone ?? lead.phone,
          email: open.email ?? lead.email,
          message: open.message ?? lead.message,
          campaign: open.campaign ?? campaignLabel(lead),
          adId: open.adId ?? lead.attribution?.adId,
          formId: open.formId ?? lead.attribution?.formId,
          contactId: open.contactId ?? contact?.id,
          rawPayload: toJson(mergePayload(asPayload(open.rawPayload), lead)),
        },
      });
      return { leadId: open.id, created: false, duplicate: false };
    }

    try {
      const created = await this.db.lead.create({
        data: {
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          message: lead.message,
          source: mapSource(lead),
          externalId: lead.externalId,
          campaign: campaignLabel(lead),
          adId: lead.attribution?.adId,
          formId: lead.attribution?.formId,
          receivedAt: new Date(lead.receivedAt),
          rawPayload: toJson(initialPayload(lead)),
          contactId: contact?.id,
        },
        select: { id: true },
      });
      return { leadId: created.id, created: true, duplicate: false };
    } catch (err) {
      // Dos entregas simultáneas del mismo evento: la otra ya lo creó.
      if ((err as { code?: string }).code === "P2002") {
        const id = await this.findEvent(lead);
        if (id) return { leadId: id, created: false, duplicate: true };
      }
      throw err;
    }
  }

  private async findEvent(lead: InboundLead): Promise<string | undefined> {
    const found = await this.db.lead.findFirst({
      where: {
        OR: [
          { source: mapSource(lead), externalId: lead.externalId },
          { rawPayload: { path: ["eventIds"], array_contains: [eventKey(lead)] } },
        ],
      },
      select: { id: true },
    });
    return found?.id;
  }
}

function channelName(lead: InboundLead): string {
  switch (lead.source) {
    case "meta_lead_ad":
      return lead.attribution?.platform === "ig" ? "formulario de Instagram" : "formulario de Facebook";
    case "instagram_dm":
      return "Instagram";
    case "messenger":
      return "Messenger";
    case "whatsapp":
      return "WhatsApp";
    case "web_form":
      return "la web";
  }
}
