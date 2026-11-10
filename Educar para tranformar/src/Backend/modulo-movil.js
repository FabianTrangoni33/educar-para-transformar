/**
 * modulo-movil.js - Endpoints que necesita la App Móvil (y que también usa la web).
 *
 * - Sesión: refresh token, logout, /me, cambio y recuperación de contraseña.
 * - Alumnos: resumen académico, inscripción a deportes, transporte y comedor (con control de permisos).
 * - Docentes: materias y cursos asignados con horarios.
 * - Notificaciones: registro de dispositivos y bandeja.
 * - Público: opiniones, galería, recorridos y postulaciones de empleo.
 *
 * Todas las rutas se pueden llamar como /api/... o /api/v1/... (ver API_Server.js).
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');
const reglas = require('./reglas-negocio');
const { notificar } = require('./notificaciones');
const mailer = require('./mailer');

const { ErrorNegocio } = reglas;
const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_default';
const ACCESS_MOVIL = '15m';          // token de acceso corto para la app (RNFM-03)
const REFRESH_DIAS = 30;

const ok = (res, data, status = 200) => res.status(status).json({ ok: true, data });
const fail = (res, msg, status = 400, codigo) => res.status(status).json({ ok: false, error: msg, ...(codigo ? { codigo } : {}) });
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Envuelve un handler async: los ErrorNegocio se devuelven con su status, el resto como 500. */
const manejar = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e instanceof ErrorNegocio) return fail(res, e.message, e.status);
    console.error(`[API ${req.method} ${req.path}]`, e);
    fail(res, 'Error interno del servidor', 500);
  }
};

// ─── AUTENTICACIÓN ──────────────────────────────────────────────────────────

/** Valida el JWT. Responde 401 con codigo TOKEN_EXPIRADO para que la app renueve la sesión. */
function requiereAuth(req, res, next) {
  const token = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return fail(res, 'Iniciá sesión para continuar.', 401, 'SIN_TOKEN');
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    const expirado = e.name === 'TokenExpiredError';
    fail(res, expirado ? 'La sesión expiró.' : 'Sesión inválida.', 401, expirado ? 'TOKEN_EXPIRADO' : 'TOKEN_INVALIDO');
  }
}

const soloRoles = (...roles) => (req, res, next) =>
  roles.includes((req.usuario?.rol || '').toUpperCase())
    ? next()
    : fail(res, 'Tu rol no tiene acceso a esta sección.', 403, 'SIN_PERMISO');

function firmarAcceso(u, expiresIn = ACCESS_MOVIL) {
  return jwt.sign(
    { id_usuario: u.id_usuario, rol: u.rol, email: u.email, nombre: `${u.nombre || ''} ${u.apellido || ''}`.trim() },
    JWT_SECRET, { expiresIn });
}

/** Crea un refresh token opaco; en la base solo se guarda su hash. */
async function crearRefreshToken(idUsuario) {
  const token = crypto.randomBytes(48).toString('base64url');
  await db.query(
    `INSERT INTO refresh_tokens (id_usuario, token_hash, expira_en) VALUES ($1, $2, NOW() + INTERVAL '${REFRESH_DIAS} days')`,
    [idUsuario, sha256(token)]);
  return token;
}

/**
 * Middlewares de permiso sobre el alumno de :id (mínimo privilegio):
 * - alumnoVer: el padre ve solo a sus hijos, el estudiante solo a sí mismo.
 * - alumnoGestion: solo el padre/tutor (o el admin) inscribe o paga.
 */
const permisoAlumno = (verifica, mensaje) => async (req, res, next) => {
  req.idAlumno = parseInt(req.params.id, 10);
  if (!req.idAlumno) return fail(res, 'ID de alumno inválido');
  if (!(await verifica(req.usuario, req.idAlumno))) return fail(res, mensaje, 403, 'SIN_PERMISO');
  next();
};
const alumnoVer = permisoAlumno(reglas.puedeVerAlumno, 'Solo podés consultar la información de tus hijos.');
const alumnoGestion = permisoAlumno(reglas.puedeGestionarAlumno, 'Solo el padre o tutor puede realizar esta gestión.');

