/**
 * modulo-qr.js - Funcionalidad de valor agregado (TP1, punto 5 "Desafío"):
 *
 * 1) Inicio de sesión con QR entre la web y la app (en ambos sentidos):
 *    - Web → App autoriza: la web muestra un QR, la app (ya logueada) lo escanea y aprueba; la web queda logueada.
 *    - Web logueada → App: la web genera un QR de un solo uso; la app lo escanea desde "Ingresar con QR" y queda logueada.
 *
 * 2) Credencial digital del alumno con QR:
 *    - El QR está firmado (HMAC) y no se puede falsificar.
 *    - Portería / transporte (docente o administración) lo escanea para registrar ingreso/egreso o subida/bajada del micro.
 *    - Cada movimiento notifica automáticamente a la familia (sin incluir el nombre del menor, Ley 25.326).
 *    - Alimenta el reporte de asistencia diaria por curso.
 */
const crypto = require('crypto');
const QRCode = require('qrcode');
const db = require('./db');
const reglas = require('./reglas-negocio');
const { ErrorNegocio } = reglas;
const { notificar } = require('./notificaciones');
const { requiereAuth, soloRoles, manejar, ok, fail, firmarAcceso, crearRefreshToken } = require('./modulo-movil');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_tup_frre_metodologia_2026';
const ZONA = 'America/Argentina/Buenos_Aires';
const SEG_LOGIN_WEB = 180;   // vida del QR que muestra la web para que la app lo apruebe
const SEG_LOGIN_APP = 120;   // vida del QR que genera la web logueada para abrir la app
const MIN_REPETIDO = 2;      // minutos para ignorar el mismo escaneo repetido

