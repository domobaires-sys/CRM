// Plantilla HTML de la propuesta comercial (A4), con la identidad de DOMO Baires.
// Sólo muestra el contenido que DOMO Baires marcó como validado en catalogo.json ("validacion").
// El HTML es autocontenido: fotos, logos y tipografías van incrustados en base64.

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const assets = (p) => fileURLToPath(new URL(`./assets/${p}`, import.meta.url));

const cache = new Map();
function dataUri(ruta, mime) {
  if (!cache.has(ruta)) cache.set(ruta, `data:${mime};base64,${readFileSync(ruta).toString('base64')}`);
  return cache.get(ruta);
}
const foto = (n) => dataUri(assets(`fotos/${n}.jpg`), 'image/jpeg');
// Logo oficial: si existe assets/logo-navy.(svg|png) o assets/logo-blanco.(svg|png) se usa ese
// archivo; si no, se compone el logotipo con la tipografía de marca.
const MIME = { svg: 'image/svg+xml', png: 'image/png' };
function marca(variante) {
  for (const ext of ['svg', 'png']) {
    const ruta = assets(`logo-${variante}.${ext}`);
    if (existsSync(ruta)) return `<img class="logo" src="${dataUri(ruta, MIME[ext])}" alt="DOMO Baires">`;
  }
  return `<span class="marca marca-${variante}">DOMO <span>BAIRES</span></span>`;
}
const fuente = (paquete, archivo) => dataUri(require.resolve(`${paquete}/files/${archivo}`), 'font/woff2');

const CONTACTO = {
  whatsapp: '+54 9 11 2528-5555',
  whatsappLink: 'https://wa.me/5491125285555',
  email: 'domo.baires@gmail.com',
  instagram: '@domo.baires',
  web: 'www.domobaires.com',
};

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const dinero = (n, moneda) => `${moneda} ${Math.round(n).toLocaleString('es-AR')}`;

const fechaLarga = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

