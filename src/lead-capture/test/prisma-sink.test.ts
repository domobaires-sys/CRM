/**
 * Prueba contra una base PostgreSQL real. Se saltea si no hay TEST_DATABASE_URL.
 * Borra las tablas Lead, Activity y Contact: usar una base de prueba.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { PrismaLeadSink } from "../sinks/prisma.ts";
import type { InboundLead } from "../types.ts";

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : "definir TEST_DATABASE_URL para correr esta prueba";
const db = url ? new PrismaClient({ datasources: { db: { url } } }) : undefined;

const base = (over: Partial<InboundLead>): InboundLead => ({
  source: "whatsapp",
  externalId: "wamid.1",
  contactHandle: "5491155551234",
  name: "Juan Pérez",
  phone: "+5491155551234",
  message: "Hola",
  receivedAt: "2026-09-29T03:00:00.000Z",
  raw: {},
  ...over,
});

before(async () => {
  if (!db) return;
  await db.activity.deleteMany();
  await db.lead.deleteMany();
  await db.contact.deleteMany();
});
after(async () => db?.$disconnect());

test("crea un Lead y no lo duplica en reintentos", { skip }, async () => {
  const sink = new PrismaLeadSink(db!);
  const first = await sink.upsert(base({}));
  assert.equal(first.created, true);
  const again = await sink.upsert(base({}));
  assert.deepEqual(again, { leadId: first.leadId, created: false, duplicate: true });
  const lead = await db!.lead.findUniqueOrThrow({ where: { id: first.leadId } });
  assert.equal(lead.source, "WHATSAPP");
  assert.equal(lead.status, "NUEVO");
});

test("mensajes siguientes y otros canales con el mismo teléfono se suman al lead abierto", { skip }, async () => {
  const sink = new PrismaLeadSink(db!);
  const a = await sink.upsert(base({ externalId: "wamid.2", message: "¿Precio del de 6 m?" }));
  const b = await sink.upsert(base({
    source: "web_form", externalId: "form-1", contactHandle: undefined, email: "juan@example.com",
    attribution: { platform: "web", utm: { utm_campaign: "vivienda" } },
  }));
  assert.equal(a.created, false);
  assert.equal(b.leadId, a.leadId);
  const lead = await db!.lead.findUniqueOrThrow({ where: { id: a.leadId } });
  const payload = lead.rawPayload as any;
  assert.equal(payload.messages.length, 3);
  assert.equal(lead.email, "juan@example.com");
  assert.equal(await db!.lead.count(), 1);
});

test("Instagram se deduplica por IGSID y mapea la campaña de Lead Ads", { skip }, async () => {
  const sink = new PrismaLeadSink(db!);
  const dm = base({ source: "instagram_dm", externalId: "mid.1", contactHandle: "IGSID_1", phone: undefined, name: undefined });
  const x = await sink.upsert(dm);
  const y = await sink.upsert({ ...dm, externalId: "mid.2" });
  assert.equal(x.leadId, y.leadId);
  const ad = await sink.upsert(base({
    source: "meta_lead_ad", externalId: "LG_1", contactHandle: undefined, phone: "+5493515551234",
    attribution: { platform: "ig", campaignName: "Glamping Primavera 2026" },
  }));
  const lead = await db!.lead.findUniqueOrThrow({ where: { id: ad.leadId } });
  assert.equal(lead.source, "INSTAGRAM");
  assert.equal(lead.campaign, "Glamping Primavera 2026");
});

test("si el teléfono ya es de un Contact, registra una Activity y liga el lead", { skip }, async () => {
  const sink = new PrismaLeadSink(db!);
  const contact = await db!.contact.create({ data: { firstName: "Laura", phone: "+5492944551234" } });
  const r = await sink.upsert(base({ externalId: "wamid.50", phone: "+5492944551234", contactHandle: "5492944551234" }));
  assert.equal(r.created, true);
  const lead = await db!.lead.findUniqueOrThrow({ where: { id: r.leadId } });
  assert.equal(lead.contactId, contact.id);
  const acts = await db!.activity.findMany({ where: { contactId: contact.id } });
  assert.equal(acts.length, 1);
  assert.equal(acts[0].type, "WHATSAPP");
});

test("guarda externalId, adId, formId y receivedAt en las columnas del Lead", { skip }, async () => {
  const sink = new PrismaLeadSink(db!);
  const r = await sink.upsert(base({
    source: "meta_lead_ad", externalId: "LG_77", contactHandle: undefined, phone: "+5491100001111",
    attribution: { platform: "fb", adId: "AD_5", formId: "FORM_5", campaignName: "Vivienda" },
  }));
  const lead = await db!.lead.findUniqueOrThrow({ where: { id: r.leadId } });
  assert.equal(lead.source, "FACEBOOK_ADS");
  assert.equal(lead.externalId, "LG_77");
  assert.equal(lead.adId, "AD_5");
  assert.equal(lead.formId, "FORM_5");
  assert.equal(lead.receivedAt.toISOString(), "2026-09-29T03:00:00.000Z");
});
