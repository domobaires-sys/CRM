import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWhatsAppWebhook } from "../channels/whatsapp.ts";
import { parseMessagingWebhook } from "../channels/messaging.ts";
import { extractLeadgenChanges, mapGraphLead } from "../channels/meta-lead-ads.ts";
import { parseWebForm } from "../channels/web-form.ts";
import { graphLead, instagramPayload, leadgenPayload, whatsappPayload } from "./helpers.ts";

test("WhatsApp: mensaje de texto con nombre, teléfono y anuncio de origen", () => {
  const [lead] = parseWhatsAppWebhook(
    whatsappPayload({
      id: "wamid.1",
      referral: { source_type: "ad", source_id: "AD_9", ctwa_clid: "CLID", source_url: "https://fb.me/x" },
    }),
  );
  assert.equal(lead.source, "whatsapp");
  assert.equal(lead.externalId, "wamid.1");
  assert.equal(lead.name, "Juan Pérez");
  assert.equal(lead.phone, "+5491155551234");
  assert.equal(lead.message, "Hola, quiero info del domo de 6 m");
  assert.deepEqual(lead.attribution, { platform: "ctwa", adId: "AD_9", ctwaClid: "CLID", sourceUrl: "https://fb.me/x" });
});

test("WhatsApp: ignora estados de entrega", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: { statuses: [{ id: "wamid.x", status: "read" }] } }] }],
  };
  assert.deepEqual(parseWhatsAppWebhook(payload), []);
});

test("Instagram: DM entrante, ignora ecos propios", () => {
  const payload = instagramPayload("mid.1");
  payload.entry[0].messaging.push({
    sender: { id: "IG_ACCOUNT" },
    recipient: { id: "IGSID_1" },
    timestamp: 1790650000001,
    message: { mid: "mid.2", text: "Respuesta nuestra" },
  });
  const leads = parseMessagingWebhook(payload);
  assert.equal(leads.length, 1);
  assert.equal(leads[0].source, "instagram_dm");
  assert.equal(leads[0].contactHandle, "IGSID_1");
  assert.equal(leads[0].message, "Precio del domo de 8 m?");
});

test("Lead Ads: extrae el leadgen_id y mapea el formulario", () => {
  const [change] = extractLeadgenChanges(leadgenPayload("LG_1"));
  assert.equal(change.leadgen_id, "LG_1");
  const lead = mapGraphLead(graphLead("LG_1"), change);
  assert.equal(lead.name, "María Gómez");
  assert.equal(lead.phone, "+5493515551234");
  assert.equal(lead.email, "maria@example.com");
  assert.deepEqual(lead.answers, { "¿para_qué_querés_el_domo?": "glamping" });
  assert.equal(lead.attribution?.platform, "ig");
  assert.equal(lead.attribution?.campaignName, "Glamping Primavera 2026");
});

test("Formulario web: guarda UTM y preguntas extra", () => {
  const res = parseWebForm({
    nombre: "Ana",
    telefono: "11 4444 5555",
    mensaje: "Quiero un domo para vivir",
    diametro: "8 m",
    utm_source: "instagram",
    utm_campaign: "vivienda",
    page_url: "https://domobaires.com/contacto",
  });
  assert.ok(res.ok);
  if (!res.ok) return;
  assert.equal(res.lead.phone, "+5491144445555");
  assert.deepEqual(res.lead.answers, { diametro: "8 m" });
  assert.deepEqual(res.lead.attribution?.utm, { utm_source: "instagram", utm_campaign: "vivienda" });
});

test("Formulario web: descarta bots y exige teléfono o email", () => {
  assert.deepEqual(parseWebForm({ name: "bot", email: "a@b.co", website: "http://spam" }), { ok: false, reason: "spam" });
  assert.deepEqual(parseWebForm({ name: "Sin datos" }), { ok: false, reason: "missing_contact" });
});
