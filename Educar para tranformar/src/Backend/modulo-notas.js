/**
 * modulo-notas.js - Calificaciones para la app y el boletín en PDF.
 *
 * - Docente (app): planilla por curso y materia, y guardado de notas (crear, corregir o borrar).
 * - Familia / alumno (app y web): boletín oficial en PDF.
 * - permisoNotas(): regla compartida con los endpoints web de calificaciones. Un docente solo
 *   califica materias que dicta en el curso del alumno; administración puede calificar todo.
 */
const PDFDocument = require('pdfkit');
const db = require('./db');
const reglas = require('./reglas-negocio');
const { notificar } = require('./notificaciones');
const { requiereAuth, soloRoles, manejar, ok, fail } = require('./modulo-movil');

/** El docente dicta la materia en el curso: asignada a ese curso, o sin curso fijo y el curso tiene la materia */
async function dictaMateriaEnCurso(idUsuario, idMateria, idCurso) {
  const r = await db.query(`
    SELECT 1 FROM asignaciones_docente ad
    JOIN profesores p ON p.id_profesor = ad.id_profesor
    WHERE p.id_usuario = $1 AND ad.id_materia = $2
      AND (ad.id_curso = $3 OR (ad.id_curso IS NULL AND EXISTS (
            SELECT 1 FROM curso_materia cm WHERE cm.id_materia = ad.id_materia AND cm.id_curso = $3)))
    LIMIT 1`, [idUsuario, idMateria, idCurso]);
  return r.rowCount > 0;
}

/**
 * Verifica que el usuario pueda calificar cada par alumno/materia.
 * Devuelve null si puede, o un mensaje de error.
 */
async function permisoNotas(usuario, items) {
  const rol = String(usuario?.rol || '').toUpperCase();
  if (rol === 'ADMIN') return null;
  if (rol !== 'DOCENTE') return 'Solo los docentes pueden cargar calificaciones.';
  const cursos = new Map();
  for (const it of items) {
    const idAlumno = parseInt(it.id_alumno, 10), idMateria = parseInt(it.id_materia, 10);
    if (!cursos.has(idAlumno)) {
      const a = (await db.query('SELECT id_curso FROM alumnos WHERE id_alumno = $1', [idAlumno])).rows[0];
      cursos.set(idAlumno, a ? a.id_curso : null);
    }
    const idCurso = cursos.get(idAlumno);
    if (!idCurso || !(await dictaMateriaEnCurso(usuario.id_usuario, idMateria, idCurso))) {
      return 'Solo podés calificar las materias que dictás en el curso del alumno.';
    }
  }
  return null;
}

/** Middleware para los endpoints web existentes (/api/calificaciones, /lote y /planilla) */
const exigirPermisoNotas = [requiereAuth, soloRoles('DOCENTE', 'ADMIN'), async (req, res, next) => {
  try {
    if (req.method === 'GET') {
      const idCurso = parseInt(req.query.id_curso, 10), idMateria = parseInt(req.query.id_materia, 10);
      if (String(req.usuario.rol).toUpperCase() === 'DOCENTE' && Number.isInteger(idCurso) && Number.isInteger(idMateria)
          && !(await dictaMateriaEnCurso(req.usuario.id_usuario, idMateria, idCurso))) {
        return fail(res, 'Solo podés ver la planilla de las materias que dictás en ese curso.', 403);
      }
      return next();
    }
    const items = Array.isArray(req.body?.calificaciones) ? req.body.calificaciones : [req.body || {}];
    if (items.some(i => !i.id_alumno || !i.id_materia)) return next();   // el endpoint informa el dato faltante
    const error = await permisoNotas(req.usuario, items);
    if (error) return fail(res, error, 403);
    next();
  } catch (e) {
    console.error('[Permiso notas]', e);
    fail(res, 'Error interno del servidor', 500);
  }
}];

