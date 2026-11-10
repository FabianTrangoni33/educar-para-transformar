/**
 * modulo-contacto.js - Consultas desde la página web (TP Parte 1: "contacto con el centro educativo
 * para realizar consultas mediante página web"). Las lee Administración en reportes.html.
 */
const db = require('./db');
const { requiereAuth, soloRoles, manejar, ok, fail } = require('./modulo-movil');

const MOTIVOS = ['INSCRIPCIONES', 'CUOTAS', 'INFORMACION', 'TRANSPORTE', 'OTRO'];

let tablaLista = null;
const asegurarTabla = () => (tablaLista ??= db.query(`
  CREATE TABLE IF NOT EXISTS consultas_web (
    id         SERIAL PRIMARY KEY,
    nombre     VARCHAR(100) NOT NULL,
    email      VARCHAR(120) NOT NULL,
    telefono   VARCHAR(30),
    motivo     VARCHAR(20) NOT NULL,
    mensaje    TEXT NOT NULL,
    atendida   BOOLEAN NOT NULL DEFAULT FALSE,
    creado_en  TIMESTAMPTZ DEFAULT now()
  )`).catch((e) => { tablaLista = null; throw e; }));

function registrar(app) {
  /** POST /api/consultas (público) */
  app.post('/api/consultas', manejar(async (req, res) => {
    await asegurarTabla();
    const b = req.body || {};
    const nombre = String(b.nombre || '').trim(), email = String(b.email || '').trim(), mensaje = String(b.mensaje || '').trim();
    const motivo = MOTIVOS.includes(String(b.motivo || '').toUpperCase()) ? String(b.motivo).toUpperCase() : 'OTRO';
    if (!nombre || !email || !mensaje) return fail(res, 'Completá nombre, correo y consulta.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 'El correo no es válido.');
    if (mensaje.length < 10) return fail(res, 'Contanos un poco más en la consulta (mínimo 10 caracteres).');
    await db.query('INSERT INTO consultas_web (nombre, email, telefono, motivo, mensaje) VALUES ($1, $2, $3, $4, $5)',
      [nombre.slice(0, 100), email.slice(0, 120), String(b.telefono || '').slice(0, 30) || null, motivo, mensaje.slice(0, 2000)]);
    ok(res, { mensaje: '¡Gracias! Recibimos tu consulta y te responderemos por correo a la brevedad.' }, 201);
  }));

  /** GET /api/consultas (Administración) */
  app.get('/api/consultas', requiereAuth, soloRoles('ADMIN'), manejar(async (req, res) => {
    await asegurarTabla();
    ok(res, (await db.query('SELECT * FROM consultas_web ORDER BY creado_en DESC LIMIT 500')).rows);
  }));

  /** PUT /api/consultas/:id { atendida } (Administración) */
  app.put('/api/consultas/:id', requiereAuth, soloRoles('ADMIN'), manejar(async (req, res) => {
    await asegurarTabla();
    const r = await db.query('UPDATE consultas_web SET atendida = $1 WHERE id = $2', [Boolean(req.body?.atendida), parseInt(req.params.id, 10)]);
    if (!r.rowCount) return fail(res, 'Consulta no encontrada', 404);
    ok(res, { mensaje: 'Consulta actualizada.' });
  }));
}

module.exports = { registrar };
