/**
 * modulo-pagos.js - Gestión de cuotas, facturas y pagos por transferencia (TP Parte 3).
 *
 * Reglas implementadas:
 *  - Solo el administrador define los valores (cuota por nivel, cada deporte, cada recorrido y comedor).
 *  - Cada mes se emite una factura por alumno con sus ítems: cuota + deportes + transporte (opcional) + comedor.
 *  - No hay pagos en efectivo: solo transferencia. El padre carga el comprobante, elige los ítems
 *    que paga y el sistema emite un comprobante de pago numerado. Una factura admite varios comprobantes.
 *  - Administración aprueba o rechaza cada comprobante; solo lo aprobado cuenta como pagado.
 *  - Mails: recordatorio el último día hábil del mes (con la factura en PDF) y aviso de deuda el día 20.
 */
const db = require('./db');
const reglas = require('./reglas-negocio');
const mailer = require('./mailer');
const { notificar } = require('./notificaciones');
const { requiereAuth, soloRoles, manejar, ok, fail, alumnoVer } = require('./modulo-movil');

const { ErrorNegocio } = reglas;
const MAX_ARCHIVO_BYTES = 3 * 1024 * 1024;
const TIPOS_ARCHIVO = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const ZONA = 'America/Argentina/Buenos_Aires';

// ─── FECHAS ─────────────────────────────────────────────────────────────────

/** Fecha de hoy en Argentina como { anio, mes, dia } */
function hoyAR(fecha = new Date()) {
  const [anio, mes, dia] = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(fecha).split('-').map(Number);
  return { anio, mes, dia };
}
const periodoDe = (anio, mes) => `${anio}-${String(mes).padStart(2, '0')}`;
function periodoSiguiente(p) {
  const [a, m] = p.split('-').map(Number);
  return m === 12 ? periodoDe(a + 1, 1) : periodoDe(a, m + 1);
}
/** Último día hábil (lunes a viernes) del mes. No contempla feriados. */
function ultimoDiaHabil(anio, mes) {
  const d = new Date(Date.UTC(anio, mes, 0));       // último día del mes
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() - 1);
  return d.getUTCDate();
}
const periodoValido = (p) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p || '');
const aPeriodo = (v) => (v ? String(v).slice(0, 7) : null);

// ─── FACTURACIÓN ────────────────────────────────────────────────────────────

/**
 * Emite las facturas del período para todos los alumnos activos que todavía no la tengan.
 * El detalle sale de las inscripciones vigentes al momento de facturar (el transporte puede variar mes a mes).
 */
async function generarFacturas(periodo) {
  if (!periodoValido(periodo)) throw new ErrorNegocio('El período debe tener formato AAAA-MM.');
  const [anio, mes] = periodo.split('-').map(Number);
  const vencimiento = `${periodo}-10`;

  const tarifas = Object.fromEntries((await db.query('SELECT clave, monto::float AS monto FROM tarifas')).rows.map(t => [t.clave, t.monto]));
  const alumnos = (await db.query(`
    SELECT a.id_alumno, c.id_nivel, n.nombre AS nivel
    FROM alumnos a LEFT JOIN cursos c ON c.id_curso = a.id_curso LEFT JOIN niveles n ON n.id_nivel = c.id_nivel
    WHERE a.estado = 'ACTIVO'
      AND NOT EXISTS (SELECT 1 FROM facturas f WHERE f.id_alumno = a.id_alumno AND f.periodo = $1)`, [periodo])).rows;

  const creadas = [];
  for (const al of alumnos) {
    const items = [];
    if (al.id_nivel && tarifas[`CUOTA_${al.id_nivel}`] != null) {
      items.push({ tipo: 'CUOTA', referencia: al.id_nivel, descripcion: `Cuota mensual ${al.nivel} ${periodo}`, monto: tarifas[`CUOTA_${al.id_nivel}`] });
    }
    const [dep, tra, com] = await Promise.all([
      db.query(`SELECT d.id_deporte, d.nombre, d.precio_mensual::float AS precio FROM inscripciones_deporte i
                JOIN deportes d ON d.id_deporte = i.id_deporte WHERE i.id_alumno = $1`, [al.id_alumno]),
      db.query(`SELECT r.numero, r.nombre, r.precio_mensual::float AS precio FROM inscripciones_transporte t
                JOIN recorridos_transporte r ON r.numero = t.recorrido_numero WHERE t.id_alumno = $1`, [al.id_alumno]),
      db.query('SELECT 1 FROM inscripciones_comedor WHERE id_alumno = $1', [al.id_alumno])
    ]);
    dep.rows.forEach(d => items.push({ tipo: 'DEPORTE', referencia: d.id_deporte, descripcion: `Deporte: ${d.nombre}`, monto: d.precio }));
    tra.rows.forEach(t => items.push({ tipo: 'TRANSPORTE', referencia: t.numero, descripcion: `Transporte: ${t.nombre}`, monto: t.precio }));
    if (com.rowCount && tarifas.COMEDOR != null) items.push({ tipo: 'COMEDOR', referencia: null, descripcion: 'Servicio de comedor', monto: tarifas.COMEDOR });
    if (items.length === 0) continue;

    const total = items.reduce((s, i) => s + i.monto, 0);
    const numero = `F${anio}${String(mes).padStart(2, '0')}-${String(al.id_alumno).padStart(5, '0')}`;
    const cliente = await db.getClient();
    try {
      await cliente.query('BEGIN');
      const f = await cliente.query(`
        INSERT INTO facturas (numero, id_alumno, periodo, fecha_vencimiento, total) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id_alumno, periodo) DO NOTHING RETURNING id_factura`, [numero, al.id_alumno, periodo, vencimiento, total]);
      if (f.rowCount) {
        for (const it of items) {
          await cliente.query('INSERT INTO factura_items (id_factura, tipo, referencia, descripcion, monto) VALUES ($1, $2, $3, $4, $5)',
            [f.rows[0].id_factura, it.tipo, it.referencia, it.descripcion, it.monto]);
        }
        creadas.push({ id_factura: f.rows[0].id_factura, id_alumno: al.id_alumno, numero, total });
      }
      await cliente.query('COMMIT');
    } catch (e) {
      await cliente.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      cliente.release();
    }
  }

  // Aviso a las familias (sin datos del menor en el texto)
  for (const c of creadas) {
    const ids = await reglas.usuariosRelacionados(c.id_alumno);
    await notificar(ids, { titulo: 'Nueva factura disponible', cuerpo: `Se emitió la factura del período ${periodo}. Abrí la app para ver el detalle.`, tipo: 'FACTURA', datos: { pantalla: 'cuotas', id_factura: c.id_factura } });
  }
  return { periodo, creadas: creadas.length, facturas: creadas };
}