async function planilla(idCurso, idMateria) {
  const [c, m, al] = await Promise.all([
    db.query('SELECT id_curso, nombre, division FROM cursos WHERE id_curso = $1', [idCurso]),
    db.query('SELECT id_materia, nombre FROM materias WHERE id_materia = $1', [idMateria]),
    db.query(`
      SELECT a.id_alumno, a.legajo, a.nombre, a.apellido,
             MAX(CASE WHEN cal.trimestre = 1 THEN cal.nota END)::float AS t1,
             MAX(CASE WHEN cal.trimestre = 2 THEN cal.nota END)::float AS t2,
             MAX(CASE WHEN cal.trimestre = 3 THEN cal.nota END)::float AS t3,
             MAX(CASE WHEN cal.trimestre = 1 THEN cal.observacion END) AS obs1,
             MAX(CASE WHEN cal.trimestre = 2 THEN cal.observacion END) AS obs2,
             MAX(CASE WHEN cal.trimestre = 3 THEN cal.observacion END) AS obs3
      FROM alumnos a
      JOIN curso_materia cm ON cm.id_curso = a.id_curso AND cm.id_materia = $2
      LEFT JOIN calificaciones cal ON cal.id_alumno = a.id_alumno AND cal.id_materia = $2
      WHERE a.id_curso = $1 AND a.estado = 'ACTIVO'
      GROUP BY a.id_alumno ORDER BY a.apellido, a.nombre`, [idCurso, idMateria])
  ]);
  if (!c.rows[0] || !m.rows[0]) return null;
  return { curso: c.rows[0], materia: m.rows[0], alumnos: al.rows };
}

// ─── Boletín ────────────────────────────────────────────────────────────────

async function datosBoletin(idAlumno) {
  const a = (await db.query(`
    SELECT a.id_alumno, a.legajo, a.dni, a.nombre, a.apellido, c.nombre AS curso, c.division, n.nombre AS nivel, ci.nombre AS ciclo
    FROM alumnos a LEFT JOIN cursos c ON c.id_curso = a.id_curso
    LEFT JOIN niveles n ON n.id_nivel = c.id_nivel LEFT JOIN ciclos ci ON ci.id_ciclo = c.id_ciclo
    WHERE a.id_alumno = $1`, [idAlumno])).rows[0];
  if (!a) return null;
  const materias = (await db.query(`
    SELECT m.nombre AS materia,
           MAX(CASE WHEN cal.trimestre = 1 THEN cal.nota END)::float AS t1,
           MAX(CASE WHEN cal.trimestre = 2 THEN cal.nota END)::float AS t2,
           MAX(CASE WHEN cal.trimestre = 3 THEN cal.nota END)::float AS t3
    FROM alumnos al
    JOIN curso_materia cm ON cm.id_curso = al.id_curso
    JOIN materias m ON m.id_materia = cm.id_materia
    LEFT JOIN calificaciones cal ON cal.id_alumno = al.id_alumno AND cal.id_materia = m.id_materia
    WHERE al.id_alumno = $1
    GROUP BY m.id_materia ORDER BY m.nombre`, [idAlumno])).rows;
  return { alumno: a, materias };
}

