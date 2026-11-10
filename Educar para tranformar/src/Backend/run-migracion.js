/**
 * run-migracion.js - Aplica migracion_app_movil.sql sobre la base configurada en .env
 * y genera una grilla de horarios para los cursos que todavía no tienen.
 *
 * Uso: node run-migracion.js
 * Es seguro ejecutarlo varias veces: solo agrega lo que falta.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./db');

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const FRANJAS = [['08:00', '09:30'], ['09:45', '11:15'], ['11:30', '13:00']];

async function generarHorarios() {
  // Cursos con materias en su plan de estudios y sin horarios cargados
  const cursos = await db.query(`
    SELECT c.id_curso, ARRAY_AGG(cm.id_materia ORDER BY cm.id_materia) AS materias
    FROM cursos c
    JOIN curso_materia cm ON cm.id_curso = c.id_curso
    WHERE NOT EXISTS (SELECT 1 FROM horarios_curso h WHERE h.id_curso = c.id_curso)
    GROUP BY c.id_curso
  `);

  let insertados = 0;
  for (const { id_curso, materias } of cursos.rows) {
    let i = 0;
    for (const dia of DIAS) {
      for (const [ini, fin] of FRANJAS) {
        // Se rota el orden por día para que la grilla no quede igual todos los días
        const id_materia = materias[(i + DIAS.indexOf(dia)) % materias.length];
        await db.query(
          `INSERT INTO horarios_curso (id_curso, id_materia, dia_semana, hora_inicio, hora_fin, aula)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
          [id_curso, id_materia, dia, ini, fin, `Aula ${100 + id_curso}`]
        );
        insertados++;
        i++;
      }
    }
  }
  return { cursos: cursos.rows.length, insertados };
}

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, 'migracion_app_movil.sql'), 'utf8');
  console.log('Aplicando migracion_app_movil.sql ...');
  await db.query(sql);
  console.log('Migración aplicada.');

  const h = await generarHorarios();
  console.log(`Horarios generados: ${h.insertados} bloques para ${h.cursos} curso(s).`);

  await db.pool.end();
})().catch(async (e) => {
  console.error('Error en la migración:', e.message);
  await db.pool.end();
  process.exit(1);
});
