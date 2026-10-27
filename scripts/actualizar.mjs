// Genera los datos diarios de la app: precios de carburantes (API oficial del
// Ministerio) y bajadas de precio de Mercadona. Escribe en ../datos/.
// Uso: node scripts/actualizar.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATOS = join(RAIZ, "datos");
const DIAS_HISTORICO = 90;
const TOP_NACIONAL = 25;
const TOP_PROVINCIA = 10;

const COMBUSTIBLES = {
  g95: { nombre: "Gasolina 95", campo: "Precio Gasolina 95 E5" },
  diesel: { nombre: "Diésel", campo: "Precio Gasoleo A" },
  g98: { nombre: "Gasolina 98", campo: "Precio Gasolina 98 E5" },
  glp: { nombre: "GLP (autogás)", campo: "Precio Gases licuados del petróleo" },
};

const hoy = () => new Date().toISOString().slice(0, 10);
const num = (s) => (s ? Number(String(s).replace(",", ".")) : null);
const redondear = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function leerJson(ruta, porDefecto) {
  try {
    return JSON.parse(await readFile(ruta, "utf8"));
  } catch {
    return porDefecto;
  }
}

async function getJson(url, intentos = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return await r.json();
    } catch (e) {
      if (i >= intentos) throw e;
      await esperar(2000 * i);
    }
  }
}

// ---------- Carburantes ----------

async function carburantes() {
  const url =
    "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/";
  const { Fecha, ListaEESSPrecio } = await getJson(url);

  // "P" = venta al público; "R" = restringida a socios/flotas.
  const estaciones = ListaEESSPrecio.filter((e) => e["Tipo Venta"] === "P").map((e) => ({
    id: e.IDEESS,
    marca: e["Rótulo"].trim(),
    direccion: e["Dirección"].trim(),
    localidad: e.Localidad.trim(),
    provincia: e.Provincia.trim(),
    cp: e["C.P."],
    lat: num(e.Latitud),
    lon: num(e["Longitud (WGS84)"]),
    horario: e.Horario,
    precios: Object.fromEntries(
      Object.entries(COMBUSTIBLES).map(([k, c]) => [k, num(e[c.campo])])
    ),
  }));

  const resumen = (lista, clave, top) => {
    const con = lista.filter((e) => e.precios[clave] > 0).sort((a, b) => a.precios[clave] - b.precios[clave]);
    if (!con.length) return null;
    const media = con.reduce((s, e) => s + e.precios[clave], 0) / con.length;
    return {
      media: redondear(media),
      minimo: con[0].precios[clave],
      estaciones: con.length,
      masBaratas: con.slice(0, top).map(({ precios, ...e }) => ({ ...e, precio: precios[clave] })),
    };
  };

  // Canarias, Ceuta y Melilla tienen otra fiscalidad y copan siempre el top.
  const FUERA_PENINSULA = ["PALMAS (LAS)", "SANTA CRUZ DE TENERIFE", "CEUTA", "MELILLA"];
  const peninsulares = estaciones.filter((e) => !FUERA_PENINSULA.includes(e.provincia));

  const nacional = {};
  const peninsula = {};
  for (const k of Object.keys(COMBUSTIBLES)) {
    nacional[k] = resumen(estaciones, k, TOP_NACIONAL);
    peninsula[k] = resumen(peninsulares, k, TOP_NACIONAL);
  }

  const provincias = {};
  for (const p of [...new Set(estaciones.map((e) => e.provincia))].sort()) {
    const deLaProvincia = estaciones.filter((e) => e.provincia === p);
    provincias[p] = {};
    for (const k of Object.keys(COMBUSTIBLES)) provincias[p][k] = resumen(deLaProvincia, k, TOP_PROVINCIA);
  }

  return {
    fechaFuente: Fecha,
    combustibles: Object.fromEntries(Object.entries(COMBUSTIBLES).map(([k, c]) => [k, c.nombre])),
    nacional,
    peninsula,
    provincias,
  };
}

// ---------- Mercadona ----------

async function mercadona() {
  const base = "https://tienda.mercadona.es/api/categories/";
  const { results } = await getJson(`${base}?lang=es`);
  const subIds = results.flatMap((c) => c.categories.map((s) => ({ id: s.id, categoria: c.name })));

  const productos = [];
  for (const { id, categoria } of subIds) {
    const sub = await getJson(`${base}${id}/?lang=es`);
    for (const grupo of sub.categories ?? []) {
      for (const p of grupo.products ?? []) {
        const pi = p.price_instructions;
        productos.push({
          id: p.id,
          nombre: p.display_name,
          categoria,
          formato: p.packaging ?? "",
          imagen: p.thumbnail,
          url: p.share_url,
          precio: num(pi.unit_price),
          precioAnterior: num(pi.previous_unit_price),
          bajada: Boolean(pi.price_decreased),
          precioRef: num(pi.reference_price),
          unidadRef: pi.reference_format,
        });
      }
    }
    await esperar(150);
  }

  // Comparamos con los precios de la ejecución anterior para detectar bajadas
  // que Mercadona no marca.
  const rutaPrecios = join(DATOS, "mercadona-precios.json");
  const previos = await leerJson(rutaPrecios, {});
  const ofertas = [];
  for (const p of productos) {
    const antes = p.precioAnterior ?? previos[p.id];
    if (antes && p.precio && p.precio < antes) {
      ofertas.push({ ...p, precioAnterior: antes, descuento: Math.round((1 - p.precio / antes) * 100) });
    }
  }
  ofertas.sort((a, b) => b.descuento - a.descuento);
  await writeFile(rutaPrecios, JSON.stringify(Object.fromEntries(productos.map((p) => [p.id, p.precio]))));

  return { productosRevisados: productos.length, ofertas };
}

// ---------- Principal ----------

async function main() {
  await mkdir(DATOS, { recursive: true });
  const fecha = hoy();

  const [gas, merca] = await Promise.allSettled([carburantes(), mercadona()]);
  if (gas.status === "rejected") console.error("Carburantes falló:", gas.reason);
  if (merca.status === "rejected") console.error("Mercadona falló:", merca.reason);

  // Las ofertas de folletos (Carrefour, Lidl, Aldi, Dia...) las añade Claude
  // a datos/folletos.json; aquí solo se incluyen tal cual.
  const folletos = await leerJson(join(DATOS, "folletos.json"), { actualizado: null, ofertas: [] });

  const previo = await leerJson(join(DATOS, "hoy.json"), {});
  const datos = {
    actualizado: new Date().toISOString(),
    carburantes: gas.status === "fulfilled" ? gas.value : previo.carburantes ?? null,
    mercadona: merca.status === "fulfilled" ? merca.value : previo.mercadona ?? null,
    folletos,
  };
  await writeFile(join(DATOS, "hoy.json"), JSON.stringify(datos));

  if (datos.carburantes) {
    const rutaHist = join(DATOS, "historico.json");
    const hist = (await leerJson(rutaHist, [])).filter((d) => d.fecha !== fecha);
    hist.push({
      fecha,
      ...Object.fromEntries(Object.entries(datos.carburantes.nacional).map(([k, v]) => [k, v?.media ?? null])),
    });
    await writeFile(rutaHist, JSON.stringify(hist.slice(-DIAS_HISTORICO)));
  }

  console.log(
    `OK ${fecha}: carburantes=${gas.status}, mercadona=${merca.status}` +
      (datos.mercadona ? ` (${datos.mercadona.ofertas.length} bajadas)` : "") +
      `, folletos=${folletos.ofertas.length}`
  );
  if (gas.status === "rejected" && merca.status === "rejected") process.exit(1);
}

main();