const nota = (n) => (n == null ? '-' : Number(n).toFixed(2).replace('.', ','));
const promedio = (m) => {
  const v = [m.t1, m.t2, m.t3].filter(x => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

function boletinPDF({ alumno: a, materias }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const partes = [];
    doc.on('data', (p) => partes.push(p));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const azul = '#0B2545', naranja = '#F97316';
    doc.rect(0, 0, doc.page.width, 8).fill(naranja);
    doc.fillColor(azul).fontSize(20).text('Centro Educativo "Educar para Transformar"', 50, 40);
    doc.fillColor('#555').fontSize(9).text('Resistencia, Chaco  ·  Ciclo lectivo 2027');
    doc.moveDown(1.2);
    doc.fillColor('#000').fontSize(16).text('Boletín de calificaciones');
    doc.fontSize(10).fillColor('#333')
      .text(`Alumno/a: ${a.apellido}, ${a.nombre}    Legajo: ${a.legajo}    DNI: ${a.dni}`)
      .text(`Curso: ${a.curso || 'Sin curso'}${a.division ? ' "' + a.division + '"' : ''}${a.nivel ? '  ·  Nivel ' + a.nivel : ''}${a.ciclo ? '  ·  ' + a.ciclo : ''}`);
    doc.moveDown(1);

    const x = 50, cols = [230, 60, 60, 60, 85];
    const titulos = ['Materia', '1° trim.', '2° trim.', '3° trim.', 'Promedio'];
    let y = doc.y;
    doc.rect(x, y, 495, 22).fill(azul);
    let cx = x;
    doc.fillColor('#fff').fontSize(10);
    titulos.forEach((t, i) => { doc.text(t, cx + 6, y + 6, { width: cols[i] - 12, align: i ? 'center' : 'left' }); cx += cols[i]; });
    y += 28;
    doc.fillColor('#000');
    if (!materias.length) doc.text('El curso todavía no tiene materias asignadas.', x + 6, y);
    for (const m of materias) {
      const p = promedio(m);
      const fila = [m.materia, nota(m.t1), nota(m.t2), nota(m.t3), nota(p)];
      cx = x;
      fila.forEach((t, i) => {
        doc.fillColor(i === 4 && p != null ? (p >= 6 ? '#1e7e34' : '#b42318') : '#000')
          .text(t, cx + 6, y, { width: cols[i] - 12, align: i ? 'center' : 'left' });
        cx += cols[i];
      });
      y += 22;
      doc.moveTo(x, y - 5).lineTo(x + 495, y - 5).strokeColor('#ddd').stroke();
      if (y > 740) { doc.addPage(); y = 60; }
    }
    doc.fillColor('#333').fontSize(9).text(
      `Escala de 1 a 10. Se aprueba con promedio 6 o más. Emitido el ${new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}.`,
      x, y + 16, { width: 495 });
    doc.end();
  });
}

