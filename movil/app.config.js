// La versión web se publica en GitHub Pages bajo /ahorro-diario, así que el
// workflow pasa EXPO_BASE_URL al exportar. En local se queda en la raíz.
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...config.experiments, baseUrl: process.env.EXPO_BASE_URL ?? "" },
});
