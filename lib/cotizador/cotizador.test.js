import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cargarCatalogo } from './catalogo.js';
import { calcularCotizacion, ErrorCotizacion } from './cotizar.js';
import { cotizacionDesdeQuote } from './crm.js';
import { renderHTML } from './plantilla.js';

const catalogo = cargarCatalogo();
const base = {
  cliente: { nombre: 'Ana Pérez' },
  proyecto: { ubicacion: 'Tandil', provincia: 'Buenos Aires' },
  modelo: 'envolvente',
  diametro: 6,
  fecha: '2026-09-29',
};

test('precio base por m² con el mínimo del modelo', () => {
  const chico = calcularCotizacion({ ...base, modelo: 'estructura', diametro: 5 }, catalogo);
  // 19,63 m² × 380 = 7.461 < mínimo 9.000
  assert.equal(chico.items[0].importe, 9000);

  const grande = calcularCotizacion({ ...base, diametro: 10 }, catalogo);
  assert.equal(grande.domo.superficie, 78.54);
  assert.equal(grande.items[0].importe, Math.round(78.54 * 650));
});

test('opciones fijas, por unidad, por m² y por m² del domo', () => {
  const c = calcularCotizacion(
    {
      ...base,
      opciones: ['bano', { id: 'claraboya', cantidad: 2 }, { id: 'deck', cantidad: 10 }, 'altillo'],
    },
    catalogo,
  );
  const importe = (sku) => c.items.find((i) => i.sku === sku).importe;
  assert.equal(importe('OPC-BANO'), 6500);
  assert.equal(importe('OPC-CLARABOYA'), 1300);
  assert.equal(importe('OPC-DECK'), 1200);
  // 28,27 m² × 0,35 = 9,89 m² × 420
  assert.equal(importe('OPC-ALTILLO'), Math.round(9.89 * 420));
});

test('descuento, IVA y cuotas que suman el total', () => {
  const c = calcularCotizacion({ ...base, opciones: ['vidriado-panoramico'], descuentoPorcentaje: 10 }, catalogo);
  assert.equal(c.subtotal, c.items.reduce((s, i) => s + i.importe, 0));
  assert.equal(c.descuento.monto, Math.round(c.subtotal * 0.1));
  assert.equal(c.iva.monto, Math.round((c.subtotal - c.descuento.monto) * 0.21));
  assert.equal(c.total, c.subtotal - c.descuento.monto + c.iva.monto);
  assert.equal(c.condicionesPago.reduce((s, p) => s + p.monto, 0), c.total);
  assert.equal(c.validaHasta, '2026-10-14');
});

test('valida el pedido y junta todos los errores', () => {
  assert.throws(
    () => calcularCotizacion({ modelo: 'x', diametro: 9, opciones: ['nada'] }, catalogo),
    (e) => e instanceof ErrorCotizacion && e.errores.length === 5,
  );
  assert.throws(
    () => calcularCotizacion({ ...base, modelo: 'estructura', opciones: ['bano'] }, catalogo),
    /no está disponible para el modelo Estructura/,
  );
  assert.throws(() => calcularCotizacion({ ...base, opciones: [{ id: 'flete' }] }, catalogo), /cantidad/);
});

test('la propuesta menciona el lugar y escapa los datos del cliente', () => {
  const nieve = renderHTML(
    calcularCotizacion(
      { ...base, cliente: { nombre: '<script>x</script>' }, proyecto: { ubicacion: 'San Martín de los Andes', provincia: 'Neuquén' } },
      catalogo,
    ),
  );
  assert.match(nieve, /Calculado para San Martín de los Andes/);
  assert.match(nieve, /CIRSOC 104/);
  assert.doesNotMatch(nieve, /<script>x/);
});

test('reconstruye la propuesta desde un Quote guardado', () => {
  const c = calcularCotizacion({ ...base, opciones: ['bano'], descuentoPorcentaje: 5 }, catalogo);
  const quote = {
    number: 7,
    createdAt: new Date('2026-09-29T12:00:00Z'),
    validUntil: new Date('2026-10-14T23:59:59Z'),
    currency: 'USD',
    discount: c.descuento.monto,
    total: c.total,
    notes: null,
    deal: {
      diameterM: '6.00',
      use: 'VIVIENDA',
      installCity: 'Tandil',
      installProvince: 'Buenos Aires',
      contact: { firstName: 'Ana', lastName: 'Pérez' },
    },
    items: c.items.map((i) => ({
      description: i.detalle ? `${i.descripcion} (${i.detalle})` : i.descripcion,
      quantity: String(i.cantidad),
      unitPrice: String(i.precioUnitario),
      product: { sku: i.sku, diameterM: null },
    })),
  };
  const r = cotizacionDesdeQuote(quote, catalogo);
  assert.equal(r.numero, 'P-0007');
  assert.equal(r.modelo.id, 'envolvente');
  assert.equal(r.proyecto.uso, 'Vivienda');
  assert.equal(r.subtotal, c.subtotal);
  assert.equal(r.iva.monto, c.iva.monto);
  assert.equal(r.total, c.total);
  assert.deepEqual(r.items.map((i) => i.detalle), c.items.map((i) => i.detalle));
});