export function renderHTML(c) {
  const m = c.moneda;
  const lugar = [c.proyecto.ubicacion, c.proyecto.provincia].filter(Boolean).join(', ');
  const ok = c.validacion ?? {};
  const coordenadas =
    c.proyecto.lat != null && c.proyecto.lng != null
      ? `${Number(c.proyecto.lat).toFixed(4)}°, ${Number(c.proyecto.lng).toFixed(4)}°`
      : null;
  // Mientras haya contenido sin validar por DOMO Baires, cada página lo dice.
  const aviso = c.pendientes?.length
    ? `<div class="pendiente">Borrador · No enviar a clientes · Pendiente de validación por DOMO Baires: ${c.pendientes.map(esc).join(', ')}</div>`
    : '';
  const ing = c.ingenieria;
  const conLugar = (t = '') => esc(t).replaceAll('{lugar}', esc(lugar));

  const filas = c.items
    .map(
      (i) => `<tr><td>${esc(i.descripcion)}${i.detalle ? `<span class="det">${esc(i.detalle)}</span>` : ''}</td><td class="num">${dinero(i.importe, m)}</td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Propuesta ${esc(c.numero)} · DOMO Baires</title>
<style>
@font-face { font-family: 'Poppins'; font-weight: 300; src: url(${fuente('@fontsource/poppins', 'poppins-latin-300-normal.woff2')}) format('woff2'); }
@font-face { font-family: 'Poppins'; font-weight: 400; src: url(${fuente('@fontsource/poppins', 'poppins-latin-400-normal.woff2')}) format('woff2'); }
@font-face { font-family: 'Poppins'; font-weight: 500; src: url(${fuente('@fontsource/poppins', 'poppins-latin-500-normal.woff2')}) format('woff2'); }
@font-face { font-family: 'Poppins'; font-weight: 600; src: url(${fuente('@fontsource/poppins', 'poppins-latin-600-normal.woff2')}) format('woff2'); }
@font-face { font-family: 'Archivo'; font-weight: 100 900; font-stretch: 62% 125%; src: url(${fuente('@fontsource-variable/archivo', 'archivo-latin-standard-normal.woff2')}) format('woff2'); }

:root { --navy:#100b56; --persian:#2721c3; --green:#01a573; --cool:#a9a6e7; --gun:#141c20; --chrome:#dddddd; }
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; }
body { font-family: 'Poppins', sans-serif; font-weight: 300; color: var(--gun); font-size: 10.5pt; line-height: 1.7; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.pag { width: 210mm; height: 297mm; position: relative; overflow: hidden; page-break-after: always; }
.pag:last-child { page-break-after: auto; }
.titulo { font-family: 'Archivo', sans-serif; font-stretch: 125%; font-weight: 600; text-transform: uppercase; letter-spacing: .1em; line-height: 1.15; }
.eti { font-family: 'Archivo', sans-serif; font-stretch: 125%; font-weight: 500; text-transform: uppercase; letter-spacing: .14em; font-size: 7pt; }
.foto { position: absolute; inset: 0; background-size: cover; background-position: center; }
.pad { padding: 22mm 20mm; }
.cab { display: flex; justify-content: space-between; align-items: center; }
.cab .logo { height: 11mm; }
.marca { font-family: 'Archivo', sans-serif; font-stretch: 125%; font-weight: 700; letter-spacing: .24em; font-size: 12pt; color: var(--navy); white-space: nowrap; }
.marca span { font-weight: 300; }
.marca-blanco { color: #fff; }
.cab .eti { color: var(--cool); }

.pendiente { position: absolute; top: 0; left: 0; right: 0; z-index: 5; background: var(--gun); color: #fff; font-size: 7.5pt; font-weight: 400; letter-spacing: .02em; padding: 2mm 20mm; }
.sin-foto { background: var(--navy); }
.marca-agua { position: absolute; top: 120mm; left: -10mm; right: -10mm; text-align: center; transform: rotate(-30deg); font-family: 'Archivo', sans-serif; font-stretch: 125%; font-weight: 700; font-size: 44pt; letter-spacing: .12em; color: rgba(16,11,86,.08); pointer-events: none; z-index: 4; }
.ejemplo { color: var(--gun); background: var(--chrome); padding: 1mm 3mm; margin-left: 4mm; vertical-align: middle; }

/* Portada */
.portada .velo { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(16,11,86,.55) 0%, rgba(16,11,86,0) 30%, rgba(16,11,86,0) 40%, rgba(16,11,86,.95) 75%); }
.portada .cont { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: space-between; color: #fff; }
.portada .cab .logo { height: 16mm; }
.portada .marca { font-size: 14pt; }
.portada .cab .eti { color: #fff; opacity: .85; }
.portada .eti.verde { color: var(--green); font-size: 8pt; }
.portada h1 { font-size: 28pt; margin: 5mm 0 4mm; }
.portada .sub { font-size: 12pt; font-weight: 300; opacity: .9; }
.portada .pie { display: flex; gap: 14mm; margin-top: 12mm; padding-top: 5mm; border-top: 1px solid rgba(255,255,255,.3); }
.portada .pie div { font-size: 9pt; }
.portada .pie .eti { display: block; color: var(--cool); margin-bottom: 1mm; }

/* Proyecto */
.proyecto h2 { color: var(--navy); font-size: 18pt; margin: 16mm 0 3mm; }
.proyecto .intro { max-width: 140mm; }
.datos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7mm 6mm; margin: 11mm 0 10mm; }
.dato { border-top: 1px solid var(--chrome); padding-top: 3mm; }
.dato .eti { color: #6b6a86; display: block; }
.dato b { display: block; font-family: 'Archivo', sans-serif; font-stretch: 112%; font-weight: 600; color: var(--navy); font-size: 15pt; letter-spacing: .02em; margin-top: 1mm; line-height: 1.25; }
.dato b.chico { font-size: 11pt; }
.proyecto .inferior { position: absolute; left: 0; right: 0; bottom: 0; height: 105mm; display: flex; }
.proyecto .inferior .img { flex: 1.1; background-size: auto 150%; background-position: 45% 55%; }
.proyecto .inferior .incluye { flex: 1; max-width: 50%; margin-left: auto; background: var(--navy); color: #fff; padding: 12mm 12mm; }
.incluye .eti { color: var(--green); display: block; margin-bottom: 4mm; }
.incluye ul { list-style: none; }
.incluye li { font-size: 9.5pt; padding: 1.6mm 0; border-bottom: 1px solid rgba(169,166,231,.25); }

/* Ingeniería */
.ingenieria { background: var(--navy); color: #fff; }
.ingenieria .arriba { position: absolute; top: 0; left: 0; right: 0; height: 118mm; }
.ingenieria .arriba .velo { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(16,11,86,.35), rgba(16,11,86,1)); }
.ingenieria .arriba .pad { position: relative; }
.ingenieria .cuerpo { position: absolute; top: 98mm; left: 20mm; right: 20mm; }
.ingenieria .eti.verde { color: var(--green); }
.ingenieria h2 { font-size: 21pt; margin: 3mm 0 6mm; }
.ingenieria .lead { color: #e9e8fb; max-width: 150mm; font-size: 11pt; }
.ingenieria .coord { color: var(--cool); font-size: 8.5pt; margin-top: 2mm; }
.specs { display: grid; grid-template-columns: 1fr 1fr; gap: 7mm 12mm; margin-top: 11mm; }
.spec b { display: block; font-family: 'Archivo', sans-serif; font-stretch: 112%; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; font-size: 9pt; color: var(--green); margin-bottom: 1mm; }
.spec p { font-size: 9pt; color: #d6d4f5; line-height: 1.6; }
.ingenieria .frase { position: absolute; left: 20mm; right: 20mm; bottom: 18mm; font-size: 11pt; color: var(--cool); border-top: 1px solid rgba(169,166,231,.3); padding-top: 5mm; }

/* Inversión */
.inversion h2 { color: var(--navy); font-size: 18pt; margin: 14mm 0 7mm; }
table { width: 100%; border-collapse: collapse; }
td { padding: 2.6mm 0; border-bottom: 1px solid var(--chrome); vertical-align: top; }
td.num { text-align: right; white-space: nowrap; font-weight: 400; color: var(--navy); }
td .det { display: block; color: #7a7990; font-size: 8.5pt; }
.totales td { border: 0; padding: 1.3mm 0; color: #555; }
.totales tr:first-child td { padding-top: 4mm; }
.total { margin-top: 3mm; background: var(--navy); color: #fff; padding: 6mm 7mm; display: flex; justify-content: space-between; align-items: baseline; }
.total .eti { color: var(--cool); }
.total b { font-family: 'Archivo', sans-serif; font-stretch: 112%; font-weight: 600; font-size: 20pt; letter-spacing: .02em; }
.dos { display: grid; grid-template-columns: 1fr 1fr; gap: 12mm; margin-top: 11mm; }
.dos h3 { color: var(--navy); font-size: 8pt; margin-bottom: 3mm; }
.pagos div, .etapa { display: flex; justify-content: space-between; font-size: 9pt; padding: 1.6mm 0; border-bottom: 1px solid var(--chrome); }
.pagos span:last-child, .etapa span:last-child { color: var(--navy); font-weight: 400; white-space: nowrap; padding-left: 4mm; }
.etapa small { color: var(--green); font-weight: 500; margin-right: 2mm; }
.legal { margin-top: 8mm; font-size: 7.5pt; color: #7a7990; line-height: 1.6; }
.notas { margin-top: 8mm; font-size: 9pt; border-left: 2px solid var(--green); padding-left: 4mm; }

/* Cierre */
.cierre .velo { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(20,28,32,.2) 0%, rgba(16,11,86,.9) 70%); }
.cierre .cont { position: absolute; left: 20mm; right: 20mm; bottom: 24mm; color: #fff; }
.cierre .logo { height: 18mm; margin-bottom: 12mm; }
.cierre .marca { display: block; font-size: 15pt; margin-bottom: 12mm; }
.cierre h2 { font-size: 26pt; margin-bottom: 6mm; }
.cierre .cta { display: inline-block; background: var(--green); color: #fff; text-decoration: none; padding: 3.5mm 7mm; margin: 4mm 0 12mm; }
.cierre .cta .eti { font-size: 8pt; color: #fff; }
.cierre .contactos { display: flex; gap: 10mm; font-size: 9pt; color: #e9e8fb; }
</style>
</head>
<body>

<section class="pag portada${ok.fotos ? '' : ' sin-foto'}">
  ${ok.fotos ? `<div class="foto" style="background-image:url(${foto('portada')})"></div><div class="velo"></div>` : ''}
  ${aviso}
  <div class="cont pad">
    <div class="cab">${marca('blanco')}<span class="eti">Propuesta comercial</span></div>
    <div>
      <span class="eti verde">Propuesta para</span>
      <h1 class="titulo">${esc(c.cliente.empresa || c.cliente.nombre)}</h1>
      <p class="sub">Domo ${c.domo.diametro ?? ''} m · ${esc(c.modelo.nombre)} · ${esc(lugar)}</p>
      <div class="pie">
        <div><span class="eti">N.º</span>${esc(c.numero)}</div>
        <div><span class="eti">Fecha</span>${fechaLarga(c.fecha)}</div>
        ${ok.validez ? `<div><span class="eti">Válida hasta</span>${fechaLarga(c.validaHasta)}</div>` : ''}
      </div>
    </div>
  </div>
</section>

<section class="pag proyecto">
  ${aviso}
  <div class="pad">
    <div class="cab">${marca('navy')}<span class="eti">${esc(c.numero)}</span></div>
    <h2 class="titulo">El proyecto</h2>
    ${ok.descripcionesModelos && c.modelo.descripcion ? `<p class="intro">${esc(c.modelo.descripcion)}</p>` : ''}
    <div class="datos">
      <div class="dato"><span class="eti">Modelo</span><b class="chico">${esc(c.modelo.nombre)}</b></div>
      <div class="dato"><span class="eti">Diámetro</span><b>${c.domo.diametro} m</b></div>
      <div class="dato"><span class="eti">Superficie</span><b>${c.domo.superficie != null ? `${c.domo.superficie.toLocaleString('es-AR', { maximumFractionDigits: 1 })} m²` : '—'}</b></div>
      ${ok.alturas && c.domo.altura != null ? `<div class="dato"><span class="eti">Altura</span><b>${c.domo.altura.toLocaleString('es-AR')} m</b></div>` : ''}
      <div class="dato"><span class="eti">Uso</span><b class="chico">${esc(c.proyecto.uso || 'A definir')}</b></div>
      <div class="dato"><span class="eti">Ubicación</span><b class="chico">${esc(lugar)}</b></div>
      ${coordenadas ? `<div class="dato"><span class="eti">Coordenadas</span><b class="chico">${coordenadas}</b></div>` : ''}
      <div class="dato"><span class="eti">Plazo estimado</span><b class="chico">${ok.plazos && c.plazoSemanas ? `${c.plazoSemanas} semanas` : 'A definir'}</b></div>
    </div>
  </div>
  ${ok.fotos || (ok.descripcionesModelos && c.modelo.incluye?.length) ? `<div class="inferior">
    ${ok.fotos ? `<div class="img" style="background-image:url(${foto('proyecto')})"></div>` : ''}
    ${ok.descripcionesModelos && c.modelo.incluye?.length ? `<div class="incluye">
      <span class="eti">Modelo ${esc(c.modelo.nombre)} incluye</span>
      <ul>${c.modelo.incluye.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
    </div>` : ''}
  </div>` : ''}
</section>

${ok.ingenieria && ing ? `<section class="pag ingenieria">
  ${aviso}
  <div class="arriba">
    ${ok.fotos ? `<div class="foto" style="background-image:url(${foto('ingenieria')})"></div><div class="velo"></div>` : ''}
    <div class="pad"><div class="cab">${marca('blanco')}<span class="eti">${esc(ing.etiqueta ?? '')}</span></div></div>
  </div>
  <div class="cuerpo">
    <h2 class="titulo">${conLugar(ing.titulo)}</h2>
    ${ing.texto ? `<p class="lead">${conLugar(ing.texto)}</p>` : ''}
    <div class="specs">${(ing.puntos ?? []).map((p) => `<div class="spec"><b>${esc(p.titulo)}</b><p>${esc(p.texto)}</p></div>`).join('')}</div>
  </div>
  ${ing.frase ? `<p class="frase">${esc(ing.frase)}</p>` : ''}
</section>` : ''}

<section class="pag inversion">
  ${aviso}
  ${ok.catalogo ? '' : '<div class="marca-agua">PRECIOS DE EJEMPLO</div>'}
  <div class="pad">
    <div class="cab">${marca('navy')}<span class="eti">${esc(c.numero)}</span></div>
    <h2 class="titulo">Inversión${ok.catalogo ? '' : '<span class="eti ejemplo">Modelos y precios de ejemplo, no válidos</span>'}</h2>
    <table>${filas}</table>
    <table class="totales">
      <tr><td>Subtotal</td><td class="num">${dinero(c.subtotal, m)}</td></tr>
      ${c.descuento.monto ? `<tr><td>Descuento ${c.descuento.porcentaje}%</td><td class="num">− ${dinero(c.descuento.monto, m)}</td></tr>` : ''}
      ${c.iva.incluido ? '' : `<tr><td>IVA ${c.iva.porcentaje}%</td><td class="num">${dinero(c.iva.monto, m)}</td></tr>`}
    </table>
    <div class="total"><span class="eti">Total${c.iva.incluido ? ' (IVA incluido)' : ''}</span><b>${dinero(c.total, m)}</b></div>

    ${ok.condicionesPago && c.condicionesPago.length ? `<div class="dos">
      <div>
        <h3 class="eti">Forma de pago</h3>
        <div class="pagos">${c.condicionesPago.map((p) => `<div><span>${p.porcentaje}% · ${esc(p.etapa)}</span><span>${dinero(p.monto, m)}</span></div>`).join('')}</div>
      </div>
    </div>` : ''}
    ${c.notas ? `<p class="notas">${esc(c.notas)}</p>` : ''}
    <p class="legal">${ok.validez ? `Propuesta válida hasta el ${fechaLarga(c.validaHasta)}. ` : ''}Importes expresados en ${m}.</p>
  </div>
</section>

<section class="pag cierre${ok.fotos ? '' : ' sin-foto'}">
  ${ok.fotos ? `<div class="foto" style="background-image:url(${foto('cierre')}); background-size: auto 165%; background-position: 50% 70%"></div><div class="velo"></div>` : ''}
  ${aviso}
  <div class="cont">
    ${marca('blanco')}
    <h2 class="titulo">Conocé el futuro.</h2>
    <a class="cta" href="${CONTACTO.whatsappLink}"><span class="eti">Escribinos por WhatsApp · ${CONTACTO.whatsapp}</span></a>
    <div class="contactos"><span>${CONTACTO.email}</span><span>${CONTACTO.instagram}</span><span>${CONTACTO.web}</span></div>
  </div>
</section>

</body>
</html>`;
}