const GALERIA = [
  ['portada1.jpg', 'Frente del edificio'], ['Pileta natacion.jpg', 'Pileta de natación'],
  ['cancha de football.jpg', 'Canchas de fútbol'], ['atletismo.jpg', 'Pista de atletismo'],
  ['gimnacio.jpg', 'Gimnasio cubierto'], ['comedor.jpg', 'Comedor'],
  ['laboratorio computacion.jpg', 'Laboratorio de computación'], ['Laboratorio quimica.jpg', 'Laboratorio de química'],
  ['jardin.jpg', 'Nivel Inicial'], ['Primaria1.jpg', 'Nivel Primario'], ['secundaria.jpg', 'Nivel Secundario'],
  ['buses.jpg', 'Transporte escolar'], ['karate.jpg', 'Artes marciales'],
  ['Quimica.jpg', 'Laboratorio de ciencias'], ['ninosEstudiando.jpg', 'Apoyo estudiantil'], ['Niños felices.jpg', 'Vida escolar']
].map(([archivo, titulo]) => ({ titulo, ruta: `/img/${encodeURIComponent(archivo)}` }));

function registrar(app) {
  // ── Sesión ────────────────────────────────────────────────────────────────

  /** POST /api/auth/refresh { refresh_token } → nuevo token de acceso + nuevo refresh (rotación) */
  app.post('/api/auth/refresh', manejar(async (req, res) => {
    const { refresh_token } = req.body || {};
    if (!refresh_token) return fail(res, 'Falta refresh_token', 400);
    const r = await db.query(`
      UPDATE refresh_tokens SET revocado = TRUE
      WHERE token_hash = $1 AND revocado = FALSE AND expira_en > NOW()
      RETURNING id_usuario`, [sha256(refresh_token)]);
    if (r.rowCount === 0) return fail(res, 'La sesión expiró. Volvé a iniciar sesión.', 401, 'REFRESH_INVALIDO');

    const u = (await db.query('SELECT id_usuario, email, rol, nombre, apellido, estado FROM usuarios WHERE id_usuario = $1', [r.rows[0].id_usuario])).rows[0];
    if (!u || u.estado !== 'ACTIVO') return fail(res, 'Usuario inactivo.', 401, 'REFRESH_INVALIDO');
    ok(res, { token: firmarAcceso(u), refresh_token: await crearRefreshToken(u.id_usuario) });
  }));

  /** POST /api/auth/logout { refresh_token, token_push } → revoca la sesión y deja de enviar push */
  app.post('/api/auth/logout', manejar(async (req, res) => {
    const { refresh_token, token_push } = req.body || {};
    if (refresh_token) await db.query('UPDATE refresh_tokens SET revocado = TRUE WHERE token_hash = $1', [sha256(refresh_token)]);
    if (token_push) await db.query('DELETE FROM dispositivos WHERE token_push = $1', [token_push]);
    ok(res, { mensaje: 'Sesión cerrada' });
  }));

  /** GET /api/me → datos del usuario y, según el rol, sus hijos / su legajo / su ficha docente */
  app.get('/api/me', requiereAuth, manejar(async (req, res) => {
    const u = (await db.query('SELECT id_usuario, email, rol, nombre, apellido, estado FROM usuarios WHERE id_usuario = $1', [req.usuario.id_usuario])).rows[0];
    if (!u) return fail(res, 'Usuario no encontrado', 404);
    const datos = { usuario: u, hijos: [], alumno: null, docente: null };

    if (u.rol === 'PADRE') {
      datos.hijos = (await db.query(`
        SELECT a.id_alumno, a.nombre, a.apellido, a.legajo, c.nombre AS curso, c.division, n.nombre AS nivel, ta.parentesco
        FROM tutores t
        JOIN tutor_alumno ta ON ta.id_tutor = t.id_tutor
        JOIN alumnos a ON a.id_alumno = ta.id_alumno
        LEFT JOIN cursos c ON c.id_curso = a.id_curso
        LEFT JOIN niveles n ON n.id_nivel = c.id_nivel
        WHERE t.id_usuario = $1 ORDER BY a.nombre`, [u.id_usuario])).rows;
    } else if (u.rol === 'ESTUDIANTE') {
      datos.alumno = (await db.query(`
        SELECT a.id_alumno, a.nombre, a.apellido, a.legajo, c.nombre AS curso, c.division, n.nombre AS nivel
        FROM alumnos a LEFT JOIN cursos c ON c.id_curso = a.id_curso LEFT JOIN niveles n ON n.id_nivel = c.id_nivel
        WHERE a.id_usuario = $1`, [u.id_usuario])).rows[0] || null;
    } else if (u.rol === 'DOCENTE') {
      datos.docente = (await db.query('SELECT id_profesor, legajo, nombre, apellido, especialidad FROM profesores WHERE id_usuario = $1', [u.id_usuario])).rows[0] || null;
    }
    ok(res, datos);
  }));

  /** POST /api/auth/cambiar-password { actual, nueva } */
  app.post('/api/auth/cambiar-password', requiereAuth, manejar(async (req, res) => {
    const { actual, nueva } = req.body || {};
    if (!actual || !nueva) return fail(res, 'Completá la contraseña actual y la nueva.');
    if (String(nueva).length < 6) return fail(res, 'La nueva contraseña debe tener al menos 6 caracteres.');
    const u = (await db.query('SELECT password_hash FROM usuarios WHERE id_usuario = $1', [req.usuario.id_usuario])).rows[0];
    if (!u || !(await bcrypt.compare(actual, u.password_hash))) return fail(res, 'La contraseña actual no es correcta.', 400);
    await db.query('UPDATE usuarios SET password_hash = $1 WHERE id_usuario = $2', [await bcrypt.hash(nueva, 10), req.usuario.id_usuario]);
    // Cierra las demás sesiones móviles
    await db.query('UPDATE refresh_tokens SET revocado = TRUE WHERE id_usuario = $1', [req.usuario.id_usuario]);
    await reglas.auditar(req, 'CAMBIO_PASSWORD');
    ok(res, { mensaje: 'Contraseña actualizada. Volvé a iniciar sesión en tus otros dispositivos.' });
  }));

  /** POST /api/auth/recuperar { email } → envía un código de 6 dígitos por mail (válido 15 minutos) */
  app.post('/api/auth/recuperar', manejar(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const generico = { mensaje: 'Si el correo está registrado, te enviamos un código para restablecer la contraseña.' };
    if (!email) return fail(res, 'Ingresá tu correo electrónico.');
    const u = (await db.query("SELECT id_usuario, email, nombre FROM usuarios WHERE LOWER(email) = $1 AND estado = 'ACTIVO'", [email])).rows[0];
    if (!u) return ok(res, generico);   // no revela si el mail existe

    const codigo = String(crypto.randomInt(100000, 1000000));
    await db.query('UPDATE recuperacion_password SET usado = TRUE WHERE id_usuario = $1 AND usado = FALSE', [u.id_usuario]);
    await db.query(`INSERT INTO recuperacion_password (id_usuario, codigo_hash, expira_en) VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
      [u.id_usuario, sha256(codigo)]);
    const envio = await mailer.enviar({
      para: u.email,
      asunto: 'Código para restablecer tu contraseña - Educar para Transformar',
      html: `<p>Hola ${u.nombre || ''},</p><p>Tu código para restablecer la contraseña es:</p>
             <h2 style="letter-spacing:4px">${codigo}</h2><p>Vence en 15 minutos. Si no lo pediste, ignorá este mensaje.</p>`
    });
    // Sin servidor de correo configurado (solo en local) se devuelve el código para poder probar
    const demo = envio.estado === 'SIMULADO' && !process.env.VERCEL ? { codigo_demo: codigo } : {};
    ok(res, { ...generico, ...demo });
  }));

  /** POST /api/auth/restablecer { email, codigo, nueva } */
  app.post('/api/auth/restablecer', manejar(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const { codigo, nueva } = req.body || {};
    if (!email || !codigo || !nueva) return fail(res, 'Completá correo, código y nueva contraseña.');
    if (String(nueva).length < 6) return fail(res, 'La nueva contraseña debe tener al menos 6 caracteres.');
    const pedido = (await db.query(`
      SELECT r.id, r.codigo_hash, r.intentos, u.id_usuario FROM recuperacion_password r
      JOIN usuarios u ON u.id_usuario = r.id_usuario
      WHERE LOWER(u.email) = $1 AND r.usado = FALSE AND r.expira_en > NOW()
      ORDER BY r.creado_en DESC LIMIT 1`, [email])).rows[0];
    if (!pedido || pedido.intentos >= 5) return fail(res, 'El código es inválido o venció. Pedí uno nuevo.');
    if (pedido.codigo_hash !== sha256(String(codigo).trim())) {
      await db.query('UPDATE recuperacion_password SET intentos = intentos + 1 WHERE id = $1', [pedido.id]);
      return fail(res, 'El código es incorrecto.');
    }
    await db.query('UPDATE recuperacion_password SET usado = TRUE WHERE id = $1', [pedido.id]);
    await db.query('UPDATE usuarios SET password_hash = $1 WHERE id_usuario = $2', [await bcrypt.hash(nueva, 10), pedido.id_usuario]);
    await db.query('UPDATE refresh_tokens SET revocado = TRUE WHERE id_usuario = $1', [pedido.id_usuario]);
    ok(res, { mensaje: 'Contraseña restablecida. Ya podés iniciar sesión.' });
  }));

  // ── Alumnos: consulta ─────────────────────────────────────────────────────

  /** GET /api/movil/alumnos/:id/resumen → todo lo académico y de servicios de un alumno */
  app.get('/api/movil/alumnos/:id/resumen', requiereAuth, alumnoVer, manejar(async (req, res) => {
    const id = req.idAlumno;
    const [alumno, materias, notas, horarios, deportes, transporte, comedor] = await Promise.all([
      db.query(`
        SELECT a.id_alumno, a.legajo, a.nombre, a.apellido, a.estado, c.id_curso, c.nombre AS curso, c.division,
               n.id_nivel, n.nombre AS nivel, ci.nombre AS ciclo
        FROM alumnos a LEFT JOIN cursos c ON c.id_curso = a.id_curso
        LEFT JOIN niveles n ON n.id_nivel = c.id_nivel LEFT JOIN ciclos ci ON ci.id_ciclo = c.id_ciclo
        WHERE a.id_alumno = $1`, [id]),
      db.query(`
        SELECT m.id_materia, m.nombre, m.carga_horaria,
               NULLIF(TRIM(CONCAT(p.nombre, ' ', p.apellido)), '') AS profesor
        FROM alumnos a
        JOIN curso_materia cm ON cm.id_curso = a.id_curso
        JOIN materias m ON m.id_materia = cm.id_materia
        LEFT JOIN asignaciones_docente ad ON ad.id_materia = m.id_materia AND ad.id_curso = a.id_curso
        LEFT JOIN profesores p ON p.id_profesor = ad.id_profesor
        WHERE a.id_alumno = $1 ORDER BY m.nombre`, [id]),
      db.query('SELECT id_materia, trimestre, nota::float AS nota, observacion FROM calificaciones WHERE id_alumno = $1 ORDER BY trimestre', [id]),
      db.query(`
        SELECT h.dia_semana AS dia, TO_CHAR(h.hora_inicio, 'HH24:MI') AS inicio, TO_CHAR(h.hora_fin, 'HH24:MI') AS fin,
               h.aula, m.nombre AS materia
        FROM alumnos a JOIN horarios_curso h ON h.id_curso = a.id_curso JOIN materias m ON m.id_materia = h.id_materia
        WHERE a.id_alumno = $1
        ORDER BY ARRAY_POSITION(ARRAY['Lunes','Martes','Miércoles','Jueves','Viernes']::varchar[], h.dia_semana), h.hora_inicio`, [id]),
      db.query(`
        SELECT d.id_deporte, d.nombre, d.dia_semana, TO_CHAR(d.hora_inicio, 'HH24:MI') AS inicio, TO_CHAR(d.hora_fin, 'HH24:MI') AS fin,
               d.precio_mensual::float AS precio, NULLIF(TRIM(CONCAT(p.nombre, ' ', p.apellido)), '') AS profesor, i.fecha_inscripcion
        FROM inscripciones_deporte i JOIN deportes d ON d.id_deporte = i.id_deporte
        LEFT JOIN profesores p ON p.id_profesor = d.id_profesor
        WHERE i.id_alumno = $1 ORDER BY d.nombre`, [id]),
      db.query(`
        SELECT t.recorrido_numero, t.parada, t.fecha_inscripcion, r.nombre, r.zona, r.horario_ida, r.horario_vuelta,
               r.precio_mensual::float AS precio
        FROM inscripciones_transporte t LEFT JOIN recorridos_transporte r ON r.numero = t.recorrido_numero
        WHERE t.id_alumno = $1`, [id]),
      db.query("SELECT c.modalidad, c.fecha_inscripcion, (SELECT monto::float FROM tarifas WHERE clave = 'COMEDOR') AS precio FROM inscripciones_comedor c WHERE c.id_alumno = $1", [id])
    ]);
    if (alumno.rowCount === 0) return fail(res, 'Alumno no encontrado', 404);

    // Agrupa las notas dentro de cada materia y calcula el promedio
    const materiasConNotas = materias.rows.map(m => {
      const n = notas.rows.filter(x => x.id_materia === m.id_materia);
      const promedio = n.length ? Math.round((n.reduce((s, x) => s + x.nota, 0) / n.length) * 100) / 100 : null;
      return { ...m, notas: n.map(({ trimestre, nota, observacion }) => ({ trimestre, nota, observacion })), promedio };
    });

    ok(res, {
      alumno: alumno.rows[0],
      materias: materiasConNotas,
      horarios: horarios.rows,
      deportes: deportes.rows,
      transporte: transporte.rows[0] || null,
      comedor: comedor.rows[0] || null,
      sincronizado_en: new Date().toISOString()
    });
  }));

  // ── Alumnos: inscripciones (solo padre/tutor o admin) ─────────────────────

  const avisoInscripcion = (idAlumno, cuerpo, pantalla) =>
    reglas.usuariosRelacionados(idAlumno).then(ids =>
      notificar(ids, { titulo: 'Inscripción confirmada', cuerpo, tipo: 'INSCRIPCION', datos: { pantalla, id_alumno: idAlumno } }));

  /** POST /api/movil/alumnos/:id/deportes { id_deporte } */
  app.post('/api/movil/alumnos/:id/deportes', requiereAuth, alumnoGestion, manejar(async (req, res) => {
    const deporte = await reglas.inscribirDeporte(req.idAlumno, req.body?.id_deporte);
    await reglas.auditar(req, 'INSCRIPCION_DEPORTE', { id_alumno: req.idAlumno, id_deporte: deporte.id_deporte });
    await avisoInscripcion(req.idAlumno, 'Se registró una inscripción a deportes. Abrí la app para ver el detalle.', 'deportes');
    ok(res, { mensaje: `Inscripción exitosa a ${deporte.nombre}` }, 201);
  }));

  /** DELETE /api/movil/alumnos/:id/deportes/:idDeporte */
  app.delete('/api/movil/alumnos/:id/deportes/:idDeporte', requiereAuth, alumnoGestion, manejar(async (req, res) => {
    await reglas.desinscribirDeporte(req.idAlumno, req.params.idDeporte);
    await reglas.auditar(req, 'BAJA_DEPORTE', { id_alumno: req.idAlumno, id_deporte: Number(req.params.idDeporte) });
    ok(res, { mensaje: 'Se dio de baja la inscripción al deporte.' });
  }));

  /** PUT /api/movil/alumnos/:id/transporte { recorrido_numero, parada } → alta o modificación */
  app.put('/api/movil/alumnos/:id/transporte', requiereAuth, alumnoGestion, manejar(async (req, res) => {
    const r = await reglas.asignarTransporte(req.idAlumno, req.body?.recorrido_numero, req.body?.parada);
    await reglas.auditar(req, r.modificado ? 'MODIFICA_TRANSPORTE' : 'INSCRIPCION_TRANSPORTE', { id_alumno: req.idAlumno, recorrido: r.recorrido.numero });
    await avisoInscripcion(req.idAlumno, 'Se registró un cambio en el servicio de transporte. Abrí la app para ver el detalle.', 'transporte');
    ok(res, { mensaje: `${r.modificado ? 'Recorrido modificado' : 'Inscripción registrada'}: ${r.recorrido.nombre}`, transporte: r.inscripcion });
  }));

  app.delete('/api/movil/alumnos/:id/transporte', requiereAuth, alumnoGestion, manejar(async (req, res) => {
    const r = await db.query('DELETE FROM inscripciones_transporte WHERE id_alumno = $1', [req.idAlumno]);
    if (r.rowCount === 0) return fail(res, 'El alumno no tenía transporte asignado.', 404);
    await reglas.auditar(req, 'BAJA_TRANSPORTE', { id_alumno: req.idAlumno });
    ok(res, { mensaje: 'Se dio de baja el servicio de transporte.' });
  }));

  /** PUT /api/movil/alumnos/:id/comedor { modalidad } → rechaza duplicados con 409 */
  app.put('/api/movil/alumnos/:id/comedor', requiereAuth, alumnoGestion, manejar(async (req, res) => {
    const modalidad = ['ALMUERZO', 'DESAYUNO_ALMUERZO'].includes(req.body?.modalidad) ? req.body.modalidad : 'ALMUERZO';
    const c = await reglas.inscribirComedor(req.idAlumno, modalidad);
    await reglas.auditar(req, 'INSCRIPCION_COMEDOR', { id_alumno: req.idAlumno, modalidad });
    await avisoInscripcion(req.idAlumno, 'Se registró una inscripción al comedor. Abrí la app para ver el detalle.', 'comedor');
    ok(res, { mensaje: 'Inscripción al comedor registrada.', comedor: c }, 201);
  }));

  app.delete('/api/movil/alumnos/:id/comedor', requiereAuth, alumnoGestion, manejar(async (req, res) => {
    const r = await db.query('DELETE FROM inscripciones_comedor WHERE id_alumno = $1', [req.idAlumno]);
    if (r.rowCount === 0) return fail(res, 'El alumno no estaba inscripto en el comedor.', 404);
    await reglas.auditar(req, 'BAJA_COMEDOR', { id_alumno: req.idAlumno });
    ok(res, { mensaje: 'Se dio de baja el servicio de comedor.' });
  }));

  // ── Docentes ──────────────────────────────────────────────────────────────

  /** GET /api/movil/docente/asignaciones → materias y cursos del docente logueado, con horarios */
  app.get('/api/movil/docente/asignaciones', requiereAuth, soloRoles('DOCENTE'), manejar(async (req, res) => {
    const [asig, deportes] = await Promise.all([
      db.query(`
        SELECT ad.id_asignacion, m.id_materia, m.nombre AS materia, m.carga_horaria,
               c.id_curso, c.nombre AS curso, c.division, n.nombre AS nivel,
               (SELECT COUNT(*) FROM alumnos al WHERE al.id_curso = c.id_curso AND al.estado = 'ACTIVO')::int AS alumnos,
               COALESCE((
                 SELECT JSON_AGG(JSON_BUILD_OBJECT('dia', h.dia_semana, 'inicio', TO_CHAR(h.hora_inicio, 'HH24:MI'),
                                                   'fin', TO_CHAR(h.hora_fin, 'HH24:MI'), 'aula', h.aula)
                        ORDER BY ARRAY_POSITION(ARRAY['Lunes','Martes','Miércoles','Jueves','Viernes']::varchar[], h.dia_semana), h.hora_inicio)
                 FROM horarios_curso h WHERE h.id_curso = c.id_curso AND h.id_materia = m.id_materia), '[]'::json) AS horarios
        FROM asignaciones_docente ad
        JOIN profesores p ON p.id_profesor = ad.id_profesor
        JOIN materias m ON m.id_materia = ad.id_materia
        LEFT JOIN cursos c ON c.id_curso = ad.id_curso
        LEFT JOIN niveles n ON n.id_nivel = COALESCE(c.id_nivel, m.id_nivel)
        WHERE p.id_usuario = $1
        ORDER BY n.id_nivel, c.id_curso, m.nombre`, [req.usuario.id_usuario]),
      db.query(`
        SELECT d.id_deporte, d.nombre, d.dia_semana, TO_CHAR(d.hora_inicio, 'HH24:MI') AS inicio, TO_CHAR(d.hora_fin, 'HH24:MI') AS fin,
               n.nombre AS nivel, (SELECT COUNT(*) FROM inscripciones_deporte i WHERE i.id_deporte = d.id_deporte)::int AS inscriptos
        FROM deportes d JOIN profesores p ON p.id_profesor = d.id_profesor LEFT JOIN niveles n ON n.id_nivel = d.id_nivel
        WHERE p.id_usuario = $1 ORDER BY d.nombre`, [req.usuario.id_usuario])
    ]);
    ok(res, { asignaciones: asig.rows, deportes: deportes.rows, sincronizado_en: new Date().toISOString() });
  }));

  // ── Notificaciones ────────────────────────────────────────────────────────

  /** POST /api/dispositivos { token_push, plataforma } → asocia el dispositivo al usuario */
  app.post('/api/dispositivos', requiereAuth, manejar(async (req, res) => {
    const { token_push, plataforma } = req.body || {};
    if (!token_push) return fail(res, 'Falta token_push');
    await db.query(`
      INSERT INTO dispositivos (id_usuario, token_push, plataforma) VALUES ($1, $2, $3)
      ON CONFLICT (token_push) DO UPDATE SET id_usuario = EXCLUDED.id_usuario, plataforma = EXCLUDED.plataforma,
        actualizado_en = CURRENT_TIMESTAMP`, [req.usuario.id_usuario, token_push, plataforma || null]);
    ok(res, { mensaje: 'Dispositivo registrado' }, 201);
  }));

  app.delete('/api/dispositivos', requiereAuth, manejar(async (req, res) => {
    await db.query('DELETE FROM dispositivos WHERE token_push = $1 AND id_usuario = $2', [req.body?.token_push, req.usuario.id_usuario]);
    ok(res, { mensaje: 'Dispositivo eliminado' });
  }));

  app.get('/api/movil/notificaciones', requiereAuth, manejar(async (req, res) => {
    const r = await db.query(`
      SELECT id, titulo, cuerpo, tipo, datos, leida, creado_en FROM notificaciones
      WHERE id_usuario = $1 ORDER BY creado_en DESC LIMIT 50`, [req.usuario.id_usuario]);
    ok(res, r.rows);
  }));

  app.post('/api/movil/notificaciones/leidas', requiereAuth, manejar(async (req, res) => {
    await db.query('UPDATE notificaciones SET leida = TRUE WHERE id_usuario = $1 AND leida = FALSE', [req.usuario.id_usuario]);
    ok(res, { mensaje: 'Notificaciones marcadas como leídas' });
  }));

  // ── Público (sin iniciar sesión) ──────────────────────────────────────────

  app.get('/api/opiniones', manejar(async (req, res) => {
    const r = await db.query(`
      SELECT id_opinion, nombre, comentario, calificacion, creado_en FROM opiniones
      WHERE estado = 'PUBLICADA' ORDER BY creado_en DESC LIMIT 30`);
    const prom = await db.query("SELECT ROUND(AVG(calificacion), 1)::float AS promedio, COUNT(*)::int AS total FROM opiniones WHERE estado = 'PUBLICADA'");
    ok(res, { opiniones: r.rows, ...prom.rows[0] });
  }));

  /** POST /api/opiniones { nombre, comentario, calificacion } (RF-02 / RFM-03) */
  app.post('/api/opiniones', manejar(async (req, res) => {
    const nombre = String(req.body?.nombre || '').trim();
    const comentario = String(req.body?.comentario || '').trim();
    const calificacion = parseInt(req.body?.calificacion, 10);
    if (!nombre || !comentario) return fail(res, 'El nombre y el comentario son obligatorios.');
    if (!(calificacion >= 1 && calificacion <= 5)) return fail(res, 'La calificación debe ser de 1 a 5 estrellas.');
    if (nombre.length > 80 || comentario.length > 1000) return fail(res, 'El texto es demasiado largo.');
    const r = await db.query(
      'INSERT INTO opiniones (nombre, comentario, calificacion, origen) VALUES ($1, $2, $3, $4) RETURNING id_opinion, nombre, comentario, calificacion, creado_en',
      [nombre, comentario, calificacion, reglas.origenDe(req)]);
    ok(res, { mensaje: '¡Gracias por tu opinión!', opinion: r.rows[0] }, 201);
  }));

  /** Moderación (admin): PUT /api/opiniones/:id { estado: 'PUBLICADA' | 'OCULTA' } */
  app.put('/api/opiniones/:id', requiereAuth, soloRoles('ADMIN'), manejar(async (req, res) => {
    const estado = req.body?.estado === 'OCULTA' ? 'OCULTA' : 'PUBLICADA';
    await db.query('UPDATE opiniones SET estado = $1 WHERE id_opinion = $2', [estado, parseInt(req.params.id, 10)]);
    ok(res, { mensaje: `Opinión ${estado.toLowerCase()}` });
  }));

  app.get('/api/galeria', (req, res) => ok(res, GALERIA));

  app.get('/api/transporte/recorridos', manejar(async (req, res) => {
    const r = await db.query('SELECT numero, nombre, zona, paradas, horario_ida, horario_vuelta, precio_mensual::float AS precio FROM recorridos_transporte ORDER BY numero');
    ok(res, r.rows);
  }));

  /** POST /api/empleo → postulación desde la sección "Empleo" del sitio */
  app.post('/api/empleo', manejar(async (req, res) => {
    const b = req.body || {};
    const nombre = String(b.nombre || '').trim(), email = String(b.email || '').trim(), puesto = String(b.puesto || '').trim();
    if (!nombre || !email || !puesto) return fail(res, 'Nombre, correo y puesto son obligatorios.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 'El correo no es válido.');
    await db.query('INSERT INTO postulaciones_empleo (nombre, email, telefono, puesto, mensaje) VALUES ($1, $2, $3, $4, $5)',
      [nombre.slice(0, 100), email.slice(0, 120), String(b.telefono || '').slice(0, 30) || null, puesto.slice(0, 80), String(b.mensaje || '').slice(0, 1500) || null]);
    ok(res, { mensaje: '¡Recibimos tu postulación! Te contactaremos si tu perfil se ajusta a una búsqueda.' }, 201);
  }));

  app.get('/api/empleo', requiereAuth, soloRoles('ADMIN'), manejar(async (req, res) => {
    ok(res, (await db.query('SELECT * FROM postulaciones_empleo ORDER BY creado_en DESC')).rows);
  }));
}

module.exports = { registrar, requiereAuth, soloRoles, manejar, ok, fail, firmarAcceso, crearRefreshToken, alumnoVer, alumnoGestion };
