// Carga el catálogo del cotizador (lib/cotizador/catalogo.json) en la tabla Product:
// un producto por modelo y diámetro, y uno por cada opción. Se puede correr varias veces.
import { PrismaClient } from "@prisma/client";
import { cargarCatalogo } from "../lib/cotizador/catalogo.js";
import { skuModelo, skuOpcion } from "../lib/cotizador/cotizar.js";

const prisma = new PrismaClient();
const catalogo = cargarCatalogo();

const productos = [];
for (const modelo of catalogo.modelos) {
  for (const { diametro } of catalogo.diametros) {
    const areaM2 = Math.round(Math.PI * (diametro / 2) ** 2 * 100) / 100;
    productos.push({
      sku: skuModelo(modelo.id, diametro),
      name: `Domo ${diametro} m · ${modelo.nombre}`,
      description: modelo.descripcion,
      diameterM: diametro,
      areaM2,
      basePrice: Math.round(Math.max(modelo.precioM2 * areaM2, modelo.minimo ?? 0)),
      currency: catalogo.moneda,
    });
  }
}
for (const opcion of catalogo.opciones) {
  productos.push({
    sku: skuOpcion(opcion.id),
    name: opcion.nombre,
    description: opcion.tipo === "fijo" ? null : `Precio por ${opcion.unidad ?? "m²"}`,
    basePrice: opcion.precio,
    currency: catalogo.moneda,
  });
}

for (const p of productos) {
  await prisma.product.upsert({ where: { sku: p.sku }, update: p, create: p });
}

console.log(`Productos cargados: ${productos.length}`);
await prisma.$disconnect();
