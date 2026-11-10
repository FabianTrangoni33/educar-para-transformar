/**
 * modulo-salud.js - Ficha de salud del alumno y resumen de administración para la app.
 *
 * Ficha de salud (datos sensibles, Ley 25.326):
 *   - La familia (PADRE del alumno) la completa y actualiza; administración también puede editarla.
 *   - El alumno puede verla (solo lectura).
 *   - El docente solo la ve si dicta alguna materia en el curso del alumno.
 *   - Cada consulta de docentes/administración y cada cambio quedan en la auditoría.
 *   - Nunca se envía por notificaciones ni correos.
 *
 * Resumen de administración (app): indicadores del día para el rol ADMIN.
 */
const db = require('./db');
const reglas = require('./reglas-negocio');
const { requiereAuth, soloRoles, manejar, ok, fail } = require('./modulo-movil');

const GRUPOS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', '0+', '0-'];
const TEXTOS = { alergias: 500, medicacion: 500, condiciones: 500, obra_social: 100, nro_afiliado: 50,
  emergencia_nombre: 100, emergencia_telefono: 30, emergencia_parentesco: 40, observaciones: 800 };

let tablasListas = null;
function asegurarTablas() {
  tablasListas ??= db.query(`
    CREATE TABLE IF NOT EXISTS fichas_salud (
      id_alumno             INT PRIMARY KEY REFERENCES alumnos(id_alumno) ON DELETE CASCADE,
      grupo_sanguineo       VARCHAR(4),
      alergias              VARCHAR(500),
      medicacion            VARCHAR(500),
      condiciones           VARCHAR(500),
      obra_social           VARCHAR(100),
      nro_afiliado          VARCHAR(50),
      emergencia_nombre     VARCHAR(100),
      emergencia_telefono   VARCHAR(30),
      emergencia_parentesco VARCHAR(40),
      observaciones         VARCHAR(800),
      autoriza_imagen       BOOLEAN NOT NULL DEFAULT FALSE,
      autoriza_salidas      BOOLEAN NOT NULL DEFAULT FALSE,
      actualizado_por       INT REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
      actualizado_en        TIMESTAMPTZ DEFAULT now()
    );
  `).catch((e) => { tablasListas = null; throw e; });
  return tablasListas;
}
const conTablas = (fn) => manejar(async (req, res) => { await asegurarTablas(); return fn(req, res); });

/** Docente con al menos una materia en el curso del alumno */
async function esDocenteDelAlumno(idUsuario, idAlumno) {
  const r = await db.query(`
    SELECT 1 FROM alumnos a
    JOIN asignaciones_docente ad ON ad.id_curso = a.id_curso
    JOIN profesores p ON p.id_profesor = ad.id_profesor
    WHERE a.id_alumno = $1 AND p.id_usuario = $2 LIMIT 1`, [idAlumno, idUsuario]);
  return r.rowCount > 0;
}

async function puedeVerFicha(usuario, idAlumno) {
  if (await reglas.puedeVerAlumno(usuario, idAlumno)) return true;
  return String(usuario.rol).toUpperCase() === 'DOCENTE' && esDocenteDelAlumno(usuario.id_usuario, idAlumno);
}

function validar(b) {
  const datos = {};
  const errores = [];
  const grupo = String(b.grupo_sanguineo || '').trim().toUpperCase().replace('O', '0');
  if (grupo && !GRUPOS.includes(grupo)) errores.push('El grupo sanguíneo no es válido.');
  datos.grupo_sanguineo = grupo || null;
  for (const [campo, max] of Object.entries(TEXTOS)) {
    const v = String(b[campo] ?? '').trim();
    if (v.length > max) errores.push(`El campo ${campo.replace(/_/g, ' ')} supera los ${max} caracteres.`);
    datos[campo] = v || null;
  }
  if (datos.emergencia_telefono && !/^[\d\s()+-]{6,30}$/.test(datos.emergencia_telefono)) errores.push('El teléfono de emergencia no es válido.');
  if (!datos.emergencia_nombre || !datos.emergencia_telefono) errores.push('Indicá un contacto de emergencia con nombre y teléfono.');
  datos.autoriza_imagen = b.autoriza_imagen === true;
  datos.autoriza_salidas = b.autoriza_salidas === true;
  return { datos, errores };
}

