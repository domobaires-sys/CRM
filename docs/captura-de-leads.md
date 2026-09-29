# Captura de leads

Todas las consultas entran a la tabla `Lead` del CRM, vengan de donde vengan:

| Canal | Cómo llega | `Lead.source` |
|-------|-----------|---------------|
| Formularios de Meta Ads en Facebook | Webhook `leadgen` de la Página + lectura en la Graph API | `FACEBOOK_ADS` |
| Formularios de Meta Ads en Instagram | Igual que arriba (Meta indica la plataforma) | `INSTAGRAM` |
| Mensajes directos de Instagram | Webhook `messages` de Instagram | `INSTAGRAM` |
| Messenger de la Página de Facebook | Webhook `messages` de la Página | `FACEBOOK_ADS` |
| WhatsApp (incluye anuncios Click-to-WhatsApp) | Webhook de WhatsApp Cloud API | `WHATSAPP` |
| Formulario del sitio web | `POST /api/leads/web` | `WEB` |

El código está en [`src/lead-capture/`](../src/lead-capture). Hay dos rutas:

- `GET/POST /api/webhooks/meta`: una sola URL para todos los webhooks de Meta.
- `POST /api/leads/web`: el formulario de la web.

## Qué hace con cada consulta

1. **Normaliza el contacto.** El teléfono pasa a formato internacional (`011 15 5555-1234` → `+5491155551234`), el mismo que usa WhatsApp, y el email a minúsculas.
2. **No duplica.** Meta reintenta los webhooks; cada evento queda anotado y un reintento no crea nada nuevo.
3. **Junta al mismo cliente.** Si ya hay un lead abierto (`NUEVO` o `CONTACTADO`) con el mismo teléfono, email o usuario de Instagram, el mensaje se suma a ese lead. Una charla de diez mensajes por WhatsApp es un solo lead, y quien llena el formulario web y después escribe por WhatsApp también.
4. **Reconoce clientes existentes.** Si el teléfono o email ya es de un `Contact`, se registra una `Activity` en su ficha y el lead queda ligado a él.
5. **Guarda el origen.** `Lead.campaign` toma el nombre de la campaña de Meta, el anuncio o el `utm_campaign`. En `rawPayload` quedan las respuestas del formulario (uso del domo, diámetro, zona), todos los mensajes, los ids de anuncio y el payload original.

## Puesta en marcha

### 1. App de Meta (una sola para todo)

1. En [developers.facebook.com](https://developers.facebook.com/apps) crear una app de tipo **Empresa** ligada al Business Manager de DOMO Baires.
2. Agregar los productos **Webhooks**, **WhatsApp** y **Messenger/Instagram**.
3. Copiar la **clave secreta de la app** (Configuración > Básica) en `META_APP_SECRET`.
4. Inventar un texto largo para `META_VERIFY_TOKEN`.

### 2. Webhooks

La URL de devolución de llamada es siempre `https://<dominio-del-crm>/api/webhooks/meta` con el `META_VERIFY_TOKEN` de arriba.

| Objeto en Webhooks | Campos a suscribir |
|--------------------|--------------------|
| Page | `leadgen`, `messages` |
| Instagram | `messages` |
| WhatsApp Business Account | `messages` |

Además, la Página y la cuenta de Instagram tienen que estar suscritas a la app (Messenger > Configuración > Webhooks > "Agregar suscripciones" en cada Página).

### 3. Formularios de Meta Ads (Lead Ads)

1. Generar un **token de acceso de la Página** de larga duración con los permisos `leads_retrieval`, `pages_manage_metadata`, `pages_show_list` y `pages_read_engagement`, y guardarlo en `META_PAGE_ACCESS_TOKEN`. Lo ideal es un usuario del sistema del Business Manager, para que no venza.
2. En el Business Manager, en *Integraciones > Acceso a clientes potenciales*, darle acceso a la app.
3. Probar con la [herramienta de prueba de anuncios para clientes potenciales](https://developers.facebook.com/tools/lead-ads-testing): el lead de prueba debería aparecer en el CRM al instante.

Conviene que los formularios pregunten uso del domo, diámetro aproximado y zona de instalación: esas respuestas quedan en el lead para calificarlo.

### 4. WhatsApp

1. Registrar el número de DOMO Baires en **WhatsApp Business Platform (Cloud API)** desde la app de Meta. El número deja de funcionar en la app común de WhatsApp Business, salvo que se use la coexistencia que ofrece Meta; conviene decidirlo antes.
2. Suscribir el campo `messages` como en el paso 2.
3. Los anuncios **Click-to-WhatsApp** no requieren nada extra: el primer mensaje trae el id del anuncio y queda en el lead.

Responder a los clientes desde el CRM (y el bot de calificación) es un paso aparte que usa este mismo número.

### 5. Instagram y Messenger

Con la cuenta de Instagram profesional conectada a la Página y el permiso `instagram_manage_messages`, cada DM nuevo entra como lead. Estos canales no dan teléfono ni email: el lead se identifica por el usuario de Instagram hasta que se le pida el WhatsApp.

### 6. Formulario de la web

Cargar el dominio en `WEB_FORM_ALLOWED_ORIGINS` y apuntar el formulario a la API. Ejemplo mínimo:

```html
<form id="contacto">
  <input name="nombre" placeholder="Nombre" required>
  <input name="telefono" placeholder="WhatsApp" required>
  <input name="email" type="email" placeholder="Email">
  <select name="uso">
    <option>Vivienda</option><option>Glamping</option><option>Invernadero</option>
    <option>Eventos</option><option>Quincho</option>
  </select>
  <textarea name="mensaje" placeholder="Contanos tu proyecto"></textarea>
  <!-- Campo trampa para bots: queda oculto -->
  <input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px">
  <button>Enviar</button>
</form>
<script>
  document.getElementById("contacto").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    new URLSearchParams(location.search).forEach((v, k) => {
      if (k.startsWith("utm_") || k === "fbclid" || k === "gclid") data[k] = v;
    });
    data.page_url = location.href;
    const res = await fetch("https://<dominio-del-crm>/api/leads/web", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    e.target.innerHTML = res.ok ? "¡Gracias! Te escribimos por WhatsApp." : "No se pudo enviar, probá de nuevo.";
  });
</script>
```

Acepta `nombre`/`name`, `telefono`/`phone`/`whatsapp`, `email`, `mensaje`/`message`; cualquier otro campo (como `uso` o `diametro`) se guarda como respuesta. Pide al menos teléfono o email.

### 7. Montarlo en la app

Cuando exista la app de Next.js, alcanza con `app/api/[...capture]/route.ts`:

```ts
import { captureHandlerFromEnv } from "@/src/lead-capture/from-env";

const handler = captureHandlerFromEnv();
export { handler as GET, handler as POST, handler as OPTIONS };
```

El handler usa `Request`/`Response` estándar, así que también funciona en Vercel, Cloudflare o una Supabase Edge Function sin cambios.

## Pruebas

```bash
npm test                     # canales, firma de Meta, deduplicación
TEST_DATABASE_URL=postgresql://... npm test   # además, contra una base real (la vacía)
npm run typecheck
```

## Pendiente o a decidir

- **Columna `externalId` en `Lead`.** Hoy la idempotencia se guarda dentro de `rawPayload`. Una columna única sería más robusta ante dos webhooks simultáneos del mismo cliente.
- **Nombre de Instagram.** Los DMs llegan sin nombre; se puede pedir a la Graph API con el IGSID.
- **Respuesta automática y calificación** con los datos que entran acá.