/** Factura con ítems, comprobantes y datos del alumno/tutor. */
async function detalleFactura(idFactura) {
  const f = (await db.query(`
    SELECT v.*, v.total::float AS total, v.pagado::float AS pagado, v.en_revision::float AS en_revision, v.saldo::float AS saldo,
           a.nombre || ' ' || a.apellido AS alumno, c.nombre AS curso, n.nombre AS nivel,
           (SELECT t.nombre || ' ' || t.apellido FROM tutor_alumno ta JOIN tutores t ON t.id_tutor = ta.id_tutor
             WHERE ta.id_alumno = a.id_alumno ORDER BY t.id_tutor LIMIT 1) AS tutor
    FROM v_facturas_estado v JOIN alumnos a ON a.id_alumno = v.id_alumno
    LEFT JOIN cursos c ON c.id_curso = a.id_curso LEFT JOIN niveles n ON n.id_nivel = c.id_nivel
    WHERE v.id_factura = $1`, [idFactura])).rows[0];
  if (!f) return null;
  const [items, comps] = await Promise.all([
    db.query(`SELECT id_item, tipo, referencia, descripcion, monto::float AS monto, pagado::float AS pagado, en_revision::float AS en_revision,
                     (monto - pagado - en_revision)::float AS disponible
              FROM v_items_estado WHERE id_factura = $1 ORDER BY id_item`, [idFactura]),
    db.query(`SELECT cp.id_comprobante, cp.numero, cp.medio, cp.nro_operacion, cp.fecha_transferencia, cp.monto::float AS monto,
                     cp.estado, cp.observacion, cp.origen, cp.creado_en, cp.archivo_nombre, (cp.archivo_base64 IS NOT NULL) AS tiene_archivo,
                     COALESCE(JSON_AGG(JSON_BUILD_OBJECT('id_item', ci.id_item, 'descripcion', fi.descripcion, 'monto', ci.monto)) FILTER (WHERE ci.id_item IS NOT NULL), '[]') AS items
              FROM comprobantes_pago cp
              LEFT JOIN comprobante_items ci ON ci.id_comprobante = cp.id_comprobante
              LEFT JOIN factura_items fi ON fi.id_item = ci.id_item
              WHERE cp.id_factura = $1 GROUP BY cp.id_comprobante ORDER BY cp.creado_en DESC`, [idFactura])
  ]);
  return { ...f, items: items.rows, comprobantes: comps.rows };
}

/** Busca la factura y verifica que el usuario pueda verla (o gestionarla). */
async function facturaConPermiso(req, gestionar = false) {
  const id = parseInt(req.params.id, 10);
  const f = (await db.query('SELECT id_factura, id_alumno FROM facturas WHERE id_factura = $1', [id])).rows[0];
  if (!f) throw new ErrorNegocio('Factura no encontrada', 404);
  const permitido = gestionar ? await reglas.puedeGestionarAlumno(req.usuario, f.id_alumno) : await reglas.puedeVerAlumno(req.usuario, f.id_alumno);
  if (!permitido) throw new ErrorNegocio('No tenés acceso a esta factura.', 403);
  return f;
}

async function enviarPDF(res, idFactura) {
  const f = await detalleFactura(idFactura);
  const pdf = await mailer.facturaPDF(f);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Factura-${f.numero}.pdf"` }).send(pdf);
}

// ─── COMPROBANTES DE PAGO ───────────────────────────────────────────────────

/**
 * Registra un comprobante de transferencia para los ítems elegidos por el padre.
 * body: { medio, nro_operacion, fecha_transferencia, items: [{ id_item, monto? }], archivo: { nombre, tipo, base64 } }
 */
