#!/usr/bin/env node
// Uso:
//   npm run cotizar -- pedido.json [-o propuesta.pdf] [--html]    PDF desde un archivo, sin base de datos
//   npm run cotizar -- pedido.json --deal <id> [-o propuesta.pdf]  guarda el presupuesto en el CRM y genera el PDF
//   npm run cotizar -- --presupuesto P-0001 [-o propuesta.pdf]     regenera el PDF de un presupuesto guardado

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { cargarCatalogo } from './catalogo.js';
import { calcularCotizacion, ErrorCotizacion } from './cotizar.js';
import { generarPDF } from './pdf.js';
import { renderHTML } from './plantilla.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    salida: { type: 'string', short: 'o' },
    deal: { type: 'string' },
    presupuesto: { type: 'string' },
    catalogo: { type: 'string' },
    html: { type: 'boolean' },
  },
});

const catalogo = cargarCatalogo(values.catalogo);

async function conPrisma(fn) {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function obtenerCotizacion() {
  if (values.presupuesto) {
    const { buscarQuote, cotizacionDesdeQuote } = await import('./crm.js');
    return conPrisma(async (prisma) => cotizacionDesdeQuote(await buscarQuote(prisma, values.presupuesto), catalogo));
  }
  if (!positionals[0]) {
    throw new ErrorCotizacion(['Indicá un archivo de pedido (ver lib/cotizador/ejemplos) o --presupuesto P-0001.']);
  }
  const pedido = JSON.parse(readFileSync(positionals[0], 'utf8'));
  if (values.deal) {
    const { guardarCotizacion } = await import('./crm.js');
    return conPrisma(async (prisma) => {
      const { cotizacion } = await guardarCotizacion(prisma, values.deal, pedido, catalogo);
      console.log(`Presupuesto ${cotizacion.numero} guardado en el deal ${values.deal}.`);
      return cotizacion;
    });
  }
  return calcularCotizacion(pedido, catalogo);
}

try {
  const cotizacion = await obtenerCotizacion();
  const extension = values.html ? 'html' : 'pdf';
  const salida = values.salida ?? `propuestas/${cotizacion.numero}.${extension}`;
  mkdirSync(dirname(salida), { recursive: true });
  writeFileSync(salida, values.html ? renderHTML(cotizacion) : await generarPDF(cotizacion));
  if (cotizacion.pendientes.length) {
    console.warn(`BORRADOR, no enviar a clientes. Pendiente de validación por DOMO Baires: ${cotizacion.pendientes.join(', ')}.`);
  }
  console.log(`${cotizacion.numero} · total ${cotizacion.moneda} ${cotizacion.total.toLocaleString('es-AR')} → ${salida}`);
} catch (e) {
  if (e instanceof ErrorCotizacion) {
    console.error(`No se pudo cotizar:\n- ${e.errores.join('\n- ')}`);
    process.exit(1);
  }
  throw e;
}
