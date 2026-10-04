# Cotizador automático

Genera la propuesta comercial de DOMO Baires en PDF (A4, con la identidad de marca) a partir de **modelo**, **diámetro** y **opciones**, y la guarda como `Quote` del deal en el CRM.

Código en [`lib/cotizador/`](../lib/cotizador/).

## Regla: nada sin validar

La propuesta sólo presenta como solución de DOMO Baires lo que DOMO Baires validó. En [`lib/cotizador/catalogo.json`](../lib/cotizador/catalogo.json) el bloque `validacion` tiene un interruptor por tipo de contenido, y **hoy están todos en `false`**:

| Bloque | Mientras no esté validado |
|---|---|
| `catalogo` (modelos, opciones y precios) | Se muestran con la marca de agua "PRECIOS DE EJEMPLO" |
| `descripcionesModelos` | No se muestra descripción ni "qué incluye" (están vacíos) |
| `alturas` | No se muestra la altura |
| `plazos` | El plazo figura "A definir" |
| `condicionesPago` | No se muestra la forma de pago |
| `validez` | No se muestra la fecha de vencimiento |
| `ingenieria` | No se incluye la página de ingeniería (sus textos están vacíos) |
| `fotos` | Portada y cierre sin fotos |

Mientras quede algo pendiente, cada página lleva la franja "Borrador · No enviar a clientes · Pendiente de validación por DOMO Baires: …" y la línea de comandos lo advierte.

## Qué trae la propuesta

1. **Portada**: cliente o emprendimiento, modelo, diámetro, ubicación, número y fecha.
2. **El proyecto**: modelo, diámetro, superficie, uso, ubicación (y coordenadas si se cargan) y plazo.
3. **Ingeniería** (sólo si está validada): título, texto y puntos tal como los cargue DOMO Baires; `{lugar}` se reemplaza por la ubicación del proyecto.
4. **Inversión**: detalle de ítems, descuento, IVA y total.
5. **Cierre**: "Conocé el futuro." y contacto por WhatsApp, mail, Instagram y web.

## Uso

```bash
npm install

# Sin base de datos: desde un archivo de pedido
npm run cotizar -- lib/cotizador/ejemplos/glamping-bariloche.json -o propuestas/ejemplo.pdf

# Con la base: guarda el presupuesto (P-0001, P-0002…) en el deal y genera el PDF
npm run db:seed:catalogo            # una vez, carga el catálogo en la tabla Product
npm run cotizar -- pedido.json --deal <id del deal>

# Regenerar el PDF de un presupuesto ya guardado
npm run cotizar -- --presupuesto P-0001
```

Con `--html` sale el HTML en lugar del PDF, útil para revisar el diseño en el navegador.

Cuando se cotiza sobre un deal, el cliente, la ubicación, el uso y el diámetro se toman del deal y su contacto; el pedido sólo necesita el modelo y las opciones:

```json
{
  "modelo": "llave-en-mano",
  "opciones": ["vidriado-panoramico", "bano", { "id": "deck", "cantidad": 18 }, { "id": "flete", "cantidad": 1600 }],
  "descuentoPorcentaje": 5,
  "notas": "Texto libre para este cliente."
}
```

Desde código (por ejemplo, una ruta de API de Next.js):

```js
import { cargarCatalogo, guardarCotizacion, generarPDF } from '@/lib/cotizador';

const { quote, cotizacion } = await guardarCotizacion(prisma, dealId, pedido, cargarCatalogo());
const pdf = await generarPDF(cotizacion); // Buffer
```

## Precios y catálogo

Todo vive en [`lib/cotizador/catalogo.json`](../lib/cotizador/catalogo.json):

- **Modelos** (`estructura`, `envolvente`, `llave-en-mano`): nombre, precio por m², mínimo, plazo en semanas, descripción y qué incluye.
- **Diámetros** disponibles con su altura.
- **Opciones**, de cuatro tipos:
  - `fijo`: un precio.
  - `unidad`: precio × cantidad (por ejemplo, flete por km).
  - `m2`: precio × m² que se indican.
  - `m2Domo`: precio × superficie del domo × factor.
  - `modelos` limita una opción a ciertos modelos.
- IVA, validez de la propuesta, cuotas de pago y textos de ingeniería.

> **Los modelos, opciones y precios actuales son de ejemplo**, sólo para probar el cálculo. Cuando DOMO Baires cargue los reales, se pone `validacion.catalogo` en `true` y se corre `npm run db:seed:catalogo` para actualizar la tabla `Product`.

## Logo y fotos

- **Logo**: si existen `lib/cotizador/assets/logo-navy.svg` (o `.png`) y `logo-blanco.svg`, se usan esos archivos. Mientras tanto, la propuesta compone el logotipo "DOMO BAIRES" con la tipografía de marca.
- **Fotos**: `lib/cotizador/assets/fotos/{portada,proyecto,ingenieria,cierre}.jpg`. Sólo se usan con `validacion.fotos` en `true`; reemplazarlas por fotos aprobadas antes de activarlo.
- Tipografías: Poppins y Archivo (sustituto libre de Termina), incluidas vía `@fontsource`, sin depender de internet al generar.

## Requisitos técnicos

El PDF se genera con Chromium (`playwright-core`). En la máquina de desarrollo se usa Chrome/Chromium instalado; si no lo encuentra, indicar la ruta con `CHROMIUM_PATH`. En Vercel se puede usar `@sparticuz/chromium` pasando su ruta en `CHROMIUM_PATH`.