async function registrarComprobante(req, idFactura) {
  const b = req.body || {};
  if (b.medio && String(b.medio).toUpperCase() !== 'TRANSFERENCIA') {
    throw new ErrorNegocio('No se aceptan pagos en efectivo: el único medio de pago es la transferencia bancaria.');
  }
  const nroOperacion = String(b.nro_operacion || '').trim();
  if (!nroOperacion) throw new ErrorNegocio('Ingresá el número de operación de la transferencia.');
  const fechaTransf = String(b.fecha_transferencia || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaTransf) || isNaN(Date.parse(fechaTransf))) throw new ErrorNegocio('La fecha de la transferencia no es válida.');
  const hoy = hoyAR();
  if (fechaTransf > `${periodoDe(hoy.anio, hoy.mes)}-${String(hoy.dia).padStart(2, '0')}`) throw new ErrorNegocio('La fecha de la transferencia no puede ser futura.');

  const archivo = b.archivo || {};
  if (!archivo.base64) throw new ErrorNegocio('Adjuntá el comprobante de la transferencia (imagen o PDF).');
  if (!TIPOS_ARCHIVO.includes(archivo.tipo)) throw new ErrorNegocio('El comprobante debe ser una imagen (JPG/PNG) o un PDF.');
  const base64 = String(archivo.base64).replace(/^data:[^;]+;base64,/, '');
  if (Buffer.byteLength(base64, 'base64') > MAX_ARCHIVO_BYTES) throw new ErrorNegocio('El archivo supera los 3 MB.');

  if (!Array.isArray(b.items) || b.items.length === 0) throw new ErrorNegocio('Seleccioná al menos un ítem a pagar.');

  const cliente = await db.getClient();
  try {
    await cliente.query('BEGIN');
    await cliente.query('SELECT 1 FROM facturas WHERE id_factura = $1 FOR UPDATE', [idFactura]);   // evita doble carga simultánea
    const disponibles = Object.fromEntries((await cliente.query(
      'SELECT id_item, descripcion, (monto - pagado - en_revision)::float AS disponible FROM v_items_estado WHERE id_factura = $1', [idFactura]
    )).rows.map(i => [i.id_item, i]));

    const elegidos = [];
    for (const it of b.items) {
      const item = disponibles[parseInt(it.id_item, 10)];
      if (!item) throw new ErrorNegocio('Uno de los ítems no pertenece a esta factura.');
      if (elegidos.some(e => e.id_item === item.id_item)) throw new ErrorNegocio('Hay ítems repetidos en el pago.');
      const monto = it.monto != null ? Math.round(Number(it.monto) * 100) / 100 : item.disponible;
      if (!(monto > 0)) throw new ErrorNegocio(`"${item.descripcion}" no tiene saldo pendiente o el importe no es válido.`);
      if (monto > item.disponible + 0.001) throw new ErrorNegocio(`El importe para "${item.descripcion}" supera el saldo pendiente.`);
      elegidos.push({ id_item: item.id_item, descripcion: item.descripcion, monto });
    }
    const total = Math.round(elegidos.reduce((s, e) => s + e.monto, 0) * 100) / 100;

    const c = await cliente.query(`
      INSERT INTO comprobantes_pago (numero, id_factura, id_usuario, nro_operacion, fecha_transferencia, monto,
                                     archivo_nombre, archivo_tipo, archivo_base64, origen)
      VALUES ('TMP-' || LEFT(md5(random()::text), 12), $1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id_comprobante, creado_en`,
      [idFactura, req.usuario.id_usuario, nroOperacion.slice(0, 60), fechaTransf, total,
       String(archivo.nombre || 'comprobante').slice(0, 150), archivo.tipo, base64, reglas.origenDe(req)]);
    const id = c.rows[0].id_comprobante;
    const numero = `CP-${hoy.anio}-${String(id).padStart(6, '0')}`;
    await cliente.query('UPDATE comprobantes_pago SET numero = $1 WHERE id_comprobante = $2', [numero, id]);
    for (const e of elegidos) {
      await cliente.query('INSERT INTO comprobante_items (id_comprobante, id_item, monto) VALUES ($1, $2, $3)', [id, e.id_item, e.monto]);
    }
    await cliente.query('COMMIT');
    return { id_comprobante: id, numero, monto: total, fecha_transferencia: fechaTransf, nro_operacion: nroOperacion, estado: 'PENDIENTE', items: elegidos, creado_en: c.rows[0].creado_en };
  } catch (e) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    cliente.release();
  }
}

// ─── MAILS ──────────────────────────────────────────────────────────────────

async function tutoresConEmail() {
  return (await db.query(`
    SELECT t.id_tutor, t.nombre, t.apellido, u.email, ARRAY_AGG(ta.id_alumno) AS alumnos
    FROM tutores t JOIN usuarios u ON u.id_usuario = t.id_usuario
    JOIN tutor_alumno ta ON ta.id_tutor = t.id_tutor
    WHERE u.estado = 'ACTIVO' GROUP BY t.id_tutor, u.email`)).rows;
}

async function yaEnviado(tipo, periodo, idTutor) {
  const r = await db.query("SELECT 1 FROM envios_mail WHERE tipo = $1 AND periodo = $2 AND id_tutor = $3 AND estado <> 'ERROR'", [tipo, periodo, idTutor]);
  return r.rowCount > 0;
}
async function registrarEnvio(tipo, periodo, tutor, envio) {
  await db.query(`
    INSERT INTO envios_mail (tipo, periodo, id_tutor, email, estado, detalle) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (tipo, periodo, id_tutor) DO UPDATE SET email = EXCLUDED.email, estado = EXCLUDED.estado,
      detalle = EXCLUDED.detalle, creado_en = CURRENT_TIMESTAMP`,
    [tipo, periodo, tutor.id_tutor, envio.destino, envio.estado, envio.detalle]);
}

const filaTabla = (cols) => `<tr>${cols.map((c, i) => `<td style="padding:6px 10px;border-bottom:1px solid #eee;${i === cols.length - 1 ? 'text-align:right' : ''}">${c}</td>`).join('')}</tr>`;
const p = mailer.pesos;

