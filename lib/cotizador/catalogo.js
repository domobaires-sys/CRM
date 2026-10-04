import { readFileSync } from 'node:fs';

/** Lee el catálogo de precios (por defecto, catalogo.json junto a este archivo). */
export function cargarCatalogo(ruta = new URL('./catalogo.json', import.meta.url)) {
  return JSON.parse(readFileSync(ruta, 'utf8'));
}
