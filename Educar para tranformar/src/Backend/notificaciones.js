/**
 * notificaciones.js - Bandeja de notificaciones + envío push (RFM-10).
 *
 * Cada aviso se guarda en la tabla `notificaciones` (la app lo muestra aunque el push falle)
 * y se envía por push a los dispositivos registrados del usuario mediante el servicio de
 * Expo (que reenvía a FCM en Android y APNs en iOS).
 *
 * Ley 25.326: los textos NUNCA incluyen nombres ni datos del menor; solo indican
 * que hay una novedad y que se abra la app para ver el detalle.
 */
const db = require('./db');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Avisa a una lista de usuarios. No lanza errores: una falla de push no corta la operación. */
async function notificar(idsUsuarios, { titulo, cuerpo, tipo = 'GENERAL', datos = null }) {
  const ids = [...new Set((idsUsuarios || []).filter(Boolean))];
  if (ids.length === 0) return;
  try {
    await db.query(`
      INSERT INTO notificaciones (id_usuario, titulo, cuerpo, tipo, datos)
      SELECT u, $2, $3, $4, $5 FROM UNNEST($1::int[]) AS u`,
      [ids, titulo, cuerpo, tipo, datos ? JSON.stringify(datos) : null]);

    const disp = await db.query('SELECT token_push FROM dispositivos WHERE id_usuario = ANY($1::int[])', [ids]);
    await enviarPush(disp.rows.map(d => d.token_push), { titulo, cuerpo, datos: { ...(datos || {}), tipo } });
  } catch (e) {
    console.error('[Notificaciones] Error:', e.message);
  }
}

/** Avisa a todos los usuarios de la app (padres, estudiantes y docentes). */
async function notificarATodos(aviso) {
  const r = await db.query("SELECT id_usuario FROM usuarios WHERE rol IN ('PADRE','ESTUDIANTE','DOCENTE') AND estado = 'ACTIVO'");
  await notificar(r.rows.map(x => x.id_usuario), aviso);
}

async function enviarPush(tokens, { titulo, cuerpo, datos }) {
  const validos = tokens.filter(t => /^Expo(nent)?PushToken\[.+\]$/.test(t));
  if (validos.length === 0) return;

  const mensajes = validos.map(to => ({ to, title: titulo, body: cuerpo, data: datos, sound: 'default', priority: 'high' }));
  // Expo acepta hasta 100 mensajes por pedido. Timeout corto para no demorar la respuesta de la API.
  for (let i = 0; i < mensajes.length; i += 100) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      const resp = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(mensajes.slice(i, i + 100)),
        signal: ctrl.signal
      });
      const json = await resp.json().catch(() => ({}));
      // Si Expo informa que el dispositivo ya no existe, se borra el token
      (json.data || []).forEach((r, j) => {
        if (r.status === 'error' && r.details?.error === 'DeviceNotRegistered') {
          db.query('DELETE FROM dispositivos WHERE token_push = $1', [mensajes[i + j].to]).catch(() => {});
        }
      });
    } catch (e) {
      console.warn('[Push] No se pudo enviar:', e.message);
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { notificar, notificarATodos };
