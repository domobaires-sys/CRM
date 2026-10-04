// Cálculo de la cotización: función pura, sin E/S, para poder usarla desde el CRM,
// una API o la línea de comandos.

export class ErrorCotizacion extends Error {
  constructor(errores) {
    super(errores.join('\n'));
    this.name = 'ErrorCotizacion';
    this.errores = errores;
  }
}

const redondear = (n) => Math.round(n);
const redondear2 = (n) => Math.round(n * 100) / 100;

// Qué se informa como pendiente cuando un bloque de catalogo.validacion no está aprobado.
const BLOQUES = {
  catalogo: 'modelos, opciones y precios',
  descripcionesModelos: 'descripción de los modelos',
  alturas: 'alturas',
  plazos: 'plazos',
  condicionesPago: 'forma de pago',
  validez: 'validez de la propuesta',
  ingenieria: 'textos de ingeniería',
  fotos: 'fotos',
};

/** Bloques validados y lista legible de lo que sigue pendiente de validación por DOMO Baires. */
export function estadoValidacion(catalogo) {
  const validacion = Object.fromEntries(Object.keys(BLOQUES).map((k) => [k, catalogo.validacion?.[k] === true]));
  const pendientes = Object.entries(BLOQUES)
    .filter(([k]) => !validacion[k])
    .map(([, etiqueta]) => etiqueta);
  return { validacion, pendientes };
}

// SKUs con los que el catálogo se carga en la tabla Product del CRM.
export const skuModelo = (modeloId, diametro) => `DOMO-${diametro}M-${modeloId.toUpperCase()}`;
export const skuOpcion = (opcionId) => `OPC-${opcionId.toUpperCase()}`;

// La última cuota absorbe el redondeo para que las cuotas sumen exactamente el total.
export function repartirPagos(total, etapas) {
  let asignado = 0;
  return etapas.map((c, i) => {
    const monto = i === etapas.length - 1 ? total - asignado : redondear((total * c.porcentaje) / 100);
    asignado += monto;
    return { ...c, monto };
  });
}

/**
 * Calcula una cotización a partir de un pedido y el catálogo de precios.
 *
 * pedido = {
 *   cliente: { nombre, email?, telefono?, empresa? },
 *   proyecto: { ubicacion, provincia?, uso?, lat?, lng? },
 *   modelo: 'estructura' | 'envolvente' | 'llave-en-mano' (ids del catálogo),
 *   diametro: 6,
 *   opciones: [{ id: 'claraboya', cantidad: 2 }, 'vidriado-panoramico', ...],
 *   descuentoPorcentaje?: 5,
 *   numero?, fecha?, notas?
 * }
 *
 * Sin número, la propuesta sale como BORRADOR; el número (P-0001) lo asigna el CRM al guardarla.
 */
