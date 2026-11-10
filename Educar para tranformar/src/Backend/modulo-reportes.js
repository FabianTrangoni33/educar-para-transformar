/**
 * modulo-reportes.js - Reportes para la Dirección (TP Parte 2 - Sistema de Gestión).
 * Todos requieren rol ADMIN.
 */
const db = require('./db');
const { requiereAuth, soloRoles, manejar, ok, fail } = require('./modulo-movil');

const ORDEN_DIAS = `ARRAY_POSITION(ARRAY['Lunes','Martes','Miércoles','Jueves','Viernes']::varchar[], h.dia_semana)`;
const nombreProf = (alias) => `NULLIF(TRIM(CONCAT(${alias}.nombre, ' ', ${alias}.apellido)), '')`;
const entero = (v) => (v != null && v !== '' ? parseInt(v, 10) : null);

function registrar(app) {
  const admin = [requiereAuth, soloRoles('ADMIN')];

  /** Por alumno: curso, materias, profesores, deportes con horarios, transporte y comedor */
  app.get('/api/reportes/alumno/:id', ...admin, manejar(async (req, res) => {
    const id = entero(req.params.id);
    const [al, materias, deportes, transporte, comedor] = await Promise.all([
      db.query(`SELECT a.id_alumno, a.legajo, a.dni, a.nombre, a.apellido, a.estado, c.nombre AS curso, c.division, n.nombre AS nivel
                FROM alumnos a LEFT JOIN cursos c ON c.id_curso = a.id_curso LEFT JOIN niveles n ON n.id_nivel = c.id_nivel
                WHERE a.id_alumno = $1`, [id]),
      db.query(`SELECT m.nombre AS materia, ${nombreProf('p')} AS profesor
                FROM alumnos a JOIN curso_materia cm ON cm.id_curso = a.id_curso JOIN materias m ON m.id_materia = cm.id_materia
                LEFT JOIN asignaciones_docente ad ON ad.id_materia = m.id_materia AND ad.id_curso = a.id_curso
                LEFT JOIN profesores p ON p.id_profesor = ad.id_profesor WHERE a.id_alumno = $1 ORDER BY m.nombre`, [id]),
      db.query(`SELECT d.nombre AS deporte, d.dia_semana, TO_CHAR(d.hora_inicio, 'HH24:MI') AS inicio, TO_CHAR(d.hora_fin, 'HH24:MI') AS fin,
                       ${nombreProf('p')} AS profesor
                FROM inscripciones_deporte i JOIN deportes d ON d.id_deporte = i.id_deporte
                LEFT JOIN profesores p ON p.id_profesor = d.id_profesor WHERE i.id_alumno = $1 ORDER BY d.nombre`, [id]),
      db.query(`SELECT t.recorrido_numero, r.nombre, t.parada FROM inscripciones_transporte t
                LEFT JOIN recorridos_transporte r ON r.numero = t.recorrido_numero WHERE t.id_alumno = $1`, [id]),
      db.query('SELECT modalidad, fecha_inscripcion FROM inscripciones_comedor WHERE id_alumno = $1', [id])
    ]);
    if (al.rowCount === 0) return fail(res, 'Alumno no encontrado', 404);
    ok(res, { alumno: al.rows[0], materias: materias.rows, deportes: deportes.rows, transporte: transporte.rows[0] || null, comedor: comedor.rows[0] || null });
  }));

  /** Por docente: cursos a cargo por nivel y horarios de cada curso */
  app.get('/api/reportes/docente/:id', ...admin, manejar(async (req, res) => {
    const id = entero(req.params.id);
    const prof = await db.query('SELECT id_profesor, legajo, nombre, apellido, especialidad FROM profesores WHERE id_profesor = $1', [id]);
    if (prof.rowCount === 0) return fail(res, 'Docente no encontrado', 404);
    const cursos = await db.query(`
      SELECT n.nombre AS nivel, c.nombre AS curso, c.division, m.nombre AS materia,
             COALESCE((SELECT JSON_AGG(JSON_BUILD_OBJECT('dia', h.dia_semana, 'inicio', TO_CHAR(h.hora_inicio, 'HH24:MI'), 'fin', TO_CHAR(h.hora_fin, 'HH24:MI'))
                                ORDER BY ${ORDEN_DIAS}, h.hora_inicio)
                       FROM horarios_curso h WHERE h.id_curso = c.id_curso AND h.id_materia = m.id_materia), '[]'::json) AS horarios
      FROM asignaciones_docente ad JOIN materias m ON m.id_materia = ad.id_materia
      LEFT JOIN cursos c ON c.id_curso = ad.id_curso LEFT JOIN niveles n ON n.id_nivel = COALESCE(c.id_nivel, m.id_nivel)
      WHERE ad.id_profesor = $1 ORDER BY n.id_nivel, c.id_curso, m.nombre`, [id]);
    ok(res, { docente: prof.rows[0], cursos: cursos.rows });
  }));

  /** Listado de alumnos por curso: nivel, curso, legajo, apellido, nombre (?id_curso opcional) */
  app.get('/api/reportes/alumnos-por-curso', ...admin, manejar(async (req, res) => {
    const r = await db.query(`
      SELECT n.nombre AS nivel, c.nombre AS curso, c.division, a.legajo, a.apellido, a.nombre
      FROM alumnos a JOIN cursos c ON c.id_curso = a.id_curso JOIN niveles n ON n.id_nivel = c.id_nivel
      WHERE ($1::int IS NULL OR c.id_curso = $1) ORDER BY n.id_nivel, c.anio_escolar, c.division, a.apellido, a.nombre`, [entero(req.query.id_curso)]);
    ok(res, r.rows);
  }));

  /** Listado de alumnos por materia: nivel, curso, materia, profesor a cargo, alumno, legajo (?id_materia opcional) */
  app.get('/api/reportes/alumnos-por-materia', ...admin, manejar(async (req, res) => {
    const r = await db.query(`
      SELECT n.nombre AS nivel, c.nombre AS curso, m.nombre AS materia, ${nombreProf('p')} AS profesor,
             a.apellido || ', ' || a.nombre AS alumno, a.legajo
      FROM alumnos a JOIN cursos c ON c.id_curso = a.id_curso JOIN niveles n ON n.id_nivel = c.id_nivel
      JOIN curso_materia cm ON cm.id_curso = c.id_curso JOIN materias m ON m.id_materia = cm.id_materia
      LEFT JOIN asignaciones_docente ad ON ad.id_materia = m.id_materia AND ad.id_curso = c.id_curso
      LEFT JOIN profesores p ON p.id_profesor = ad.id_profesor
      WHERE ($1::int IS NULL OR m.id_materia = $1) ORDER BY m.nombre, n.id_nivel, c.anio_escolar, alumno`, [entero(req.query.id_materia)]);
    ok(res, r.rows);
  }));

  /** Listado de docentes por nivel: nivel, profesor, materias a cargo, cursos (?id_nivel opcional) */
  app.get('/api/reportes/docentes-por-nivel', ...admin, manejar(async (req, res) => {
    const r = await db.query(`
      SELECT n.nombre AS nivel, p.apellido || ', ' || p.nombre AS profesor,
             STRING_AGG(DISTINCT m.nombre, ', ') AS materias, STRING_AGG(DISTINCT c.nombre, ', ') AS cursos
      FROM asignaciones_docente ad JOIN profesores p ON p.id_profesor = ad.id_profesor
      JOIN materias m ON m.id_materia = ad.id_materia LEFT JOIN cursos c ON c.id_curso = ad.id_curso
      JOIN niveles n ON n.id_nivel = COALESCE(c.id_nivel, m.id_nivel)
      WHERE ($1::int IS NULL OR n.id_nivel = $1)
      GROUP BY n.id_nivel, n.nombre, p.id_profesor ORDER BY n.id_nivel, profesor`, [entero(req.query.id_nivel)]);
    ok(res, r.rows);
  }));

  /**
   * Listado de alumnos por deporte (con nivel, horario y profesor a cargo).
   * Cubre: por deporte / por deporte y nivel / por deporte, nivel, horario y profesor. Filtros: ?id_deporte&id_nivel
   */
  app.get('/api/reportes/alumnos-por-deporte', ...admin, manejar(async (req, res) => {
    const r = await db.query(`
      SELECT d.nombre AS deporte, nd.nombre AS nivel_deporte, d.dia_semana,
             TO_CHAR(d.hora_inicio, 'HH24:MI') || '-' || TO_CHAR(d.hora_fin, 'HH24:MI') AS horario,
             ${nombreProf('p')} AS profesor, a.apellido || ', ' || a.nombre AS alumno, a.legajo, c.nombre AS curso, n.nombre AS nivel
      FROM inscripciones_deporte i JOIN deportes d ON d.id_deporte = i.id_deporte
      JOIN alumnos a ON a.id_alumno = i.id_alumno LEFT JOIN cursos c ON c.id_curso = a.id_curso
      LEFT JOIN niveles n ON n.id_nivel = c.id_nivel LEFT JOIN niveles nd ON nd.id_nivel = d.id_nivel
      LEFT JOIN profesores p ON p.id_profesor = d.id_profesor
      WHERE ($1::int IS NULL OR d.id_deporte = $1) AND ($2::int IS NULL OR c.id_nivel = $2)
      ORDER BY d.nombre, n.id_nivel, horario, profesor, alumno`, [entero(req.query.id_deporte), entero(req.query.id_nivel)]);
    ok(res, r.rows);
  }));

  /** Listado de alumnos por recorrido del transporte (?recorrido opcional) */
  app.get('/api/reportes/alumnos-por-recorrido', ...admin, manejar(async (req, res) => {
    const r = await db.query(`
      SELECT t.recorrido_numero AS recorrido, r.nombre AS recorrido_nombre, t.parada, a.apellido || ', ' || a.nombre AS alumno,
             a.legajo, c.nombre AS curso, n.nombre AS nivel
      FROM inscripciones_transporte t JOIN alumnos a ON a.id_alumno = t.id_alumno
      LEFT JOIN recorridos_transporte r ON r.numero = t.recorrido_numero
      LEFT JOIN cursos c ON c.id_curso = a.id_curso LEFT JOIN niveles n ON n.id_nivel = c.id_nivel
      WHERE ($1::int IS NULL OR t.recorrido_numero = $1) ORDER BY t.recorrido_numero, t.parada, alumno`, [entero(req.query.recorrido)]);
    ok(res, r.rows);
  }));

  /** Uso del comedor (valor agregado para la Dirección) */
  app.get('/api/reportes/comedor', ...admin, manejar(async (req, res) => {
    const r = await db.query(`
      SELECT n.nombre AS nivel, c.nombre AS curso, a.apellido || ', ' || a.nombre AS alumno, a.legajo, ic.modalidad, ic.fecha_inscripcion
      FROM inscripciones_comedor ic JOIN alumnos a ON a.id_alumno = ic.id_alumno
      LEFT JOIN cursos c ON c.id_curso = a.id_curso LEFT JOIN niveles n ON n.id_nivel = c.id_nivel
      ORDER BY n.id_nivel, c.anio_escolar, alumno`);
    ok(res, r.rows);
  }));

  /** Auditoría de operaciones (origen WEB / MOVIL) */
  app.get('/api/reportes/auditoria', ...admin, manejar(async (req, res) => {
    const r = await db.query(`
      SELECT au.creado_en, au.accion, au.origen, au.detalle, u.email
      FROM auditoria au LEFT JOIN usuarios u ON u.id_usuario = au.id_usuario ORDER BY au.creado_en DESC LIMIT 200`);
    ok(res, r.rows);
  }));
}

module.exports = { registrar };
