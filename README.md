# CRM DOMO Baires

CRM propio para automatizar de punta a punta la venta de domos geodésicos: desde que entra una consulta (Instagram, Meta Ads, web, WhatsApp) hasta que se cobra la seña.

Este primer paso define **la base de datos**. Todavía no hay pantallas ni automatizaciones; eso se construye encima.

## Cómo fluye una venta

```
Lead (consulta entrante)
  └─> Contact (la persona)  +  Deal (la oportunidad, avanza por el pipeline)
                                  ├─> Quote (presupuesto, con ítems del catálogo)
                                  └─> Activity (WhatsApp, llamadas, visitas, tareas de seguimiento)
```

Etapas del pipeline (se cargan con `npm run db:seed`):

| # | Etapa | Prob. de cierre |
|---|-------|-----------------|
| 1 | Nuevo | 5 % |
| 2 | Contactado | 10 % |
| 3 | Calificado | 25 % |
| 4 | Presupuesto enviado | 50 % |
| 5 | Negociación | 70 % |
| 6 | Ganado (seña cobrada) | 100 % |
| 7 | Perdido | 0 % |

El detalle de cada tabla está en [docs/modelo-de-datos.md](docs/modelo-de-datos.md) y la propuesta de tecnología en [docs/stack.md](docs/stack.md).

## Puesta en marcha

Requisitos: Node 20+ y una base PostgreSQL (local, o gratis en Supabase/Neon).

```bash
cp .env.example .env        # completar DATABASE_URL
npm install
npm run db:migrate          # crea las tablas
npm run db:seed             # carga las etapas del pipeline
npm run db:studio           # abre un panel para ver y editar datos
```
