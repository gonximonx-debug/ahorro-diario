// Dirección del archivo de datos que se regenera cada día.
// Cuando el repositorio esté en GitHub, cambia TU_USUARIO por tu usuario.
export const DATOS_URL =
  process.env.EXPO_PUBLIC_DATOS_URL ??
  "https://raw.githubusercontent.com/TU_USUARIO/ahorro-diario/main/datos/hoy.json";