function registrar(app) {
  /** GET /api/movil/docente/planilla?id_curso&id_materia */
  app.get('/api/movil/docente/planilla', requiereAuth, soloRoles('DOCENTE'), manejar(async (req, res) => {
    const idCurso = parseInt(req.query.id_curso, 10), idMateria = parseInt(req.query.id_materia, 10);
    if (!Number.isInteger(idCurso) || !Number.isInteger(idMateria)) return fail(res, 'Indicá curso y materia.');
    if (!(await dictaMateriaEnCurso(req.usuario.id_usuario, idMateria, idCurso))) return fail(res, 'No dictás esa materia en ese curso.', 403);
    const p = await planilla(idCurso, idMateria);
    if (!p) return fail(res, 'Curso o materia inexistente.', 404);
    ok(res, p);
  }));

  /**
   * PUT /api/movil/docente/calificaciones
   * { id_curso, id_materia, notas: [{ id_alumno, trimestre, nota (1-10 o null para borrar), observacion }] }
   */
  app.put('/api/movil/docente/calificaciones', requiereAuth, soloRoles('DOCENTE'), manejar(async (req, res) => {
    const b = req.body || {};
    const idCurso = parseInt(b.id_curso, 10), idMateria = parseInt(b.id_materia, 10);
    if (!Number.isInteger(idCurso) || !Number.isInteger(idMateria)) return fail(res, 'Indicá curso y materia.');
    if (!(await dictaMateriaEnCurso(req.usuario.id_usuario, idMateria, idCurso))) return fail(res, 'No dictás esa materia en ese curso.', 403);
    const notas = Array.isArray(b.notas) ? b.notas : [];
    if (!notas.length) return fail(res, 'No hay cambios para guardar.');
    if (notas.length > 300) return fail(res, 'Demasiadas notas en un solo envío.');

    const delCurso = new Set((await db.query(`SELECT a.id_alumno FROM alumnos a JOIN curso_materia cm ON cm.id_curso = a.id_curso
      WHERE a.id_curso = $1 AND cm.id_materia = $2`, [idCurso, idMateria])).rows.map(r => r.id_alumno));
    for (const n of notas) {
      const t = parseInt(n.trimestre, 10);
      if (!delCurso.has(parseInt(n.id_alumno, 10))) return fail(res, 'Hay alumnos que no pertenecen a ese curso.');
      if (![1, 2, 3].includes(t)) return fail(res, 'El trimestre debe ser 1, 2 o 3.');
      if (n.nota != null && n.nota !== '') {
        const v = Number(String(n.nota).replace(',', '.'));
        if (!Number.isFinite(v) || v < 1 || v > 10) return fail(res, 'Las notas deben estar entre 1 y 10.');
      }
    }

    const cliente = await db.getClient();
    const cargadas = new Map();   // id_alumno → [trimestres con nota nueva]
    try {
      await cliente.query('BEGIN');
      for (const n of notas) {
        const idAlumno = parseInt(n.id_alumno, 10), t = parseInt(n.trimestre, 10);
        if (n.nota == null || n.nota === '') {
          await cliente.query('DELETE FROM calificaciones WHERE id_alumno = $1 AND id_materia = $2 AND trimestre = $3', [idAlumno, idMateria, t]);
          continue;
        }
        const v = Math.round(Number(String(n.nota).replace(',', '.')) * 100) / 100;
        await cliente.query(`
          INSERT INTO calificaciones (id_alumno, id_materia, trimestre, nota, observacion) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id_alumno, id_materia, trimestre) DO UPDATE SET nota = EXCLUDED.nota, observacion = EXCLUDED.observacion, fecha = CURRENT_TIMESTAMP`,
          [idAlumno, idMateria, t, v, String(n.observacion || '').trim().slice(0, 100) || null]);
        cargadas.set(idAlumno, [...(cargadas.get(idAlumno) || []), t]);
      }
      await cliente.query('COMMIT');
    } catch (e) {
      await cliente.query('ROLLBACK');
      throw e;
    } finally { cliente.release(); }

    await reglas.auditar(req, 'CARGA_NOTAS', { id_curso: idCurso, id_materia: idMateria, cantidad: notas.length });
    const materia = (await db.query('SELECT nombre FROM materias WHERE id_materia = $1', [idMateria])).rows[0]?.nombre || 'una materia';
    for (const [idAlumno, trims] of cargadas) {
      await notificar(await reglas.usuariosRelacionados(idAlumno), {
        titulo: 'Nueva calificación',
        cuerpo: `Se cargó la nota de ${materia} (${[...new Set(trims)].sort().join('°, ')}° trimestre). Abrí la app para verla.`,
        tipo: 'NOTA', datos: { pantalla: 'notas', id_alumno: idAlumno }
      }).catch(() => {});
    }
    ok(res, { mensaje: `Se guardaron ${notas.length} cambio(s) en las calificaciones.` });
  }));

  /** GET /api/movil/alumnos/:id/boletin/pdf → boletín oficial (familia, el alumno o administración) */
  app.get('/api/movil/alumnos/:id/boletin/pdf', requiereAuth, manejar(async (req, res) => {
    const idAlumno = parseInt(req.params.id, 10);
    if (!Number.isInteger(idAlumno)) return fail(res, 'Alumno inválido.');
    if (!(await reglas.puedeVerAlumno(req.usuario, idAlumno))) return fail(res, 'Sin acceso al boletín de este alumno.', 403);
    const datos = await datosBoletin(idAlumno);
    if (!datos) return fail(res, 'Alumno no encontrado.', 404);
    const pdf = await boletinPDF(datos);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Boletin-${datos.alumno.legajo}.pdf"` }).send(pdf);
  }));
}

module.exports = { registrar, exigirPermisoNotas, permisoNotas, dictaMateriaEnCurso };