export function calcularCotizacion(pedido, catalogo) {
  const errores = [];
  const cliente = pedido?.cliente ?? {};
  const proyecto = pedido?.proyecto ?? {};

  if (!cliente.nombre) errores.push('Falta el nombre del cliente (cliente.nombre).');
  if (!proyecto.ubicacion) errores.push('Falta la ubicación del proyecto (proyecto.ubicacion).');

  const modelo = catalogo.modelos.find((m) => m.id === pedido?.modelo);
  if (!modelo) {
    errores.push(`Modelo desconocido "${pedido?.modelo}". Opciones: ${catalogo.modelos.map((m) => m.id).join(', ')}.`);
  }

  const medida = catalogo.diametros.find((d) => d.diametro === Number(pedido?.diametro));
  if (!medida) {
    errores.push(`Diámetro no disponible "${pedido?.diametro}". Opciones: ${catalogo.diametros.map((d) => d.diametro).join(', ')} m.`);
  }

  const descuento = Number(pedido?.descuentoPorcentaje ?? 0);
  if (!(descuento >= 0 && descuento <= 100)) errores.push('El descuento debe estar entre 0 y 100.');

  const pedidas = (pedido?.opciones ?? []).map((o) => (typeof o === 'string' ? { id: o } : o));
  const opcionesValidas = [];
  for (const o of pedidas) {
    const def = catalogo.opciones.find((c) => c.id === o.id);
    if (!def) {
      errores.push(`Opción desconocida "${o.id}".`);
      continue;
    }
    if (modelo && def.modelos && !def.modelos.includes(modelo.id)) {
      errores.push(`La opción "${def.nombre}" no está disponible para el modelo ${modelo.nombre}.`);
      continue;
    }
    const cantidad = o.cantidad;
    if ((def.tipo === 'unidad' || def.tipo === 'm2') && !(Number(cantidad) > 0)) {
      errores.push(`La opción "${def.nombre}" necesita una cantidad mayor a 0.`);
      continue;
    }
    opcionesValidas.push({ def, cantidad: Number(cantidad ?? 1) });
  }

  if (errores.length) throw new ErrorCotizacion(errores);

  const superficie = redondear2(Math.PI * (medida.diametro / 2) ** 2);

  const items = [];
  const base = Math.max(modelo.precioM2 * superficie, modelo.minimo ?? 0);
  items.push({
    sku: skuModelo(modelo.id, medida.diametro),
    descripcion: `Domo ${medida.diametro} m · modelo ${modelo.nombre}`,
    detalle: `${superficie.toLocaleString('es-AR')} m² cubiertos`,
    cantidad: 1,
    precioUnitario: redondear(base),
    importe: redondear(base),
  });

  for (const { def, cantidad } of opcionesValidas) {
    let cant;
    let detalle = '';
    switch (def.tipo) {
      case 'fijo':
        cant = 1;
        break;
      case 'unidad':
      case 'm2':
        cant = cantidad;
        detalle = `${cantidad.toLocaleString('es-AR')} ${def.unidad ?? 'u.'}`;
        break;
      case 'm2Domo':
        cant = redondear2(superficie * (def.factor ?? 1));
        detalle = `${cant.toLocaleString('es-AR')} m²`;
        break;
      default:
        throw new Error(`Tipo de opción no soportado en el catálogo: ${def.tipo}`);
    }
    items.push({
      sku: skuOpcion(def.id),
      descripcion: def.nombre,
      detalle,
      cantidad: cant,
      precioUnitario: def.precio,
      importe: redondear(def.precio * cant),
    });
  }

  const subtotal = items.reduce((s, i) => s + i.importe, 0);
  const montoDescuento = redondear((subtotal * descuento) / 100);
  const neto = subtotal - montoDescuento;
  const ivaPct = catalogo.iva?.porcentaje ?? 0;
  const ivaIncluido = Boolean(catalogo.iva?.incluidoEnPrecios);
  const iva = ivaIncluido ? 0 : redondear((neto * ivaPct) / 100);
  const total = neto + iva;

  const fecha = pedido.fecha ? new Date(pedido.fecha) : new Date();
  const vence = new Date(fecha);
  vence.setDate(vence.getDate() + (catalogo.validezDias ?? 15));

  return {
    numero: pedido.numero ?? 'BORRADOR',
    fecha: fecha.toISOString().slice(0, 10),
    validaHasta: vence.toISOString().slice(0, 10),
    moneda: catalogo.moneda,
    cliente,
    proyecto,
    modelo: { id: modelo.id, nombre: modelo.nombre, descripcion: modelo.descripcion, incluye: modelo.incluye },
    domo: { diametro: medida.diametro, altura: medida.altura, superficie },
    plazoSemanas: modelo.plazoSemanas,
    items,
    subtotal,
    descuento: { porcentaje: descuento, monto: montoDescuento },
    iva: { porcentaje: ivaPct, incluido: ivaIncluido, monto: iva },
    total,
    condicionesPago: repartirPagos(total, catalogo.condicionesPago ?? []),
    notas: pedido.notas ?? '',
    ingenieria: catalogo.ingenieria ?? null,
    ...estadoValidacion(catalogo),
  };
}
