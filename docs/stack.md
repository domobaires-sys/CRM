# Stack propuesto

| Pieza | Elección | Por qué |
|-------|----------|---------|
| Base de datos | PostgreSQL (Supabase o Neon) | Gratis para empezar, confiable, con backups. |
| Acceso a datos | Prisma | El modelo queda en un solo archivo legible y las migraciones son automáticas. |
| App web | Next.js (TypeScript) | Pantallas del CRM y API en un mismo proyecto; se despliega en Vercel sin servidores propios. |
| Automatizaciones | Rutas de API + tareas programadas (Vercel Cron) | Recibir leads de Meta Ads y la web por webhook, recordatorios de seguimiento, vencimiento de presupuestos. |
| Mensajería | WhatsApp Business API (más adelante) | Registrar conversaciones como actividades y enviar recordatorios. |
| Presupuestos | PDF generado desde la app | Con la identidad visual de DOMO Baires. |

## Próximos pasos sugeridos
1. Crear la base y correr las migraciones.
2. Pantallas básicas: tablero del pipeline (kanban), ficha de contacto, alta de presupuesto.
3. Webhook de Meta Lead Ads y formulario web que crean `Lead` automáticamente.
4. Recordatorios de seguimiento y alertas de deals estancados.
5. Presupuesto en PDF y envío por WhatsApp/mail.
