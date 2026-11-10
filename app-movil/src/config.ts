/**
 * Configuración de la app.
 * EXPO_PUBLIC_API_URL es el dominio del backend (el mismo que usa la web), por ejemplo
 *   https://educar-para-transformar-opal.vercel.app     (producción, HTTPS)
 *   http://192.168.0.10:3000                       (desarrollo: IP de la PC que corre `node API_Server.js`)
 * Se define en app-movil/.env (ver .env.example).
 */
const ORIGEN = (process.env.EXPO_PUBLIC_API_URL || 'https://educar-para-transformar-opal.vercel.app').replace(/\/+$/, '');

export const config = {
  /** Dominio del sitio (sirve también las imágenes /img/...) */
  origen: ORIGEN,
  /** API versionada compartida con la web (RNFM-08) */
  apiUrl: `${ORIGEN}/api/v1`,
  /** Tiempo máximo de espera de cada petición */
  timeoutMs: 15000,
  /** Datos bancarios para pagar por transferencia */
  banco: { cbu: '0000003100012345678901', alias: 'EDUCAR.TRANSFORMAR.CUOTAS', titular: 'Centro Educativo Educar para Transformar' },
  contacto: { telefono: '+54 362 400-0000', whatsapp: '543624781240', email: 'info@educarparatransformar.edu.ar' }
};

/** Convierte rutas del sitio ("../img/x.jpg" o "/img/x.jpg") en URL absolutas */
export function urlRecurso(ruta?: string | null): string | undefined {
  if (!ruta) return undefined;
  if (/^https?:\/\//.test(ruta)) return ruta;
  return `${config.origen}/${ruta.replace(/^(\.\.\/|\/)+/, '')}`;
}
