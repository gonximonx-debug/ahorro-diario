// Convierte la exportación web de Expo (movil/dist) en una app instalable:
// añade manifiesto, icono y etiquetas para "Añadir a pantalla de inicio" en
// iPhone (Safari) y Android (Chrome).
// Uso: node scripts/pwa.mjs <carpeta dist> <baseUrl, p. ej. /ahorro-diario>
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [dist, base = ""] = process.argv.slice(2);
const assets = join(dirname(fileURLToPath(import.meta.url)), "..", "movil", "assets");

await copyFile(join(assets, "icon.png"), join(dist, "icono.png"));

const manifiesto = {
  name: "Ahorro Diario",
  short_name: "Ahorro",
  description: "Gasolineras más baratas y ofertas de supermercado, actualizadas cada día.",
  start_url: `${base}/`,
  scope: `${base}/`,
  display: "standalone",
  background_color: "#F6F7F9",
  theme_color: "#F6F7F9",
  lang: "es",
  icons: [{ src: `${base}/icono.png`, sizes: "1024x1024", type: "image/png", purpose: "any" }],
};
await writeFile(join(dist, "manifest.json"), JSON.stringify(manifiesto, null, 2));

const etiquetas = `
    <link rel="manifest" href="${base}/manifest.json" />
    <link rel="apple-touch-icon" href="${base}/icono.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="Ahorro" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="theme-color" content="#F6F7F9" />
  </head>`;

const rutaHtml = join(dist, "index.html");
let html = await readFile(rutaHtml, "utf8");
html = html
  .replace(/<html lang="[^"]*"/, '<html lang="es"')
  .replace(/<meta name="viewport" content="[^"]*"/, '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"')
  .replace("</head>", etiquetas);
await writeFile(rutaHtml, html);
console.log("PWA lista en", dist);