/** Último día hábil: total a abonar del período por cada padre, con la composición y las facturas adjuntas. */
async function enviarRecordatorios(periodo, forzar = false) {
  const resultado = [];
  for (const t of await tutoresConEmail()) {
    if (!forzar && await yaEnviado('RECORDATORIO', periodo, t.id_tutor)) continue;
    const facturas = (await db.query('SELECT id_factura FROM facturas WHERE periodo = $1 AND id_alumno = ANY($2::int[]) ORDER BY id_alumno', [periodo, t.alumnos])).rows;
    if (facturas.length === 0) continue;
    const detalles = await Promise.all(facturas.map(f => detalleFactura(f.id_factura)));
    const saldoAnterior = (await db.query(
      "SELECT COALESCE(SUM(saldo), 0)::float AS s FROM v_facturas_estado WHERE id_alumno = ANY($1::int[]) AND periodo < $2 AND saldo > 0",
      [t.alumnos, periodo])).rows[0].s;
    const totalPeriodo = detalles.reduce((s, f) => s + f.saldo, 0);

    const bloques = detalles.map(f => `
      <h3 style="margin:18px 0 6px">${f.alumno} — Factura ${f.numero} (vence ${new Date(f.fecha_vencimiento).toLocaleDateString('es-AR', { timeZone: 'UTC' })})</h3>
      <table style="border-collapse:collapse;width:100%;max-width:560px">${f.items.map(i => filaTabla([i.descripcion, p(i.monto - i.pagado)])).join('')}
      ${filaTabla(['<b>Subtotal</b>', `<b>${p(f.saldo)}</b>`])}</table>`).join('');
    const html = `
      <p>Hola ${t.nombre},</p>
      <p>Te recordamos el total a abonar del período <b>${periodo}</b>:</p>${bloques}
      ${saldoAnterior > 0 ? `<p>Saldo pendiente de períodos anteriores: <b>${p(saldoAnterior)}</b></p>` : ''}
      <p style="font-size:16px">Total a abonar: <b>${p(totalPeriodo + saldoAnterior)}</b></p>
      <p>Pagá por transferencia bancaria (CBU 0000003100012345678901 · Alias EDUCAR.TRANSFORMAR.CUOTAS) y cargá el comprobante desde la app.</p>
      <p>Centro Educativo "Educar para Transformar"</p>`;
    const adjuntos = await Promise.all(detalles.map(async f => ({ filename: `Factura-${f.numero}.pdf`, content: await mailer.facturaPDF(f) })));
    const envio = await mailer.enviar({ para: t.email, asunto: `Recordatorio de pago - período ${periodo}`, html, adjuntos });
    await registrarEnvio('RECORDATORIO', periodo, t, envio);
    resultado.push({ tutor: `${t.nombre} ${t.apellido}`, email: t.email, total: totalPeriodo + saldoAnterior, ...envio });
  }
  return resultado;
}

/** Día 20: a cada padre con saldo pendiente se le envía la deuda discriminada por ítem. */
async function enviarAvisosDeuda(periodo, forzar = false) {
  const resultado = [];
  for (const t of await tutoresConEmail()) {
    if (!forzar && await yaEnviado('DEUDA', periodo, t.id_tutor)) continue;
    const items = (await db.query(`
      SELECT f.periodo, f.numero, a.nombre || ' ' || a.apellido AS alumno, i.descripcion, (i.monto - i.pagado)::float AS saldo
      FROM v_items_estado i JOIN facturas f ON f.id_factura = i.id_factura JOIN alumnos a ON a.id_alumno = f.id_alumno
      WHERE f.id_alumno = ANY($1::int[]) AND f.periodo <= $2 AND i.monto - i.pagado > 0
      ORDER BY f.periodo, a.nombre, i.id_item`, [t.alumnos, periodo])).rows;
    if (items.length === 0) continue;
    const total = items.reduce((s, i) => s + i.saldo, 0);
    const html = `
      <p>Hola ${t.nombre},</p>
      <p>Al día de hoy registramos el siguiente saldo pendiente de pago:</p>
      <table style="border-collapse:collapse;width:100%;max-width:620px">
        ${filaTabla(['<b>Período</b>', '<b>Alumno</b>', '<b>Concepto</b>', '<b>Saldo</b>'])}
        ${items.map(i => filaTabla([i.periodo, i.alumno, i.descripcion, p(i.saldo)])).join('')}
        ${filaTabla(['', '', '<b>Total adeudado</b>', `<b>${p(total)}</b>`])}
      </table>
      <p>Si ya transferiste, cargá el comprobante desde la app para que administración lo registre.</p>
      <p>Centro Educativo "Educar para Transformar"</p>`;
    const envio = await mailer.enviar({ para: t.email, asunto: `Aviso de deuda - ${periodo}`, html });
    await registrarEnvio('DEUDA', periodo, t, envio);
    resultado.push({ tutor: `${t.nombre} ${t.apellido}`, email: t.email, total, ...envio });
  }
  return resultado;
}

// ─── RUTAS ──────────────────────────────────────────────────────────────────

