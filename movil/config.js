// Dirección del archivo de datos que se regenera cada día.
export const DATOS_URL =
  process.env.EXPO_PUBLIC_DATOS_URL ??
  "https://raw.githubusercontent.com/gonximonx-debug/ahorro-diario/main/datos/hoy.json";
