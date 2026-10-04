// Puente entre el cotizador y la base del CRM (Prisma): guarda la cotización como
// Quote + QuoteItem de un Deal, y reconstruye la propuesta desde un Quote guardado.

import { calcularCotizacion, estadoValidacion, repartirPagos } from './cotizar.js';

export const numeroPresupuesto = (n) => `P-${String(n).padStart(4, '0')}`;

const USOS = {
  VIVIENDA: 'Vivienda',
  GLAMPING: 'Glamping',
  INVERNADERO: 'Invernadero',
  EVENTOS: 'Eventos',
  QUINCHO: 'Quincho',
  OTRO: 'Otro',
};
const USO_DESDE_TEXTO = Object.fromEntries(Object.entries(USOS).map(([k, v]) => [v.toLowerCase(), k]));

const num = (d) => (d == null ? null : Number(d));

/** Arma el pedido del cotizador con los datos que ya tiene el Deal y su contacto. */
export function pedidoDesdeDeal(deal, pedido = {}) {
  const c = deal.contact ?? {};
  return {
    ...pedido,
    cliente: {
      nombre: [c.firstName, c.lastName].filter(Boolean).join(' '),
      empresa: c.company ?? undefined,
      email: c.email ?? undefined,
      telefono: c.phone ?? undefined,
      ...pedido.cliente,
    },
    proyecto: {
      ubicacion: deal.installCity ?? undefined,
      provincia: deal.installProvince ?? undefined,
      uso: deal.use ? USOS[deal.use] : undefined,
      ...pedido.proyecto,
    },
    diametro: pedido.diametro ?? num(deal.diameterM),
  };
}

/**
 * Calcula y guarda una cotización para un Deal. Devuelve { quote, cotizacion }.
 * pedido: modelo, opciones, descuentoPorcentaje, notas (y opcionalmente diametro,
 * cliente o proyecto si difieren de lo cargado en el Deal).
 */
export async function guardarCotizacion(prisma, dealId, pedido, catalogo) {
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId }, include: { contact: true } });
  const cotizacion = calcularCotizacion(pedidoDesdeDeal(deal, pedido), catalogo);

  const productos = await prisma.product.findMany({
    where: { sku: { in: cotizacion.items.map((i) => i.sku) } },
    select: { id: true, sku: true },
  });
  const idPorSku = new Map(productos.map((p) => [p.sku, p.id]));

  const quote = await prisma.quote.create({
    data: {
      dealId,
      currency: cotizacion.moneda,
      discount: cotizacion.descuento.monto,
      total: cotizacion.total,
      validUntil: new Date(`${cotizacion.validaHasta}T23:59:59`),
      notes: cotizacion.notas || null,
      items: {
        create: cotizacion.items.map((i) => ({
          productId: idPorSku.get(i.sku) ?? null,
          description: i.detalle ? `${i.descripcion} (${i.detalle})` : i.descripcion,
          quantity: i.cantidad,
          unitPrice: i.precioUnitario,
        })),
      },
    },
  });

  // Si el deal no tenía uso o diámetro cargados, quedan completos con lo cotizado.
  const usoPedido = USO_DESDE_TEXTO[normalizar(pedido.proyecto?.uso)];
  await prisma.deal.update({
    where: { id: dealId },
    data: {
      diameterM: deal.diameterM ?? cotizacion.domo.diametro,
      use: deal.use ?? usoPedido ?? undefined,
    },
  });

  return { quote, cotizacion: { ...cotizacion, numero: numeroPresupuesto(quote.number) } };
}

const normalizar = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Reconstruye la propuesta a partir de un Quote guardado (con deal.contact e
 * items.product incluidos), para regenerar o reenviar el PDF.
 */
export function cotizacionDesdeQuote(quote, catalogo) {
  const deal = quote.deal;
  const pedido = pedidoDesdeDeal(deal);

  const skuDomo = quote.items.map((i) => i.product?.sku).find((s) => s?.startsWith('DOMO-'));
  const modelo =
    catalogo.modelos.find((m) => skuDomo?.endsWith(`-${m.id.toUpperCase()}`)) ?? {
      id: 'a-medida',
      nombre: 'A medida',
      descripcion: '',
      incluye: [],
      plazoSemanas: null,
    };

  const diametro = pedido.diametro ?? num(quote.items.find((i) => i.product?.diameterM)?.product.diameterM);
  const medida = catalogo.diametros.find((d) => d.diametro === diametro);

  const items = quote.items.map((i) => {
    const importe = Math.round(Number(i.quantity) * Number(i.unitPrice));
    const [, descripcion, detalle] = i.description.match(/^(.*?)(?: \((.*)\))?$/);
    return { sku: i.product?.sku ?? null, descripcion, detalle: detalle ?? '', cantidad: Number(i.quantity), precioUnitario: Number(i.unitPrice), importe };
  });
  const subtotal = items.reduce((s, i) => s + i.importe, 0);
  const descuento = Number(quote.discount);
  const neto = subtotal - descuento;
  const total = Number(quote.total) || neto;
  const ivaIncluido = Boolean(catalogo.iva?.incluidoEnPrecios);

  return {
    numero: numeroPresupuesto(quote.number),
    fecha: quote.createdAt.toISOString().slice(0, 10),
    validaHasta: (quote.validUntil ?? quote.createdAt).toISOString().slice(0, 10),
    moneda: quote.currency,
    cliente: pedido.cliente,
    proyecto: pedido.proyecto,
    modelo: { id: modelo.id, nombre: modelo.nombre, descripcion: modelo.descripcion, incluye: modelo.incluye },
    domo: {
      diametro,
      altura: medida?.altura ?? null,
      superficie: diametro ? Math.round(Math.PI * (diametro / 2) ** 2 * 100) / 100 : null,
    },
    plazoSemanas: modelo.plazoSemanas,
    items,
    subtotal,
    descuento: { porcentaje: subtotal ? Math.round((descuento / subtotal) * 1000) / 10 : 0, monto: descuento },
    iva: { porcentaje: catalogo.iva?.porcentaje ?? 0, incluido: ivaIncluido, monto: ivaIncluido ? 0 : total - neto },
    total,
    condicionesPago: repartirPagos(total, catalogo.condicionesPago ?? []),
    notas: quote.notes ?? '',
    ingenieria: catalogo.ingenieria ?? null,
    ...estadoValidacion(catalogo),
  };
}

/** Busca un Quote por su número (P-0001 o 1) con todo lo necesario para el PDF. */
export function buscarQuote(prisma, numero) {
  const n = Number(String(numero).replace(/^P-?/i, ''));
  return prisma.quote.findUniqueOrThrow({
    where: { number: n },
    include: { deal: { include: { contact: true } }, items: { include: { product: true }, orderBy: { id: 'asc' } } },
  });
}
