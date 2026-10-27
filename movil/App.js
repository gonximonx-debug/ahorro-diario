import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DATOS_URL } from "./config";

const C = {
  fondo: "#F6F7F9",
  tarjeta: "#FFFFFF",
  texto: "#14171F",
  suave: "#667085",
  borde: "#E4E7EC",
  verde: "#0E9F6E",
  verdeClaro: "#E7F6F0",
  acento: "#1F6FEB",
};

const euros = (n, d = 2) =>
  n == null ? "—" : n.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d }) + " €";
const fechaLarga = (iso) =>
  iso
    ? new Date(iso).toLocaleString("es-ES", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
    : "";
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

function useDatos() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch(DATOS_URL, { cache: "no-store" });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      const json = await r.json();
      setDatos(json);
      AsyncStorage.setItem("datos", JSON.stringify(json)).catch(() => {});
    } catch (e) {
      setError("No se pudieron descargar los datos de hoy. Mostrando los últimos guardados.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    AsyncStorage.getItem("datos")
      .then((s) => s && setDatos((actual) => actual ?? JSON.parse(s)))
      .catch(() => {});
    cargar();
  }, [cargar]);

  return { datos, cargando, error, cargar };
}

function Chips({ opciones, valor, onCambio }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
      {opciones.map(([k, nombre]) => (
        <Pressable key={k} onPress={() => onCambio(k)} style={[s.chip, valor === k && s.chipActivo]}>
          <Text style={[s.chipTexto, valor === k && s.chipTextoActivo]}>{nombre}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

// ---------- Gasolina ----------

function Gasolina({ datos, refresco }) {
  const carb = datos.carburantes;
  const [comb, setComb] = useState("g95");
  const [zona, setZona] = useState("peninsula");
  const [elegirProv, setElegirProv] = useState(false);

  if (!carb) return <Vacio texto="Hoy no hay datos de carburantes." />;
  const provincias = Object.keys(carb.provincias).sort((a, b) => a.localeCompare(b, "es"));
  const resumen =
    zona === "peninsula" ? carb.peninsula?.[comb] : zona === "espana" ? carb.nacional[comb] : carb.provincias[zona]?.[comb];
  const nombreZona = zona === "peninsula" ? "Península y Baleares" : zona === "espana" ? "Toda España" : capital(zona);

  const abrirMapa = (e) =>
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lon}`);

  // El selector de provincia va fuera de la lista: dentro de su pie no tenía
  // altura propia y no se podía desplazar.
  return (
    <View style={{ flex: 1 }}>
    <FlatList
      data={resumen?.masBaratas ?? []}
      keyExtractor={(e) => e.id}
      refreshControl={refresco}
      contentContainerStyle={s.lista}
      ListHeaderComponent={
        <>
          <Chips opciones={Object.entries(carb.combustibles)} valor={comb} onCambio={setComb} />
          <Chips
            opciones={[
              ["peninsula", "Península"],
              ["espana", "Toda España"],
              ...(provincias.includes(zona) ? [[zona, capital(zona)]] : []),
              ["__elegir", "Elegir provincia…"],
            ]}
            valor={zona}
            onCambio={(k) => (k === "__elegir" ? setElegirProv(true) : setZona(k))}
          />
          {resumen && (
            <View style={s.resumen}>
              <View style={{ flex: 1 }}>
                <Text style={s.resumenEtiqueta}>Precio medio · {nombreZona}</Text>
                <Text style={s.resumenValor}>{euros(resumen.media, 3)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.resumenEtiqueta}>Más barato</Text>
                <Text style={[s.resumenValor, { color: C.verde }]}>{euros(resumen.minimo, 3)}</Text>
              </View>
            </View>
          )}
          <Text style={s.seccion}>Gasolineras más baratas</Text>
        </>
      }
      ListEmptyComponent={<Vacio texto="No hay gasolineras con este combustible en la zona." />}
      renderItem={({ item: e, index }) => (
        <Pressable style={s.tarjeta} onPress={() => abrirMapa(e)}>
          <Text style={s.puesto}>{index + 1}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.titulo} numberOfLines={1}>{e.marca}</Text>
            <Text style={s.sub} numberOfLines={1}>{e.direccion}</Text>
            <Text style={s.sub} numberOfLines={1}>
              {capital(e.localidad)} · {capital(e.provincia)} · {e.horario}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.precio}>{euros(e.precio, 3)}</Text>
            {resumen && (
              <Text style={s.ahorro}>−{euros((resumen.media - e.precio) * 50)} / 50 L</Text>
            )}
          </View>
        </Pressable>
      )}
      ListFooterComponent={
        <Text style={s.pie}>Fuente: Ministerio para la Transición Ecológica · {carb.fechaFuente}</Text>
      }
    />
    <Modal visible={elegirProv} animationType="slide" onRequestClose={() => setElegirProv(false)}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.fondo }}>
          <View style={s.modalCabecera}>
            <Text style={s.seccion}>Elige provincia</Text>
            <Pressable onPress={() => setElegirProv(false)}>
              <Text style={s.enlace}>Cerrar</Text>
            </Pressable>
          </View>
          <FlatList
            style={{ flex: 1 }}
            data={provincias}
            keyExtractor={(p) => p}
            renderItem={({ item: p }) => (
              <Pressable
                style={s.filaProv}
                onPress={() => {
                  setZona(p);
                  setElegirProv(false);
                }}
              >
                <Text style={s.titulo}>{capital(p)}</Text>
                <Text style={s.sub}>{euros(carb.provincias[p][comb]?.minimo, 3)}</Text>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
    </View>
  );
}

// ---------- Mercadona ----------

function Mercadona({ datos, refresco }) {
  const merca = datos.mercadona;
  const [busqueda, setBusqueda] = useState("");
  const [cat, setCat] = useState("todas");

  const categorias = useMemo(
    () => (merca ? [...new Set(merca.ofertas.map((o) => o.categoria))].sort() : []),
    [merca]
  );
  const lista = useMemo(() => {
    if (!merca) return [];
    const q = busqueda.trim().toLowerCase();
    return merca.ofertas.filter(
      (o) => (cat === "todas" || o.categoria === cat) && (!q || o.nombre.toLowerCase().includes(q))
    );
  }, [merca, busqueda, cat]);

  if (!merca) return <Vacio texto="Hoy no hay datos de Mercadona." />;

  return (
    <FlatList
      data={lista}
      keyExtractor={(o) => o.id}
      refreshControl={refresco}
      contentContainerStyle={s.lista}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <>
          <TextInput
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Buscar producto…"
            placeholderTextColor={C.suave}
            style={s.buscador}
          />
          <Chips opciones={[["todas", "Todas"], ...categorias.map((c) => [c, c])]} valor={cat} onCambio={setCat} />
          <Text style={s.seccion}>
            {lista.length} bajadas de precio · {merca.productosRevisados.toLocaleString("es-ES")} productos revisados
          </Text>
        </>
      }
      ListEmptyComponent={<Vacio texto="No hay bajadas que coincidan." />}
      ListFooterComponent={<AvisoNoAfiliada />}
      renderItem={({ item: o }) => (
        <Pressable style={s.tarjeta} onPress={() => o.url && Linking.openURL(o.url)}>
          {o.imagen ? <Image source={{ uri: o.imagen }} style={s.imagen} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={s.titulo} numberOfLines={2}>{o.nombre}</Text>
            <Text style={s.sub}>
              {o.formato}
              {o.precioRef ? ` · ${euros(o.precioRef)}/${o.unidadRef}` : ""}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.precio}>{euros(o.precio)}</Text>
            <Text style={s.tachado}>{euros(o.precioAnterior)}</Text>
            <Text style={s.badge}>−{o.descuento}%</Text>
          </View>
        </Pressable>
      )}
    />
  );
}

// ---------- Folletos ----------

function Folletos({ datos, refresco }) {
  const fol = datos.folletos ?? { ofertas: [] };
  const [super_, setSuper] = useState("todos");
  const supers = [...new Set(fol.ofertas.map((o) => o.supermercado))].sort();
  const lista = fol.ofertas.filter((o) => super_ === "todos" || o.supermercado === super_);

  return (
    <FlatList
      data={lista}
      keyExtractor={(o, i) => `${o.supermercado}-${i}`}
      refreshControl={refresco}
      contentContainerStyle={s.lista}
      ListHeaderComponent={
        <>
          <Chips opciones={[["todos", "Todos"], ...supers.map((x) => [x, x])]} valor={super_} onCambio={setSuper} />
          <Text style={s.seccion}>
            Ofertas de folletos{fol.actualizado ? ` · revisado ${fechaLarga(fol.actualizado)}` : ""}
          </Text>
        </>
      }
      ListEmptyComponent={<Vacio texto="Todavía no hay ofertas de folletos para hoy." />}
      ListFooterComponent={<AvisoNoAfiliada />}
      renderItem={({ item: o }) => (
        <Pressable style={s.tarjeta} onPress={() => o.url && Linking.openURL(o.url)}>
          <View style={{ flex: 1 }}>
            <Text style={s.marcaSuper}>{o.supermercado}</Text>
            <Text style={s.titulo} numberOfLines={2}>{o.producto}</Text>
            {o.detalle ? <Text style={s.sub}>{o.detalle}</Text> : null}
            {o.vigencia ? <Text style={s.sub}>Válido: {o.vigencia}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            {o.precio != null && <Text style={s.precio}>{euros(o.precio)}</Text>}
            {o.precioAnterior != null && <Text style={s.tachado}>{euros(o.precioAnterior)}</Text>}
            {o.oferta ? <Text style={s.badge}>{o.oferta}</Text> : null}
          </View>
        </Pressable>
      )}
    />
  );
}

function AvisoNoAfiliada() {
  return (
    <Text style={s.pie}>
      Ahorro Diario no está afiliada a ninguna de las cadenas mostradas. Precios orientativos: confírmalos en tienda.
    </Text>
  );
}

function Vacio({ texto }) {
  return <Text style={[s.sub, { textAlign: "center", padding: 32 }]}>{texto}</Text>;
}

// ---------- App ----------

const PESTANAS = [
  ["gasolina", "⛽ Gasolina"],
  ["mercadona", "🛒 Mercadona"],
  ["folletos", "🏷️ Folletos"],
];

export default function App() {
  const { datos, cargando, error, cargar } = useDatos();
  const [pestana, setPestana] = useState("gasolina");
  const refresco = <RefreshControl refreshing={cargando && !!datos} onRefresh={cargar} />;

  let contenido;
  if (!datos) {
    contenido = cargando ? (
      <ActivityIndicator style={{ marginTop: 48 }} size="large" color={C.acento} />
    ) : (
      <View style={{ padding: 24, alignItems: "center" }}>
        <Text style={s.sub}>{error}</Text>
        <Pressable onPress={cargar} style={[s.chip, s.chipActivo, { marginTop: 16 }]}>
          <Text style={s.chipTextoActivo}>Reintentar</Text>
        </Pressable>
      </View>
    );
  } else {
    const Pantalla = { gasolina: Gasolina, mercadona: Mercadona, folletos: Folletos }[pestana];
    contenido = <Pantalla datos={datos} refresco={refresco} />;
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.raiz} edges={["top", "left", "right"]}>
        <StatusBar style="dark" />
        <View style={s.cabecera}>
          <Text style={s.marca}>Ahorro Diario</Text>
          {datos && <Text style={s.sub}>Actualizado {fechaLarga(datos.actualizado)}</Text>}
          {error && datos && <Text style={[s.sub, { color: "#B42318" }]}>{error}</Text>}
        </View>
        <View style={{ flex: 1 }}>{contenido}</View>
      </SafeAreaView>
      <SafeAreaView edges={["bottom"]} style={s.barra}>
        {PESTANAS.map(([k, nombre]) => (
          <Pressable key={k} style={s.tab} onPress={() => setPestana(k)}>
            <Text style={[s.tabTexto, pestana === k && s.tabActivo]}>{nombre}</Text>
          </Pressable>
        ))}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: C.fondo },
  cabecera: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  marca: { fontSize: 26, fontWeight: "800", color: C.texto },
  lista: { paddingHorizontal: 16, paddingBottom: 24 },
  chips: { gap: 8, paddingVertical: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: C.tarjeta, borderWidth: 1, borderColor: C.borde },
  chipActivo: { backgroundColor: C.texto, borderColor: C.texto },
  chipTexto: { color: C.texto, fontWeight: "600" },
  chipTextoActivo: { color: "#fff", fontWeight: "600" },
  resumen: { flexDirection: "row", gap: 12, backgroundColor: C.tarjeta, borderRadius: 16, padding: 16, marginTop: 8, borderWidth: 1, borderColor: C.borde },
  resumenEtiqueta: { color: C.suave, fontSize: 12 },
  resumenValor: { fontSize: 24, fontWeight: "800", color: C.texto, marginTop: 2 },
  seccion: { fontSize: 13, fontWeight: "700", color: C.suave, textTransform: "uppercase", marginTop: 16, marginBottom: 8, letterSpacing: 0.5 },
  tarjeta: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.tarjeta, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.borde },
  puesto: { width: 22, textAlign: "center", fontWeight: "800", color: C.suave },
  titulo: { fontSize: 15, fontWeight: "700", color: C.texto },
  sub: { fontSize: 12, color: C.suave, marginTop: 2 },
  precio: { fontSize: 18, fontWeight: "800", color: C.verde },
  ahorro: { fontSize: 11, color: C.verde, marginTop: 2 },
  tachado: { fontSize: 12, color: C.suave, textDecorationLine: "line-through" },
  badge: { marginTop: 4, fontSize: 12, fontWeight: "800", color: C.verde, backgroundColor: C.verdeClaro, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: "hidden" },
  imagen: { width: 56, height: 56, borderRadius: 10, backgroundColor: C.fondo },
  marcaSuper: { fontSize: 11, fontWeight: "800", color: C.acento, textTransform: "uppercase" },
  buscador: { backgroundColor: C.tarjeta, borderWidth: 1, borderColor: C.borde, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginTop: 4, color: C.texto },
  pie: { fontSize: 11, color: C.suave, textAlign: "center", marginTop: 16 },
  barra: { flexDirection: "row", backgroundColor: C.tarjeta, borderTopWidth: 1, borderTopColor: C.borde },
  tab: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabTexto: { fontSize: 13, fontWeight: "600", color: C.suave },
  tabActivo: { color: C.texto, fontWeight: "800" },
  modalCabecera: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16 },
  filaProv: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.borde },
  enlace: { color: C.acento, fontWeight: "700" },
});
