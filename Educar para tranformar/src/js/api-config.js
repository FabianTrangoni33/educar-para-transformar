/**
 * api-config.js - URL base de la API, única para todo el frontend.
 *
 * - En desarrollo (localhost, 127.0.0.1 o abriendo el HTML directo con file://)
 *   apunta al backend Express local en el puerto 3000.
 * - En producción (Vercel) usa la ruta relativa /api del mismo dominio.
 *
 * Se carga como script clásico en el <head> de cada página, antes que el resto,
 * así queda disponible como `API_BASE` (o `window.API_BASE`) en scripts y módulos.
 */
(function () {
  var host = window.location.hostname;
  var esLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
  window.API_BASE = esLocal ? 'http://localhost:3000/api' : '/api';
})();
