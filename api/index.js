/**
 * Punto de entrada de la API en Vercel (función serverless).
 *
 * Vercel trata cada archivo de /api como una función. vercel.json reenvía
 * todas las rutas /api/* a esta función, que delega en la app Express real.
 * Express recibe la URL original (/api/alumnos, /api/auth/login, etc.).
 */
module.exports = require('../Educar para tranformar/src/Backend/API_Server.js');
