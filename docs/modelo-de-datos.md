# Modelo de datos

Definido en [`prisma/schema.prisma`](../prisma/schema.prisma).

## Lead
La consulta tal como llega, antes de saber si es un cliente real. Guarda la fuente (`INSTAGRAM`, `FACEBOOK_ADS`, `WEB`, `WHATSAPP`, `REFERIDO`, `CURSO`, `FERIA`, `OTRO`), la campaña, anuncio y formulario de origen, el `externalId` de la plataforma (único por fuente, evita cargar dos veces el mismo lead) y el `rawPayload` completo para no perder nada cuando la carga sea automática. Estados: `NUEVO`, `CONTACTADO`, `CONVERTIDO`, `DESCARTADO`.

Separarlo del contacto permite medir qué campañas traen consultas que después se convierten en ventas.

## Contact
La persona (o emprendimiento) con quien se habla. El teléfono es único y va en formato internacional (`+549...`) para poder cruzarlo con WhatsApp y evitar duplicados.

## Deal
Una oportunidad concreta: "Juan quiere un domo de 6 m para glamping en Mendoza". Tiene etapa, vendedor asignado, uso (`VIVIENDA`, `GLAMPING`, `INVERNADERO`, `EVENTOS`, `QUINCHO`, `OTRO`), diámetro buscado, lugar de instalación, valor estimado y moneda (`USD` por defecto, o `ARS`). `stageChangedAt` sirve para detectar deals que quedaron quietos y disparar recordatorios. Si se pierde, `lostReason` guarda por qué.

## PipelineStage
Las etapas configurables, con orden y probabilidad de cierre para proyectar ventas. Una etapa se marca como ganada (`isWon`) y otra como perdida (`isLost`).

## Product
El catálogo: cada modelo de domo (diámetro, m², precio base) y también extras como flete o montaje si se quieren presupuestar como ítems fijos.

## Quote y QuoteItem
El presupuesto de un deal, numerado (P-0001, P-0002...). Estados: `BORRADOR`, `ENVIADO`, `ACEPTADO`, `RECHAZADO`, `VENCIDO`. Guarda la cotización del dólar usada si se presupuesta en pesos, descuento, total y vencimiento. Cada ítem puede venir del catálogo o ser una línea libre ("Flete a Córdoba").

## Activity
Todo lo que pasa con un contacto o deal: mensajes de WhatsApp, llamadas, mails, reuniones, visitas, notas y tareas. Si tiene `dueAt` y no tiene `doneAt`, es un seguimiento pendiente; de ahí salen los recordatorios automáticos.

## User
Las personas del equipo que venden. Se asignan a leads, deals y actividades.
