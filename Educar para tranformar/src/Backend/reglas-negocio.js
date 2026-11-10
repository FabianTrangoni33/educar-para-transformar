/**
 * reglas-negocio.js - Reglas de negocio compartidas por la web y la app móvil.
 *
 * Fuente única de verdad: tanto las rutas viejas de la web como las nuevas de la app
 * llaman a estas funciones, así ambos clientes aplican exactamente las mismas validaciones.
 */
const db = require('./db');

const MAX_DEPORTES = 2;

/** Error de negocio: se responde al cliente con su status y mensaje. */
class ErrorNegocio extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

// ─── PERMISOS POR ALUMNO ────────────────────────────────────────────────────

/**
 * Devuelve true si el usuario puede CONSULTAR los datos del alumno:
 * ADMIN siempre, PADRE solo sus hijos, ESTUDIANTE solo a sí mismo.
 */
async function puedeVerAlumno(usuario, idAlumno) {
  const rol = (usuario?.rol || '').toUpperCase();
  if (rol === 'ADMIN') return true;
  if (rol === 'PADRE') return esHijoDe(usuario.id_usuario, idAlumno);
  if (rol === 'ESTUDIANTE') {
    const r = await db.query('SELECT 1 FROM alumnos WHERE id_alumno = $1 AND id_usuario = $2', [idAlumno, usuario.id_usuario]);
    return r.rowCount > 0;
  }
  return false;
}

/** Devuelve true si el usuario puede GESTIONAR (inscribir, pagar): ADMIN o el padre del alumno. */
async function puedeGestionarAlumno(usuario, idAlumno) {
  const rol = (usuario?.rol || '').toUpperCase();
  if (rol === 'ADMIN') return true;
  if (rol === 'PADRE') return esHijoDe(usuario.id_usuario, idAlumno);
  return false;
}

async function esHijoDe(idUsuarioPadre, idAlumno) {
  const r = await db.query(`
    SELECT 1 FROM tutor_alumno ta
    JOIN tutores t ON t.id_tutor = ta.id_tutor
    WHERE t.id_usuario = $1 AND ta.id_alumno = $2`, [idUsuarioPadre, idAlumno]);
  return r.rowCount > 0;
}

/** Usuarios (padres y el propio alumno) a los que hay que avisar de cambios de un alumno. */
async function usuariosRelacionados(idAlumno) {
  const r = await db.query(`
    SELECT t.id_usuario FROM tutor_alumno ta JOIN tutores t ON t.id_tutor = ta.id_tutor WHERE ta.id_alumno = $1
    UNION
    SELECT a.id_usuario FROM alumnos a WHERE a.id_alumno = $1 AND a.id_usuario IS NOT NULL`, [idAlumno]);
  return r.rows.map(x => x.id_usuario);
}

// ─── DEPORTES ───────────────────────────────────────────────────────────────

const quitarAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** "Lunes y Miércoles" → Set{'lunes','miercoles'} (acepta "y", "e", comas y "/") */
function diasDe(texto) {
  return new Set(
    quitarAcentos(String(texto || '').toLowerCase())
      .split(/\s*(?:,|\/|\by\b|\be\b)\s*/)
      .map(s => s.trim())
      .filter(Boolean)
  );
}

/** Dos actividades se superponen si comparten algún día y sus franjas horarias se cruzan. */
function seSuperponen(a, b) {
  const diasA = diasDe(a.dia_semana);
  const comparten = [...diasDe(b.dia_semana)].some(d => diasA.has(d));
  if (!comparten) return false;
  return a.hora_inicio < b.hora_fin && a.hora_fin > b.hora_inicio;
}

/**
 * Inscribe un alumno a un deporte validando todas las reglas:
 * máximo 2 deportes, sin duplicados, sin superposición horaria, cupo y nivel del deporte.
 */
