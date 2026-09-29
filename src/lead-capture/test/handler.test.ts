import { test } from "node:test";
import assert from "node:assert/strict";
import { createCaptureHandler } from "../handler.ts";
import { InMemoryLeadSink } from "../sinks/memory.ts";
import {
  APP_SECRET, VERIFY_TOKEN, graphLead, instagramPayload, leadgenPayload, signedMetaRequest, silentLogger, whatsappPayload,
} from "./helpers.ts";

function setup(fetchImpl?: typeof fetch) {
  const sink = new InMemoryLeadSink();
  const handler = createCaptureHandler({
    sink,
    logger: silentLogger,
    fetch: fetchImpl,
    config: {
      basePath: "/api",
      meta: { verifyToken: VERIFY_TOKEN, appSecret: APP_SECRET, pageAccessToken: "PAGE_TOKEN" },
      web: { allowedOrigins: ["https://domobaires.com"] },
    },
  });
  return { sink, handler };
}

test("verificación del webhook de Meta", async () => {
  const { handler } = setup();
  const ok = await handler(new Request(
    `https://crm.test/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=123`,
  ));
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "123");
  const bad = await handler(new Request("https://crm.test/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1"));
  assert.equal(bad.status, 403);
});

test("rechaza webhooks con firma inválida", async () => {
  const { handler, sink } = setup();
  const res = await handler(signedMetaRequest(whatsappPayload({ id: "wamid.1" }), "otro-secreto"));
  assert.equal(res.status, 401);
  assert.equal(sink.leads.size, 0);
});

test("WhatsApp: reintento de Meta no duplica y la charla queda en un lead", async () => {
  const { handler, sink } = setup();
  assert.equal((await handler(signedMetaRequest(whatsappPayload({ id: "wamid.1" })))).status, 200);
  assert.equal((await handler(signedMetaRequest(whatsappPayload({ id: "wamid.1" })))).status, 200);
  await handler(signedMetaRequest(whatsappPayload({ id: "wamid.2", text: "¿Hacen envíos a Córdoba?" })));
  assert.equal(sink.leads.size, 1);
  const [lead] = sink.leads.values();
  assert.equal(lead.interactions.length, 2);
});

test("Lead Ads: lee el lead en la Graph API y lo guarda", async () => {
  const calls: string[] = [];
  const fakeFetch = (async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify(graphLead("LG_1")), { status: 200 });
  }) as unknown as typeof fetch;
  const { handler, sink } = setup(fakeFetch);
  const res = await handler(signedMetaRequest(leadgenPayload("LG_1")));
  assert.equal(res.status, 200);
  assert.match(calls[0], /graph\.facebook\.com\/v\d+\.\d+\/LG_1\?fields=.*access_token=PAGE_TOKEN/);
  const [lead] = sink.leads.values();
  assert.equal(lead.email, "maria@example.com");
  assert.equal(lead.firstSource, "meta_lead_ad");
});

test("Lead Ads: si falla la Graph API responde 500 para que Meta reintente", async () => {
  const fakeFetch = (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
  const { handler, sink } = setup(fakeFetch);
  const res = await handler(signedMetaRequest(leadgenPayload("LG_1")));
  assert.equal(res.status, 500);
  assert.equal(sink.leads.size, 0);
});

test("Instagram DM llega al mismo almacén", async () => {
  const { handler, sink } = setup();
  await handler(signedMetaRequest(instagramPayload("mid.1")));
  const [lead] = sink.leads.values();
  assert.equal(lead.firstSource, "instagram_dm");
  assert.deepEqual(lead.handles, { instagram_dm: "IGSID_1" });
});

test("formulario web + WhatsApp del mismo número = un solo lead", async () => {
  const { handler, sink } = setup();
  const res = await handler(new Request("https://crm.test/api/leads/web", {
    method: "POST",
    headers: { origin: "https://domobaires.com", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ nombre: "Juan", telefono: "011 15 5555-1234", mensaje: "Info" }).toString(),
  }));
  assert.equal(res.status, 201);
  assert.equal(res.headers.get("access-control-allow-origin"), "https://domobaires.com");
  await handler(signedMetaRequest(whatsappPayload({ id: "wamid.9" })));
  assert.equal(sink.leads.size, 1);
  const [lead] = sink.leads.values();
  assert.equal(lead.firstSource, "web_form");
  assert.equal(lead.interactions.length, 2);
});

test("formulario web: CORS solo para orígenes permitidos y 422 sin contacto", async () => {
  const { handler } = setup();
  const pre = await handler(new Request("https://crm.test/api/leads/web", { method: "OPTIONS", headers: { origin: "https://malo.com" } }));
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), null);
  const res = await handler(new Request("https://crm.test/api/leads/web", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nombre: "Sin datos" }),
  }));
  assert.equal(res.status, 422);
});
