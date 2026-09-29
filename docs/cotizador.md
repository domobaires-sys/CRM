# Cotizador automático

Genera la propuesta comercial de DOMO Baires en PDF (5 páginas A4, con la identidad de marca) a partir de **modelo**, **diámetro** y **opciones**, y la guarda como `Quote` del deal en el CRM.

Código en [`lib/cotizador/`](../lib/cotizador/).

## Qué trae la propuesta

1. **Portada**: foto, nombre del cliente o emprendimiento, número, fecha y vencimiento.
2. **El proyecto**: diámetro, superficie, altura, uso, ubicación, plazo y qué incluye el modelo.
3. **Ingeniería sitio-específica**: cita la ubicación real del cliente (y coordenadas si se cargan). En Neuquén, Río Negro, Chubut, Santa Cruz, Tierra del Fuego y Mendoza destaca la carga de nieve (CIRSOC 104) además del viento (CIRSOC 102).
4. **Inversión**: detalle de ítems, descuento, IVA, total, forma de pago en cuotas y etapas con semanas.
5. **Cierre**: "Conocé el futuro." y un único llamado a la acción por WhatsApp.

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
  "notas": "Descuento por reserva de dos unidades."
}
```

Desde código (por ejemplo, una ruta de API de Next.js):

```js
import { cargarCatalogo, guardarCotizacion, generarPDF } from '@/lib/cotizador';

const { quote, cotizacion } = await guardarCotizacion(prisma, dealId, pedido, cargarCatalogo());
const pdf = await generarPDF(cotizacion); // Buffer
```

## Precios y catálogo

Todo lo que cambia seguido vive en [`lib/cotizador/catalogo.json`](../lib/cotizador/catalogo.json):

- **Modelos** (`estructura`, `envolvente`, `llave-en-mano`): precio por m², mínimo, plazo en semanas, qué incluye.
- **Diámetros** disponibles (5, 6, 7, 8, 10 y 12 m) con su altura.
- **Opciones**, de cuatro tipos:
  - `fijo`: un precio (baño, vidriado panorámico).
  - `unidad`: precio × cantidad (claraboyas, flete por km).
  - `m2`: precio × m² que se indican (deck).
  - `m2Domo`: precio × superficie del domo × factor (altillo, aislación reforzada, platea).
  - `modelos` limita una opción a ciertos modelos (por ejemplo, no hay baño en el modelo Estructura).
- IVA, validez de la propuesta y cuotas de pago.

> **Los precios actuales son de ejemplo.** Hay que reemplazarlos por la lista real antes de mandar propuestas a clientes, y después correr `npm run db:seed:catalogo` para actualizar la tabla `Product`.

## Logo y fotos

- **Logo**: si existen `lib/cotizador/assets/logo-navy.svg` (o `.png`) y `logo-blanco.svg`, se usan esos archivos. Mientras tanto, la propuesta compone el logotipo "DOMO BAIRES" con la tipografía de marca.
- **Fotos**: `lib/cotizador/assets/fotos/{portada,proyecto,ingenieria,cierre}.jpg`. Se pueden reemplazar por fotos de obra reales con el mismo nombre.
- Tipografías: Poppins y Archivo (sustituto libre de Termina), incluidas vía `@fontsource`, sin depender de internet al generar.

## Requisitos técnicos

El PDF se genera con Chromium (`playwright-core`). En la máquina de desarrollo se usa Chrome/Chromium instalado; si no lo encuentra, indicar la ruta con `CHROMIUM_PATH`. En Vercel se puede usar `@sparticuz/chromium` pasando su ruta en `CHROMIUM_PATH`.