function registrar(app) {
  const admin = [requiereAuth, soloRoles('ADMIN')];

  // ── Consultas (app móvil y portal de familias) ────────────────────────────

  /** GET /api/movil/alumnos/:id/facturas?desde=AAAA-MM&hasta=AAAA-MM → cuotas con estado, vencimiento y comprobantes */
  app.get('/api/movil/alumnos/:id/facturas', requiereAuth, alumnoVer, manejar(async (req, res) => {
    const desde = aPeriodo(req.query.desde) || '0000-00', hasta = aPeriodo(req.query.hasta) || '9999-99';
    const r = await db.query(`
      SELECT v.id_factura, v.numero, v.periodo, v.fecha_emision, v.fecha_vencimiento, v.total::float AS total,
             v.pagado::float AS pagado, v.en_revision::float AS en_revision, v.saldo::float AS saldo, v.estado,
             COALESCE((SELECT JSON_AGG(JSON_BUILD_OBJECT('numero', cp.numero, 'monto', cp.monto, 'estado', cp.estado,
                                                         'fecha_transferencia', cp.fecha_transferencia) ORDER BY cp.creado_en)
                       FROM comprobantes_pago cp WHERE cp.id_factura = v.id_factura), '[]') AS comprobantes
      FROM v_facturas_estado v WHERE v.id_alumno = $1 AND v.periodo BETWEEN $2 AND $3
      ORDER BY v.periodo DESC`, [req.idAlumno, desde, hasta]);
    ok(res, { facturas: r.rows, sincronizado_en: new Date().toISOString() });
  }));

  /** GET /api/movil/alumnos/:id/deuda → historial de deuda discriminado por ítem y totales por tipo */
  app.get('/api/movil/alumnos/:id/deuda', requiereAuth, alumnoVer, manejar(async (req, res) => {
    const items = (await db.query(`
      SELECT f.id_factura, f.numero, f.periodo, f.fecha_vencimiento, i.id_item, i.tipo, i.descripcion,
             i.monto::float AS monto, i.pagado::float AS pagado, i.en_revision::float AS en_revision,
             (i.monto - i.pagado)::float AS saldo
      FROM v_items_estado i JOIN facturas f ON f.id_factura = i.id_factura
      WHERE f.id_alumno = $1 ORDER BY f.periodo DESC, i.id_item`, [req.idAlumno])).rows;
    const porTipo = {};
    for (const i of items) {
      porTipo[i.tipo] ??= { tipo: i.tipo, facturado: 0, pagado: 0, saldo: 0 };
      porTipo[i.tipo].facturado += i.monto; porTipo[i.tipo].pagado += i.pagado; porTipo[i.tipo].saldo += i.saldo;
    }
    const deudaTotal = items.reduce((s, i) => s + i.saldo, 0);
    ok(res, { deuda_total: deudaTotal, por_tipo: Object.values(porTipo), items, sincronizado_en: new Date().toISOString() });
  }));

  app.get('/api/movil/facturas/:id', requiereAuth, manejar(async (req, res) => {
    const f = await facturaConPermiso(req);
    ok(res, await detalleFactura(f.id_factura));
  }));

  app.get('/api/movil/facturas/:id/pdf', requiereAuth, manejar(async (req, res) => {
    const f = await facturaConPermiso(req);
    await enviarPDF(res, f.id_factura);
  }));

  /** POST /api/movil/facturas/:id/comprobantes → el padre informa una transferencia y recibe el comprobante de pago */
  app.post('/api/movil/facturas/:id/comprobantes', requiereAuth, manejar(async (req, res) => {
    const f = await facturaConPermiso(req, true);
    const comp = await registrarComprobante(req, f.id_factura);
    await reglas.auditar(req, 'CARGA_COMPROBANTE', { id_factura: f.id_factura, comprobante: comp.numero, monto: comp.monto });
    await notificar([req.usuario.id_usuario], { titulo: 'Comprobante recibido', cuerpo: `Recibimos tu comprobante ${comp.numero}. Administración lo revisará en breve.`, tipo: 'PAGO', datos: { pantalla: 'cuotas', id_factura: f.id_factura } });
    ok(res, { mensaje: `Comprobante ${comp.numero} registrado. Queda pendiente de verificación.`, comprobante: comp }, 201);
  }));

  /** GET /api/movil/comprobantes/:id/archivo → descarga el archivo adjunto (dueño o admin) */
  app.get('/api/movil/comprobantes/:id/archivo', requiereAuth, manejar(async (req, res) => {
    const c = (await db.query(`SELECT cp.archivo_nombre, cp.archivo_tipo, cp.archivo_base64, f.id_alumno
      FROM comprobantes_pago cp JOIN facturas f ON f.id_factura = cp.id_factura WHERE cp.id_comprobante = $1`, [parseInt(req.params.id, 10)])).rows[0];
    if (!c || !c.archivo_base64) return fail(res, 'Comprobante sin archivo', 404);
    if (!(await reglas.puedeVerAlumno(req.usuario, c.id_alumno))) return fail(res, 'Sin acceso', 403);
    res.set({ 'Content-Type': c.archivo_tipo, 'Content-Disposition': `inline; filename="${encodeURIComponent(c.archivo_nombre)}"` })
      .send(Buffer.from(c.archivo_base64, 'base64'));
  }));

  /** GET /api/movil/pagos/resumen → saldo pendiente de cada hijo del padre logueado (para el inicio de la app) */
  app.get('/api/movil/pagos/resumen', requiereAuth, soloRoles('PADRE'), manejar(async (req, res) => {
    const r = await db.query(`
      SELECT a.id_alumno, a.nombre, COALESCE(SUM(v.saldo) FILTER (WHERE v.saldo > 0), 0)::float AS saldo,
             MIN(v.fecha_vencimiento) FILTER (WHERE v.saldo > 0) AS proximo_vencimiento,
             COUNT(*) FILTER (WHERE v.estado = 'VENCIDA')::int AS vencidas
      FROM tutores t JOIN tutor_alumno ta ON ta.id_tutor = t.id_tutor JOIN alumnos a ON a.id_alumno = ta.id_alumno
      LEFT JOIN v_facturas_estado v ON v.id_alumno = a.id_alumno
      WHERE t.id_usuario = $1 GROUP BY a.id_alumno ORDER BY a.nombre`, [req.usuario.id_usuario]);
    ok(res, r.rows);
  }));

  // ── Administración (web) ──────────────────────────────────────────────────

  app.get('/api/admin/tarifas', ...admin, manejar(async (req, res) => {
    const [t, d, r] = await Promise.all([
      db.query('SELECT clave, descripcion, monto::float AS monto, actualizado_en FROM tarifas ORDER BY clave'),
      db.query(`SELECT d.id_deporte, d.nombre, n.nombre AS nivel, d.dia_semana, d.precio_mensual::float AS precio
                FROM deportes d LEFT JOIN niveles n ON n.id_nivel = d.id_nivel ORDER BY d.nombre`),
      db.query('SELECT numero, nombre, precio_mensual::float AS precio FROM recorridos_transporte ORDER BY numero')
    ]);
    ok(res, { tarifas: t.rows, deportes: d.rows, recorridos: r.rows });
  }));

  /** PUT /api/admin/tarifas { tarifas:[{clave,monto}], deportes:[{id_deporte,precio}], recorridos:[{numero,precio}] } */
  app.put('/api/admin/tarifas', ...admin, manejar(async (req, res) => {
    const b = req.body || {};
    const valido = (n) => Number.isFinite(Number(n)) && Number(n) >= 0;
    const todos = [...(b.tarifas || []).map(x => x.monto), ...(b.deportes || []).map(x => x.precio), ...(b.recorridos || []).map(x => x.precio)];
    if (!todos.every(valido)) throw new ErrorNegocio('Todos los importes deben ser números mayores o iguales a 0.');
    for (const t of b.tarifas || []) await db.query('UPDATE tarifas SET monto = $1, actualizado_en = CURRENT_TIMESTAMP WHERE clave = $2', [t.monto, t.clave]);
    for (const d of b.deportes || []) await db.query('UPDATE deportes SET precio_mensual = $1 WHERE id_deporte = $2', [d.precio, d.id_deporte]);
    for (const r of b.recorridos || []) await db.query('UPDATE recorridos_transporte SET precio_mensual = $1 WHERE numero = $2', [r.precio, r.numero]);
    await reglas.auditar(req, 'ACTUALIZA_TARIFAS', b);
    ok(res, { mensaje: 'Valores actualizados. Se aplican a las próximas facturas.' });
  }));

  /** POST /api/admin/facturacion/generar { periodo: 'AAAA-MM' } */
  app.post('/api/admin/facturacion/generar', ...admin, manejar(async (req, res) => {
    const r = await generarFacturas(req.body?.periodo);
    await reglas.auditar(req, 'GENERA_FACTURAS', { periodo: r.periodo, creadas: r.creadas });
    ok(res, { mensaje: `Se emitieron ${r.creadas} factura(s) para ${r.periodo}.`, ...r });
  }));

  app.get('/api/admin/facturas', ...admin, manejar(async (req, res) => {
    const params = [], filtros = [];
    if (req.query.periodo) { params.push(req.query.periodo); filtros.push(`v.periodo = $${params.length}`); }
    if (req.query.estado) { params.push(req.query.estado); filtros.push(`v.estado = $${params.length}`); }
    const r = await db.query(`
      SELECT v.id_factura, v.numero, v.periodo, v.fecha_vencimiento, v.total::float AS total, v.pagado::float AS pagado,
             v.en_revision::float AS en_revision, v.saldo::float AS saldo, v.estado, a.legajo, a.nombre || ' ' || a.apellido AS alumno
      FROM v_facturas_estado v JOIN alumnos a ON a.id_alumno = v.id_alumno
      ${filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''} ORDER BY v.periodo DESC, alumno`, params);
    ok(res, r.rows);
  }));

  app.get('/api/admin/facturas/:id', ...admin, manejar(async (req, res) => {
    const f = await detalleFactura(parseInt(req.params.id, 10));
    if (!f) return fail(res, 'Factura no encontrada', 404);
    ok(res, f);
  }));
  app.get('/api/admin/facturas/:id/pdf', ...admin, manejar(async (req, res) => enviarPDF(res, parseInt(req.params.id, 10))));

  app.get('/api/admin/comprobantes', ...admin, manejar(async (req, res) => {
    const estado = req.query.estado || null;
    const r = await db.query(`
      SELECT cp.id_comprobante, cp.numero, cp.nro_operacion, cp.fecha_transferencia, cp.monto::float AS monto, cp.estado,
             cp.observacion, cp.origen, cp.creado_en, cp.archivo_nombre, (cp.archivo_base64 IS NOT NULL) AS tiene_archivo,
             f.id_factura, f.numero AS factura, f.periodo, a.nombre || ' ' || a.apellido AS alumno,
             COALESCE(JSON_AGG(JSON_BUILD_OBJECT('descripcion', fi.descripcion, 'monto', ci.monto)) FILTER (WHERE ci.id_item IS NOT NULL), '[]') AS items
      FROM comprobantes_pago cp JOIN facturas f ON f.id_factura = cp.id_factura JOIN alumnos a ON a.id_alumno = f.id_alumno
      LEFT JOIN comprobante_items ci ON ci.id_comprobante = cp.id_comprobante LEFT JOIN factura_items fi ON fi.id_item = ci.id_item
      WHERE ($1::text IS NULL OR cp.estado = $1)
      GROUP BY cp.id_comprobante, f.id_factura, a.id_alumno ORDER BY cp.creado_en DESC`, [estado]);
    ok(res, r.rows);
  }));

  /** PUT /api/admin/comprobantes/:id { estado: 'APROBADO' | 'RECHAZADO', observacion } */
  app.put('/api/admin/comprobantes/:id', ...admin, manejar(async (req, res) => {
    const estado = String(req.body?.estado || '').toUpperCase();
    if (!['APROBADO', 'RECHAZADO'].includes(estado)) throw new ErrorNegocio('El estado debe ser APROBADO o RECHAZADO.');
    if (estado === 'RECHAZADO' && !String(req.body?.observacion || '').trim()) throw new ErrorNegocio('Indicá el motivo del rechazo.');
    const c = (await db.query(`
      UPDATE comprobantes_pago SET estado = $1, observacion = $2 WHERE id_comprobante = $3 AND estado = 'PENDIENTE'
      RETURNING numero, id_usuario, id_factura`, [estado, String(req.body?.observacion || '').slice(0, 200) || null, parseInt(req.params.id, 10)])).rows[0];
    if (!c) throw new ErrorNegocio('El comprobante no existe o ya fue revisado.', 404);
    await reglas.auditar(req, `COMPROBANTE_${estado}`, { comprobante: c.numero });
    const idAlumno = (await db.query('SELECT id_alumno FROM facturas WHERE id_factura = $1', [c.id_factura])).rows[0].id_alumno;
    const destinatarios = [c.id_usuario, ...(await reglas.usuariosRelacionados(idAlumno))];
    await notificar(destinatarios, {
      titulo: estado === 'APROBADO' ? 'Pago acreditado' : 'Comprobante rechazado',
      cuerpo: estado === 'APROBADO' ? `Se acreditó el pago del comprobante ${c.numero}.` : `El comprobante ${c.numero} fue rechazado. Abrí la app para ver el motivo.`,
      tipo: 'PAGO', datos: { pantalla: 'cuotas', id_factura: c.id_factura }
    });
    ok(res, { mensaje: `Comprobante ${c.numero} ${estado.toLowerCase()}.` });
  }));

  // ── Reportes de pagos (web) ───────────────────────────────────────────────

  /** Ingresos (comprobantes aprobados) por período de tiempo: ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD */
  app.get('/api/admin/reportes/ingresos', ...admin, manejar(async (req, res) => {
    const desde = req.query.desde || '1900-01-01', hasta = req.query.hasta || '2999-12-31';
    const [detalle, porMes] = await Promise.all([
      db.query(`
        SELECT cp.fecha_transferencia, cp.numero, cp.nro_operacion, cp.monto::float AS monto, f.numero AS factura, f.periodo,
               a.legajo, a.nombre || ' ' || a.apellido AS alumno
        FROM comprobantes_pago cp JOIN facturas f ON f.id_factura = cp.id_factura JOIN alumnos a ON a.id_alumno = f.id_alumno
        WHERE cp.estado = 'APROBADO' AND cp.fecha_transferencia BETWEEN $1 AND $2 ORDER BY cp.fecha_transferencia`, [desde, hasta]),
      db.query(`
        SELECT TO_CHAR(cp.fecha_transferencia, 'YYYY-MM') AS mes, SUM(cp.monto)::float AS total, COUNT(*)::int AS pagos
        FROM comprobantes_pago cp WHERE cp.estado = 'APROBADO' AND cp.fecha_transferencia BETWEEN $1 AND $2
        GROUP BY 1 ORDER BY 1`, [desde, hasta])
    ]);
    ok(res, { total: detalle.rows.reduce((s, r) => s + r.monto, 0), por_mes: porMes.rows, detalle: detalle.rows });
  }));

  /**
   * Pagos completos o incompletos por período, discriminados por año y por alumno.
   * ?tipo=completos|incompletos&desde=AAAA-MM&hasta=AAAA-MM
   */
  app.get('/api/admin/reportes/pagos', ...admin, manejar(async (req, res) => {
    const completos = req.query.tipo !== 'incompletos';
    const desde = aPeriodo(req.query.desde) || '0000-00', hasta = aPeriodo(req.query.hasta) || '9999-99';
    const r = await db.query(`
      SELECT LEFT(v.periodo, 4) AS anio, a.id_alumno, a.legajo, a.nombre || ' ' || a.apellido AS alumno, n.nombre AS nivel,
             v.numero, v.periodo, v.total::float AS total, v.pagado::float AS pagado, v.saldo::float AS saldo, v.estado
      FROM v_facturas_estado v JOIN alumnos a ON a.id_alumno = v.id_alumno
      LEFT JOIN cursos c ON c.id_curso = a.id_curso LEFT JOIN niveles n ON n.id_nivel = c.id_nivel
      WHERE v.periodo BETWEEN $1 AND $2 AND ${completos ? 'v.saldo <= 0' : 'v.saldo > 0'}
      ORDER BY anio, alumno, v.periodo`, [desde, hasta]);
    // Agrupa: año → alumno → facturas
    const anios = {};
    for (const f of r.rows) {
      anios[f.anio] ??= { anio: f.anio, total: 0, pagado: 0, saldo: 0, alumnos: {} };
      const A = anios[f.anio];
      A.alumnos[f.id_alumno] ??= { alumno: f.alumno, legajo: f.legajo, nivel: f.nivel, total: 0, pagado: 0, saldo: 0, facturas: [] };
      const al = A.alumnos[f.id_alumno];
      al.facturas.push({ numero: f.numero, periodo: f.periodo, total: f.total, pagado: f.pagado, saldo: f.saldo, estado: f.estado });
      for (const k of ['total', 'pagado', 'saldo']) { al[k] += f[k]; A[k] += f[k]; }
    }
    ok(res, Object.values(anios).map(a => ({ ...a, alumnos: Object.values(a.alumnos) })));
  }));

  /** Pagos por alumno por deporte, nivel, horario y profesor: ?desde&hasta&id_deporte&id_nivel */
  app.get('/api/admin/reportes/pagos-deportes', ...admin, manejar(async (req, res) => {
    const desde = aPeriodo(req.query.desde) || '0000-00', hasta = aPeriodo(req.query.hasta) || '9999-99';
    const r = await db.query(`
      SELECT d.nombre AS deporte, n.nombre AS nivel, d.dia_semana, TO_CHAR(d.hora_inicio, 'HH24:MI') || '-' || TO_CHAR(d.hora_fin, 'HH24:MI') AS horario,
             NULLIF(TRIM(CONCAT(p.nombre, ' ', p.apellido)), '') AS profesor, a.legajo, a.nombre || ' ' || a.apellido AS alumno,
             f.periodo, i.monto::float AS monto, i.pagado::float AS pagado, (i.monto - i.pagado)::float AS saldo
      FROM v_items_estado i JOIN facturas f ON f.id_factura = i.id_factura JOIN alumnos a ON a.id_alumno = f.id_alumno
      JOIN deportes d ON d.id_deporte = i.referencia LEFT JOIN niveles n ON n.id_nivel = d.id_nivel
      LEFT JOIN profesores p ON p.id_profesor = d.id_profesor
      WHERE i.tipo = 'DEPORTE' AND f.periodo BETWEEN $1 AND $2
        AND ($3::int IS NULL OR d.id_deporte = $3) AND ($4::int IS NULL OR d.id_nivel = $4)
      ORDER BY d.nombre, n.nombre, horario, profesor, alumno, f.periodo`,
      [desde, hasta, req.query.id_deporte || null, req.query.id_nivel || null]);
    ok(res, r.rows);
  }));

  /** Pagos de alumnos por recorrido de transporte: ?desde&hasta&recorrido */
  app.get('/api/admin/reportes/pagos-transporte', ...admin, manejar(async (req, res) => {
    const desde = aPeriodo(req.query.desde) || '0000-00', hasta = aPeriodo(req.query.hasta) || '9999-99';
    const r = await db.query(`
      SELECT r.numero AS recorrido, r.nombre AS recorrido_nombre, a.legajo, a.nombre || ' ' || a.apellido AS alumno,
             f.periodo, i.monto::float AS monto, i.pagado::float AS pagado, (i.monto - i.pagado)::float AS saldo
      FROM v_items_estado i JOIN facturas f ON f.id_factura = i.id_factura JOIN alumnos a ON a.id_alumno = f.id_alumno
      JOIN recorridos_transporte r ON r.numero = i.referencia
      WHERE i.tipo = 'TRANSPORTE' AND f.periodo BETWEEN $1 AND $2 AND ($3::int IS NULL OR r.numero = $3)
      ORDER BY r.numero, alumno, f.periodo`, [desde, hasta, req.query.recorrido || null]);
    ok(res, r.rows);
  }));

  // ── Mails (manual desde la web y automático por cron) ─────────────────────

  app.post('/api/admin/mails/recordatorio', ...admin, manejar(async (req, res) => {
    const h = hoyAR();
    const periodo = req.body?.periodo || periodoSiguiente(periodoDe(h.anio, h.mes));
    if (!periodoValido(periodo)) throw new ErrorNegocio('Período inválido (AAAA-MM).');
    await generarFacturas(periodo);
    const envios = await enviarRecordatorios(periodo, Boolean(req.body?.forzar));
    ok(res, { periodo, smtp_configurado: mailer.configurado(), envios });
  }));

  app.post('/api/admin/mails/deuda', ...admin, manejar(async (req, res) => {
    const h = hoyAR();
    const periodo = req.body?.periodo || periodoDe(h.anio, h.mes);
    if (!periodoValido(periodo)) throw new ErrorNegocio('Período inválido (AAAA-MM).');
    const envios = await enviarAvisosDeuda(periodo, Boolean(req.body?.forzar));
    ok(res, { periodo, smtp_configurado: mailer.configurado(), envios });
  }));

  app.get('/api/admin/mails', ...admin, manejar(async (req, res) => {
    const r = await db.query(`SELECT e.*, t.nombre || ' ' || t.apellido AS tutor FROM envios_mail e JOIN tutores t ON t.id_tutor = e.id_tutor
                              ORDER BY e.creado_en DESC LIMIT 200`);
    ok(res, r.rows);
  }));

  /**
   * GET /api/cron/diario - lo ejecuta Vercel Cron todos los días (ver vercel.json).
   * - Último día hábil del mes: emite las facturas del mes siguiente y envía el recordatorio con la factura.
   * - Día 20: envía el aviso de deuda a quienes no pagaron completo.
   * Protegido con CRON_SECRET (Vercel lo envía como "Authorization: Bearer <CRON_SECRET>").
   */
  app.get('/api/cron/diario', manejar(async (req, res) => {
    const secreto = process.env.CRON_SECRET;
    if (!secreto || req.get('Authorization') !== `Bearer ${secreto}`) return fail(res, 'No autorizado', 401);
    const h = hoyAR();
    const periodoActual = periodoDe(h.anio, h.mes);
    const acciones = {};
    if (h.dia === ultimoDiaHabil(h.anio, h.mes)) {
      const proximo = periodoSiguiente(periodoActual);
      acciones.facturacion = await generarFacturas(proximo);
      acciones.recordatorios = await enviarRecordatorios(proximo);
    }
    if (h.dia === 20) acciones.deuda = await enviarAvisosDeuda(periodoActual);
    ok(res, { fecha: `${periodoActual}-${String(h.dia).padStart(2, '0')}`, acciones });
  }));
}

module.exports = { registrar, generarFacturas, enviarRecordatorios, enviarAvisosDeuda, ultimoDiaHabil, hoyAR };
