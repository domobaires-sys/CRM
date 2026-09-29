// Convierte la propuesta HTML en PDF con Chromium (playwright-core).
// En servidores sin Chromium en el PATH, indicar la ruta con CHROMIUM_PATH.

import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { renderHTML } from './plantilla.js';

const RUTAS_CHROMIUM = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

function buscarChromium() {
  const ruta = RUTAS_CHROMIUM.find((r) => existsSync(r));
  // Sin ruta explícita, playwright-core usa el Chromium que tenga instalado.
  return ruta ? { executablePath: ruta } : {};
}

/** Devuelve el PDF de la propuesta como Buffer. */
export async function generarPDF(cotizacion) {
  const navegador = await chromium.launch(buscarChromium());
  try {
    const pagina = await navegador.newPage();
    await pagina.setContent(renderHTML(cotizacion), { waitUntil: 'load' });
    await pagina.evaluate(() => document.fonts.ready);
    return await pagina.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  } finally {
    await navegador.close();
  }
}