function registrar(app) {
  /** GET /api/movil/alumnos/:id/salud → ficha (o null si todavía no se cargó) */
  app.get('/api/movil/alumnos/:id/salud', requiereAuth, conTablas(async (req, res) => {
    const idAlumno = parseInt(req.params.id, 10);
    if (!Number.isInteger(idAlumno)) return fail(res, 'Alumno inválido.');
    if (!(await puedeVerFicha(req.usuario, idAlumno))) return fail(res, 'Sin acceso a la ficha de este alumno.', 403);
    const r = await db.query(`
      SELECT f.*, u.nombre || ' ' || u.apellido AS actualizado_por_nombre
      FROM fichas_salud f LEFT JOIN usuarios u ON u.id_usuario = f.actualizado_por
      WHERE f.id_alumno = $1`, [idAlumno]);
    const rol = String(req.usuario.rol).toUpperCase();
    if (rol === 'DOCENTE' || rol === 'ADMIN') await reglas.auditar(req, 'VER_FICHA_SALUD', { id_alumno: idAlumno });
    const puedeEditar = await reglas.puedeGestionarAlumno(req.usuario, idAlumno);
    ok(res, { ficha: r.rows[0] || null, puede_editar: puedeEditar });
  }));

  /** PUT /api/movil/alumnos/:id/salud → crea o actualiza la ficha (familia del alumno o administración) */
  app.put('/api/movil/alumnos/:id/salud', requiereAuth, soloRoles('PADRE', 'ADMIN'), conTablas(async (req, res) => {
    const idAlumno = parseInt(req.params.id, 10);
    if (!Number.isInteger(idAlumno)) return fail(res, 'Alumno inválido.');
    if (!(await reglas.puedeGestionarAlumno(req.usuario, idAlumno))) return fail(res, 'Solo la familia del alumno o administración pueden editar la ficha.', 403);
    const { datos, errores } = validar(req.body || {});
    if (errores.length) return fail(res, errores.join(' '));
    const campos = Object.keys(datos);
    const valores = campos.map(c => datos[c]);
    await db.query(`
      INSERT INTO fichas_salud (id_alumno, ${campos.join(', ')}, actualizado_por, actualizado_en)
      VALUES ($1, ${campos.map((_, i) => '$' + (i + 2)).join(', ')}, $${campos.length + 2}, now())
      ON CONFLICT (id_alumno) DO UPDATE SET ${campos.map(c => `${c} = EXCLUDED.${c}`).join(', ')},
        actualizado_por = EXCLUDED.actualizado_por, actualizado_en = now()`,
      [idAlumno, ...valores, req.usuario.id_usuario]);
    await reglas.auditar(req, 'EDITAR_FICHA_SALUD', { id_alumno: idAlumno });
    ok(res, { mensaje: 'Ficha de salud guardada.' });
  }));

  /** GET /api/movil/admin/resumen → indicadores para el inicio del administrador en la app */
  app.get('/api/movil/admin/resumen', requiereAuth, soloRoles('ADMIN'), manejar(async (req, res) => {
    const existe = async (t) => (await db.query('SELECT to_regclass($1) IS NOT NULL AS e', [t])).rows[0].e;
    const [base, comp] = await Promise.all([
      db.query(`SELECT
          (SELECT COUNT(*) FROM alumnos WHERE estado = 'ACTIVO')::int AS alumnos,
          (SELECT COUNT(*) FROM profesores)::int AS docentes,
          (SELECT COUNT(*) FROM preinscripciones WHERE estado = 'Pendiente')::int AS preinscripciones`),
      db.query(`SELECT COUNT(*)::int AS cantidad, COALESCE(SUM(monto), 0)::float AS monto FROM comprobantes_pago WHERE estado = 'PENDIENTE'`)
    ]);
    let presentes = null, consultas = null;
    if (await existe('public.movimientos_alumno')) {
      presentes = (await db.query(`
        SELECT COUNT(DISTINCT id_alumno)::int AS n FROM movimientos_alumno
        WHERE tipo = 'INGRESO' AND ((creado_en AT TIME ZONE 'UTC') - INTERVAL '3 hours')::date = ((now() AT TIME ZONE 'UTC') - INTERVAL '3 hours')::date`)).rows[0].n;
    }
    if (await existe('public.consultas_web')) {
      consultas = (await db.query('SELECT COUNT(*)::int AS n FROM consultas_web WHERE NOT atendida')).rows[0].n;
    }
    ok(res, { ...base.rows[0], comprobantes_pendientes: comp.rows[0].cantidad, monto_pendiente: comp.rows[0].monto,
      presentes_hoy: presentes ?? 0, consultas_pendientes: consultas ?? 0 });
  }));
}

module.exports = { registrar, asegurarTablas };