async function inscribirDeporte(idAlumno, idDeporte) {
  idAlumno = parseInt(idAlumno, 10);
  idDeporte = parseInt(idDeporte, 10);
  if (!idAlumno || !idDeporte) throw new ErrorNegocio('Faltan id_alumno e id_deporte');

  const cliente = await db.getClient();
  try {
    await cliente.query('BEGIN');
    // Bloquea al alumno para que dos pedidos simultáneos no superen el máximo
    const alumno = await cliente.query(`
      SELECT a.id_alumno, c.id_nivel FROM alumnos a
      LEFT JOIN cursos c ON c.id_curso = a.id_curso
      WHERE a.id_alumno = $1 FOR UPDATE OF a`, [idAlumno]);
    if (alumno.rowCount === 0) throw new ErrorNegocio('Alumno no encontrado', 404);

    const dep = await cliente.query('SELECT * FROM deportes WHERE id_deporte = $1', [idDeporte]);
    if (dep.rowCount === 0) throw new ErrorNegocio('Deporte no encontrado', 404);
    const nuevo = dep.rows[0];

    const actuales = (await cliente.query(`
      SELECT d.* FROM inscripciones_deporte i JOIN deportes d ON d.id_deporte = i.id_deporte
      WHERE i.id_alumno = $1`, [idAlumno])).rows;

    if (actuales.some(d => d.id_deporte === idDeporte)) {
      throw new ErrorNegocio('El alumno ya está inscripto en este deporte.', 409);
    }
    if (actuales.length >= MAX_DEPORTES) {
      throw new ErrorNegocio(`El alumno ya alcanzó el máximo de ${MAX_DEPORTES} deportes extracurriculares permitidos.`, 409);
    }
    const nivelAlumno = alumno.rows[0].id_nivel;
    if (nuevo.id_nivel && nivelAlumno && nuevo.id_nivel !== nivelAlumno) {
      throw new ErrorNegocio('Este grupo del deporte corresponde a otro nivel educativo.', 409);
    }
    const choque = actuales.find(d => seSuperponen(d, nuevo));
    if (choque) {
      throw new ErrorNegocio(
        `Superposición horaria: ${nuevo.nombre} (${nuevo.dia_semana} ${nuevo.hora_inicio.slice(0, 5)}-${nuevo.hora_fin.slice(0, 5)}) ` +
        `se cruza con ${choque.nombre} (${choque.dia_semana} ${choque.hora_inicio.slice(0, 5)}-${choque.hora_fin.slice(0, 5)}).`, 409);
    }
    const inscriptos = await cliente.query('SELECT COUNT(*)::int AS n FROM inscripciones_deporte WHERE id_deporte = $1', [idDeporte]);
    if (inscriptos.rows[0].n >= nuevo.cupo_maximo) {
      throw new ErrorNegocio(`No hay cupo disponible en ${nuevo.nombre}.`, 409);
    }

    await cliente.query('INSERT INTO inscripciones_deporte (id_alumno, id_deporte) VALUES ($1, $2)', [idAlumno, idDeporte]);
    await cliente.query('COMMIT');
    return nuevo;
  } catch (e) {
    await cliente.query('ROLLBACK').catch(() => {});
    if (e.code === '23505') throw new ErrorNegocio('El alumno ya está inscripto en este deporte.', 409);
    throw e;
  } finally {
    cliente.release();
  }
}

async function desinscribirDeporte(idAlumno, idDeporte) {
  const r = await db.query('DELETE FROM inscripciones_deporte WHERE id_alumno = $1 AND id_deporte = $2',
    [parseInt(idAlumno, 10), parseInt(idDeporte, 10)]);
  if (r.rowCount === 0) throw new ErrorNegocio('El alumno no estaba inscripto en ese deporte.', 404);
}

// ─── TRANSPORTE Y COMEDOR ───────────────────────────────────────────────────

/** Una única inscripción activa: si ya existe, se modifica el recorrido (no se duplica). */
async function asignarTransporte(idAlumno, recorridoNumero, parada) {
  const rec = await db.query('SELECT * FROM recorridos_transporte WHERE numero = $1', [parseInt(recorridoNumero, 10)]);
  if (rec.rowCount === 0) throw new ErrorNegocio('El recorrido debe ser 1, 2, 3 o 4.');
  const recorrido = rec.rows[0];
  const paradaFinal = parada || recorrido.paradas[0];
  if (!recorrido.paradas.includes(paradaFinal)) throw new ErrorNegocio('La parada no pertenece a ese recorrido.');

  const previo = await db.query('SELECT recorrido_numero FROM inscripciones_transporte WHERE id_alumno = $1', [idAlumno]);
  const r = await db.query(`
    INSERT INTO inscripciones_transporte (id_alumno, recorrido_numero, zona, parada)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (id_alumno) DO UPDATE SET recorrido_numero = EXCLUDED.recorrido_numero,
      zona = EXCLUDED.zona, parada = EXCLUDED.parada, fecha_inscripcion = CURRENT_TIMESTAMP
    RETURNING *`, [idAlumno, recorrido.numero, recorrido.zona, paradaFinal]);
  return { inscripcion: r.rows[0], recorrido, modificado: previo.rowCount > 0 };
}

async function inscribirComedor(idAlumno, modalidad = 'ALMUERZO') {
  try {
    const r = await db.query(
      'INSERT INTO inscripciones_comedor (id_alumno, modalidad) VALUES ($1, $2) RETURNING *',
      [idAlumno, modalidad]);
    return r.rows[0];
  } catch (e) {
    if (e.code === '23505') throw new ErrorNegocio('El alumno ya está inscripto en el comedor.', 409);
    if (e.code === '23503') throw new ErrorNegocio('Alumno no encontrado', 404);
    throw e;
  }
}

// ─── AUDITORÍA ──────────────────────────────────────────────────────────────

/** Origen de la operación: la app envía la cabecera "X-Cliente: movil". */
const origenDe = (req) => ((req.get('X-Cliente') || '').toLowerCase() === 'movil' ? 'MOVIL' : 'WEB');

async function auditar(req, accion, detalle) {
  try {
    await db.query('INSERT INTO auditoria (id_usuario, accion, detalle, origen) VALUES ($1, $2, $3, $4)',
      [req.usuario?.id_usuario || null, accion, detalle ? JSON.stringify(detalle) : null, origenDe(req)]);
  } catch (e) {
    console.error('[Auditoría] No se pudo registrar:', e.message);
  }
}

module.exports = {
  ErrorNegocio, MAX_DEPORTES,
  puedeVerAlumno, puedeGestionarAlumno, usuariosRelacionados,
  diasDe, seSuperponen, inscribirDeporte, desinscribirDeporte,
  asignarTransporte, inscribirComedor,
  origenDe, auditar
};
