/**
 * mailer.js - Envío de correos (nodemailer) y generación de la factura en PDF (pdfkit).
 *
 * Variables de entorno:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS  → servidor de correo (ej. Gmail con contraseña de aplicación)
 *   MAIL_FROM     → remitente (por defecto SMTP_USER)
 *   MAIL_PRUEBA   → si está definido, TODOS los mails se envían a esta dirección (útil para la demo,
 *                   porque los correos de los usuarios de prueba no existen)
 * Sin SMTP_HOST los envíos quedan como "SIMULADO" (se registran pero no salen).
 */
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');

let transporte = null;
function obtenerTransporte() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporte) {
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return transporte;
}

const configurado = () => Boolean(process.env.SMTP_HOST);

/** Envía un mail. Devuelve { estado: 'ENVIADO' | 'SIMULADO' | 'ERROR', destino, detalle } sin lanzar errores. */
async function enviar({ para, asunto, html, adjuntos = [] }) {
  const destino = process.env.MAIL_PRUEBA || para;
  const t = obtenerTransporte();
  if (!t) {
    console.log(`[Mail SIMULADO] a ${destino}: ${asunto}`);
    return { estado: 'SIMULADO', destino, detalle: 'SMTP no configurado' };
  }
  try {
    const info = await t.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: destino,
      subject: process.env.MAIL_PRUEBA ? `[Prueba para ${para}] ${asunto}` : asunto,
      html,
      attachments: adjuntos
    });
    return { estado: 'ENVIADO', destino, detalle: info.messageId };
  } catch (e) {
    console.error('[Mail] Error al enviar:', e.message);
    return { estado: 'ERROR', destino, detalle: e.message.slice(0, 300) };
  }
}

const pesos = (n) => '$ ' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (d) => new Date(d).toLocaleDateString('es-AR', { timeZone: 'UTC' });

/**
 * Genera la factura en PDF.
 * @param {object} f  { numero, periodo, fecha_emision, fecha_vencimiento, total, alumno, curso, nivel, tutor, items: [{descripcion, monto, pagado}] }
 * @returns {Promise<Buffer>}
 */
function facturaPDF(f) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const partes = [];
    doc.on('data', (p) => partes.push(p));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const azul = '#1f4e79';
    doc.fillColor(azul).fontSize(20).text('Centro Educativo "Educar para Transformar"', { align: 'left' });
    doc.fillColor('#555').fontSize(9).text('Resistencia, Chaco  ·  administracion@educarparatransformar.edu.ar');
    doc.moveDown(1.2);

    doc.fillColor('#000').fontSize(16).text(`Factura ${f.numero}`);
    doc.fontSize(10).fillColor('#333')
      .text(`Período: ${f.periodo}`)
      .text(`Emisión: ${fecha(f.fecha_emision)}    Vencimiento: ${fecha(f.fecha_vencimiento)}`)
      .moveDown(0.6)
      .text(`Alumno: ${f.alumno}${f.curso ? `  ·  ${f.curso}` : ''}${f.nivel ? ` (${f.nivel})` : ''}`)
      .text(`Responsable de pago: ${f.tutor || '-'}`);
    doc.moveDown(1);

    // Tabla de ítems
    const x = 50, anchoDesc = 330, y0 = doc.y;
    doc.rect(x, y0, 495, 20).fill(azul);
    doc.fillColor('#fff').fontSize(10).text('Concepto', x + 8, y0 + 5).text('Importe', x + anchoDesc + 8, y0 + 5, { width: 150, align: 'right' });
    let y = y0 + 26;
    doc.fillColor('#000');
    for (const it of f.items) {
      doc.text(it.descripcion, x + 8, y, { width: anchoDesc - 10 }).text(pesos(it.monto), x + anchoDesc + 8, y, { width: 150, align: 'right' });
      y += 20;
      doc.moveTo(x, y - 4).lineTo(x + 495, y - 4).strokeColor('#ddd').stroke();
    }
    doc.fontSize(12).fillColor(azul).text('TOTAL', x + 8, y + 6).text(pesos(f.total), x + anchoDesc + 8, y + 6, { width: 150, align: 'right' });

    doc.moveDown(3).fontSize(9).fillColor('#333').text(
      'Forma de pago: únicamente transferencia bancaria (no se aceptan pagos en efectivo). ' +
      'CBU 0000003100012345678901 · Alias EDUCAR.TRANSFORMAR.CUOTAS. ' +
      'Luego de transferir, cargá el comprobante desde la app o el portal de familias indicando los ítems que pagás.',
      50, doc.y, { width: 495 });
    doc.end();
  });
}

module.exports = { enviar, configurado, facturaPDF, pesos };