const sha256 = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const aleatorio = (n = 24) => crypto.randomBytes(n).toString('base64url');
const qrImagen = (texto) => QRCode.toDataURL(texto, { margin: 1, width: 320, errorCorrectionLevel: 'M' });
const horaAR = (d = new Date()) => d.toLocaleTimeString('es-AR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false });
const iguales = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// ─── Tablas (también están en migracion_app_movil.sql; se crean solas si faltan) ───
let tablasListas = null;
function asegurarTablas() {
  tablasListas ??= db.query(`
    CREATE TABLE IF NOT EXISTS sesiones_qr (
      codigo_hash VARCHAR(64) PRIMARY KEY,
      clave_hash  VARCHAR(64),
      sentido     VARCHAR(10) NOT NULL CHECK (sentido IN ('A_WEB', 'A_APP')),
      estado      VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'APROBADA', 'USADA')),
      id_usuario  INT REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
      creado_en   TIMESTAMPTZ DEFAULT now(),
      expira_en   TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS movimientos_alumno (
      id               SERIAL PRIMARY KEY,
      id_alumno        INT NOT NULL REFERENCES alumnos(id_alumno) ON DELETE CASCADE,
      tipo             VARCHAR(12) NOT NULL CHECK (tipo IN ('INGRESO', 'EGRESO', 'SUBE_MICRO', 'BAJA_MICRO')),
      recorrido_numero INT,
      registrado_por   INT REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
      origen           VARCHAR(10),
      creado_en        TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_movimientos_alumno ON movimientos_alumno (id_alumno, creado_en);
  `).catch((e) => { tablasListas = null; throw e; });
  return tablasListas;
}
const conTablas = (fn) => manejar(async (req, res) => { await asegurarTablas(); return fn(req, res); });

// ─── Credencial firmada ───
const firmaCredencial = (idAlumno) => crypto.createHmac('sha256', JWT_SECRET).update(`credencial:${idAlumno}`).digest('base64url').slice(0, 22);
const textoCredencial = (idAlumno) => `EFT-CRED:${idAlumno}.${firmaCredencial(idAlumno)}`;
function leerCredencial(texto) {
  const m = /^EFT-CRED:(\d+)\.([\w-]{22})$/.exec(String(texto || '').trim());
  if (!m || !iguales(m[2], firmaCredencial(m[1]))) throw new ErrorNegocio('El código no es una credencial válida del colegio.', 400);
  return parseInt(m[1], 10);
}

const TIPOS = {
  INGRESO: { titulo: 'Ingreso al colegio', frase: 'el ingreso al establecimiento' },
  EGRESO: { titulo: 'Salida del colegio', frase: 'la salida del establecimiento' },
  SUBE_MICRO: { titulo: 'Subió al transporte', frase: 'la subida al transporte escolar' },
  BAJA_MICRO: { titulo: 'Bajó del transporte', frase: 'la bajada del transporte escolar' }
};

async function usuarioActivo(idUsuario) {
  const u = (await db.query('SELECT id_usuario, email, rol, nombre, apellido, edad, genero, estado FROM usuarios WHERE id_usuario = $1', [idUsuario])).rows[0];
  if (!u || u.estado !== 'ACTIVO') throw new ErrorNegocio('El usuario no está activo.', 403);
  return u;
}

/** Nivel ('primaria' | 'secundaria') del alumno, como lo guarda la web al iniciar sesión. */
async function nivelWeb(u) {
  if (u.rol !== 'ESTUDIANTE') return null;
  const r = await db.query(`SELECT n.nombre FROM alumnos a JOIN cursos c ON c.id_curso = a.id_curso JOIN niveles n ON n.id_nivel = c.id_nivel
                            WHERE a.id_usuario = $1`, [u.id_usuario]);
  const n = (r.rows[0]?.nombre || '').toLowerCase();
  return n.startsWith('secund') ? 'secundaria' : n.startsWith('prim') ? 'primaria' : null;
}

function registrar(app) {
  const ADMIN = [requiereAuth, soloRoles('ADMIN')];

  // ══════════ 1. Inicio de sesión con QR ══════════

  /** La web pide un QR para que una app ya logueada la autorice. Devuelve el QR y una clave que solo conoce el navegador. */
  app.post('/api/qr-login/web/iniciar', conTablas(async (req, res) => {
    await db.query(`DELETE FROM sesiones_qr WHERE expira_en < now() - INTERVAL '1 hour'`);
    const codigo = aleatorio(), clave = aleatorio();
    await db.query(`INSERT INTO sesiones_qr (codigo_hash, clave_hash, sentido, expira_en) VALUES ($1, $2, 'A_WEB', now() + make_interval(secs => $3))`,
      [sha256(codigo), sha256(clave), SEG_LOGIN_WEB]);
    ok(res, { codigo, clave, segundos: SEG_LOGIN_WEB, qr: await qrImagen(`EFT-LOGIN:${codigo}`) });
  }));

  /** La web consulta (cada 2 s) si la app ya aprobó. Cuando sí, recibe la sesión una única vez. */
  app.post('/api/qr-login/web/estado', conTablas(async (req, res) => {
    const { codigo, clave } = req.body || {};
    if (!codigo || !clave) return fail(res, 'Faltan datos.', 400);
    const s = (await db.query(`SELECT estado, clave_hash, id_usuario, expira_en < now() AS vencido FROM sesiones_qr WHERE codigo_hash = $1 AND sentido = 'A_WEB'`,
      [sha256(codigo)])).rows[0];
    if (!s || !iguales(s.clave_hash, sha256(clave))) return fail(res, 'Código inválido.', 404);
    if (s.estado === 'USADA') return ok(res, { estado: 'USADA' });
    if (s.vencido) return ok(res, { estado: 'EXPIRADO' });
    if (s.estado === 'PENDIENTE') return ok(res, { estado: 'PENDIENTE' });
    // APROBADA → se marca como usada de forma atómica y se entrega la sesión web (8 h)
    const usada = await db.query(`UPDATE sesiones_qr SET estado = 'USADA' WHERE codigo_hash = $1 AND estado = 'APROBADA' RETURNING id_usuario`, [sha256(codigo)]);
    if (usada.rowCount === 0) return ok(res, { estado: 'USADA' });
    const u = await usuarioActivo(usada.rows[0].id_usuario);
    await reglas.auditar({ usuario: u, get: () => 'web' }, 'LOGIN_QR_WEB');
    ok(res, {
      estado: 'APROBADA',
      token: firmarAcceso(u, '8h'),
      usuario: { id: u.id_usuario, email: u.email, rol: u.rol, nombre: u.nombre, apellido: u.apellido, edad: u.edad, genero: u.genero, nivel: await nivelWeb(u) }
    });
  }));

  /** La app (logueada) escanea el QR de la web y la autoriza con su usuario. */
  app.post('/api/qr-login/web/aprobar', requiereAuth, conTablas(async (req, res) => {
    const codigo = String(req.body?.codigo || '').replace(/^EFT-LOGIN:/, '');
    const r = await db.query(`
      UPDATE sesiones_qr SET estado = 'APROBADA', id_usuario = $2
      WHERE codigo_hash = $1 AND sentido = 'A_WEB' AND estado = 'PENDIENTE' AND expira_en > now()`, [sha256(codigo), req.usuario.id_usuario]);
    if (r.rowCount === 0) throw new ErrorNegocio('El código QR venció o ya fue usado. Generá uno nuevo en la web.', 404);
    await reglas.auditar(req, 'APROBAR_LOGIN_WEB_QR');
    ok(res, { mensaje: 'Listo, la sesión se abrió en la web.' });
  }));

  /** Desde la web logueada se genera un QR de un solo uso para abrir la misma cuenta en la app. */
  app.post('/api/qr-login/app/generar', requiereAuth, conTablas(async (req, res) => {
    const codigo = aleatorio();
    await db.query(`INSERT INTO sesiones_qr (codigo_hash, sentido, estado, id_usuario, expira_en) VALUES ($1, 'A_APP', 'APROBADA', $2, now() + make_interval(secs => $3))`,
      [sha256(codigo), req.usuario.id_usuario, SEG_LOGIN_APP]);
    ok(res, { codigo, segundos: SEG_LOGIN_APP, qr: await qrImagen(`EFT-APP:${codigo}`) });
  }));

  /** La app escanea ese QR desde "Ingresar con QR" y recibe su sesión (igual que un login normal). */
  app.post('/api/qr-login/app/canjear', conTablas(async (req, res) => {
    const codigo = String(req.body?.codigo || '').replace(/^EFT-APP:/, '');
    const r = await db.query(`
      UPDATE sesiones_qr SET estado = 'USADA'
      WHERE codigo_hash = $1 AND sentido = 'A_APP' AND estado = 'APROBADA' AND expira_en > now() RETURNING id_usuario`, [sha256(codigo)]);
    if (r.rowCount === 0) throw new ErrorNegocio('El código QR venció o ya fue usado. Generá uno nuevo desde la web.', 404);
    const u = await usuarioActivo(r.rows[0].id_usuario);
    await reglas.auditar({ usuario: u, get: () => 'movil' }, 'LOGIN_QR_APP');
    ok(res, {
      mensaje: 'Autenticación exitosa',
      token: firmarAcceso(u, '15m'),
      refresh_token: await crearRefreshToken(u.id_usuario),
      usuario: { id: u.id_usuario, email: u.email, rol: u.rol, nombre: u.nombre, apellido: u.apellido }
    });
  }));

  // ══════════ 2. Credencial digital y movimientos ══════════

  /** Credenciales visibles para el usuario: el padre ve las de sus hijos, el estudiante la propia. Incluye los últimos movimientos. */
  app.get('/api/movil/credenciales', requiereAuth, soloRoles('PADRE', 'ESTUDIANTE'), conTablas(async (req, res) => {
    const filtro = req.usuario.rol === 'PADRE'
      ? 'a.id_alumno IN (SELECT ta.id_alumno FROM tutor_alumno ta JOIN tutores t ON t.id_tutor = ta.id_tutor WHERE t.id_usuario = $1)'
      : 'a.id_usuario = $1';
    const alumnos = (await db.query(`
      SELECT a.id_alumno, a.nombre, a.apellido, a.legajo, a.dni, a.estado, c.nombre AS curso, c.division, n.nombre AS nivel,
             it.recorrido_numero
      FROM alumnos a LEFT JOIN cursos c ON c.id_curso = a.id_curso LEFT JOIN niveles n ON n.id_nivel = c.id_nivel
      LEFT JOIN inscripciones_transporte it ON it.id_alumno = a.id_alumno
      WHERE ${filtro} ORDER BY a.nombre`, [req.usuario.id_usuario])).rows;
    const movs = alumnos.length ? (await db.query(`
      SELECT id_alumno, tipo, recorrido_numero, creado_en FROM (
        SELECT m.*, ROW_NUMBER() OVER (PARTITION BY m.id_alumno ORDER BY m.creado_en DESC) AS n FROM movimientos_alumno m WHERE m.id_alumno = ANY($1::int[])
      ) x WHERE n <= 10 ORDER BY creado_en DESC`, [alumnos.map(a => a.id_alumno)])).rows : [];
    ok(res, await Promise.all(alumnos.map(async a => ({
      ...a,
      qr: await qrImagen(textoCredencial(a.id_alumno)),
      movimientos: movs.filter(m => m.id_alumno === a.id_alumno).map(({ id_alumno, ...m }) => ({ ...m, titulo: TIPOS[m.tipo].titulo }))
    }))));
  }));

  /** Portería / transporte: registra un movimiento escaneando la credencial. Solo docentes y administración. */
  app.post('/api/movil/movimientos', requiereAuth, soloRoles('DOCENTE', 'ADMIN'), conTablas(async (req, res) => {
    const tipo = String(req.body?.tipo || '').toUpperCase();
    if (!TIPOS[tipo]) throw new ErrorNegocio('Tipo de registro inválido.');
    const idAlumno = leerCredencial(req.body?.qr);
    const a = (await db.query(`
      SELECT a.id_alumno, a.nombre, a.apellido, a.legajo, a.estado, c.nombre AS curso, c.division, n.nombre AS nivel, it.recorrido_numero
      FROM alumnos a LEFT JOIN cursos c ON c.id_curso = a.id_curso LEFT JOIN niveles n ON n.id_nivel = c.id_nivel
      LEFT JOIN inscripciones_transporte it ON it.id_alumno = a.id_alumno WHERE a.id_alumno = $1`, [idAlumno])).rows[0];
    if (!a) throw new ErrorNegocio('El alumno de esta credencial no existe.', 404);
    if (a.estado && a.estado !== 'ACTIVO') throw new ErrorNegocio(`El alumno figura como ${a.estado.toLowerCase()}. Consultá con administración.`, 409);
    const esMicro = tipo === 'SUBE_MICRO' || tipo === 'BAJA_MICRO';
    if (esMicro && !a.recorrido_numero) throw new ErrorNegocio(`${a.nombre} ${a.apellido} no está inscripto/a al transporte escolar.`, 409);

    const repetido = await db.query(`SELECT 1 FROM movimientos_alumno WHERE id_alumno = $1 AND tipo = $2 AND creado_en > now() - make_interval(mins => $3)`,
      [idAlumno, tipo, MIN_REPETIDO]);
    if (repetido.rowCount) throw new ErrorNegocio(`Ya se registró ${TIPOS[tipo].frase} de ${a.nombre} hace menos de ${MIN_REPETIDO} minutos.`, 409);

    const m = (await db.query(`INSERT INTO movimientos_alumno (id_alumno, tipo, recorrido_numero, registrado_por, origen) VALUES ($1, $2, $3, $4, $5) RETURNING creado_en`,
      [idAlumno, tipo, esMicro ? a.recorrido_numero : null, req.usuario.id_usuario, reglas.origenDe(req)])).rows[0];
    const hora = horaAR(new Date(m.creado_en));
    await reglas.auditar(req, `MOVIMIENTO_${tipo}`, { id_alumno: idAlumno });
    // Notificación a la familia: sin el nombre del menor (Ley 25.326), se identifica por legajo
    await notificar(await reglas.usuariosRelacionados(idAlumno), {
      titulo: TIPOS[tipo].titulo,
      cuerpo: `Se registró ${TIPOS[tipo].frase} a las ${hora} h${esMicro ? ` (recorrido ${a.recorrido_numero})` : ''}. Legajo ${a.legajo}.`,
      tipo: 'ASISTENCIA',
      datos: { pantalla: 'credencial', id_alumno: idAlumno }
    });
    ok(res, {
      mensaje: `${TIPOS[tipo].titulo}: ${a.nombre} ${a.apellido} · ${hora} h`,
      tipo, hora,
      alumno: { nombre: a.nombre, apellido: a.apellido, legajo: a.legajo, curso: a.curso ? `${a.curso}${a.division ? ' ' + a.division : ''}` : null, nivel: a.nivel }
    }, 201);
  }));

  /** Reporte de asistencia diaria por curso (?fecha=AAAA-MM-DD&id_curso). Presente = registró ingreso ese día. */
  app.get('/api/reportes/asistencia', ...ADMIN, conTablas(async (req, res) => {
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha || '') ? req.query.fecha
      : new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());
    const idCurso = req.query.id_curso ? parseInt(req.query.id_curso, 10) : null;
    // Argentina es UTC-3 todo el año: se pasa la hora a local restando 3 h
    const r = await db.query(`
      WITH m AS (
        SELECT id_alumno, tipo, creado_en FROM movimientos_alumno
        WHERE ((creado_en AT TIME ZONE 'UTC') - INTERVAL '3 hours')::date = $1::date
      )
      SELECT n.nombre AS nivel, c.nombre AS curso, c.division, a.legajo, a.apellido || ', ' || a.nombre AS alumno,
             TO_CHAR(MIN(m.creado_en) FILTER (WHERE m.tipo = 'INGRESO') AT TIME ZONE 'UTC' - INTERVAL '3 hours', 'HH24:MI') AS ingreso,
             TO_CHAR(MAX(m.creado_en) FILTER (WHERE m.tipo = 'EGRESO') AT TIME ZONE 'UTC' - INTERVAL '3 hours', 'HH24:MI') AS egreso,
             TO_CHAR(MIN(m.creado_en) FILTER (WHERE m.tipo = 'SUBE_MICRO') AT TIME ZONE 'UTC' - INTERVAL '3 hours', 'HH24:MI') AS sube_micro,
             TO_CHAR(MAX(m.creado_en) FILTER (WHERE m.tipo = 'BAJA_MICRO') AT TIME ZONE 'UTC' - INTERVAL '3 hours', 'HH24:MI') AS baja_micro,
             BOOL_OR(m.tipo = 'INGRESO') IS TRUE AS presente
      FROM alumnos a JOIN cursos c ON c.id_curso = a.id_curso JOIN niveles n ON n.id_nivel = c.id_nivel
      LEFT JOIN m ON m.id_alumno = a.id_alumno
      WHERE ($2::int IS NULL OR c.id_curso = $2) AND COALESCE(a.estado, 'ACTIVO') = 'ACTIVO'
      GROUP BY n.id_nivel, n.nombre, c.id_curso, c.nombre, c.division, c.anio_escolar, a.id_alumno, a.legajo, a.apellido, a.nombre
      ORDER BY n.id_nivel, c.anio_escolar, c.division, alumno`, [fecha, idCurso]);
    const presentes = r.rows.filter(x => x.presente).length;
    ok(res, { fecha, total: r.rowCount, presentes, ausentes: r.rowCount - presentes, alumnos: r.rows });
  }));
}

module.exports = { registrar, textoCredencial, leerCredencial };
