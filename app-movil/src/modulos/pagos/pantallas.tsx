/**
 * Módulo Pagos (TP Parte 3 - Gestión de cuotas):
 * cuotas pendientes y pagadas, vencimientos, importes, estado, historial de pagos,
 * facturas por período, deuda discriminada por ítem y carga del comprobante de transferencia.
 */
import React, { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { AvisoSinConexion, Boton, Campo, Chip, Contenido, Estado, Fila, Pantalla, Seccion, Tarjeta, Vacio, s } from '../../componentes/ui';
import { colores, espacio, fecha, fechaHora, pesos } from '../../tema';
import { config } from '../../config';
import { api } from '../../nucleo/apiClient';
import { hayConexion, useConsulta } from '../../nucleo/hooks';
import { pagosRepo } from '../../repositorios';
import { SelectorHijo, useHijo } from '../alumnos/hijo';
import { useSesion } from '../acceso/sesion';

const TIPO: Record<string, string> = { CUOTA: 'Cuota', DEPORTE: 'Deportes', TRANSPORTE: 'Transporte', COMEDOR: 'Comedor' };
const MAX_BYTES = 3 * 1024 * 1024;

const periodoActual = (sumarMeses = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() + sumarMeses);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const FILTROS = [
  { id: '6m', texto: 'Últimos 6 meses', desde: () => periodoActual(-5), hasta: () => periodoActual(1) },
  { id: 'anio', texto: 'Este año', desde: () => `${new Date().getFullYear()}-01`, hasta: () => `${new Date().getFullYear()}-12` },
  { id: 'todo', texto: 'Todo', desde: () => undefined, hasta: () => undefined }
];

// ── Listado de cuotas / facturas y deuda ────────────────────────────────────

export function PantallaCuotas({ navigation }: any) {
  const { perfil } = useSesion();
  const { hijo } = useHijo();
  const idAlumno = perfil?.usuario.rol === 'ESTUDIANTE' ? perfil.alumno?.id_alumno : hijo?.id_alumno;
  const [vista, setVista] = useState<'facturas' | 'deuda'>('facturas');
  const [filtro, setFiltro] = useState('6m');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const f = FILTROS.find(x => x.id === filtro);
  const rango = filtro === 'custom' ? { desde: desde || undefined, hasta: hasta || undefined } : { desde: f?.desde(), hasta: f?.hasta() };

  const facturas = useConsulta(idAlumno ? `facturas-${idAlumno}-${rango.desde}-${rango.hasta}` : null,
    () => pagosRepo.facturas(idAlumno!, rango.desde, rango.hasta));
  const deuda = useConsulta(idAlumno ? `deuda-${idAlumno}` : null, () => pagosRepo.deuda(idAlumno!));

  if (!idAlumno) return <Vacio texto="No hay alumnos asociados a tu cuenta." />;
  const consultaActiva = vista === 'facturas' ? facturas : deuda;

  return (
    <Pantalla refrescando={consultaActiva.cargando} alRefrescar={() => { facturas.recargar(); deuda.recargar(); }}>
      <SelectorHijo />
      <AvisoSinConexion visible={consultaActiva.desdeCache} sincronizadoEn={consultaActiva.sincronizadoEn} />
      {deuda.datos ? (
        <Tarjeta estilo={{ backgroundColor: deuda.datos.deuda_total > 0 ? colores.alertaClaro : colores.exitoClaro, borderColor: 'transparent' }}>
          <Text style={s.textoSuave}>Saldo pendiente total</Text>
          <Text style={s.monto}>{pesos(deuda.datos.deuda_total)}</Text>
        </Tarjeta>
      ) : null}
      <View style={s.filaChips}>
        <Chip texto="Facturas y cuotas" activo={vista === 'facturas'} alPresionar={() => setVista('facturas')} />
        <Chip texto="Historial de deuda" activo={vista === 'deuda'} alPresionar={() => setVista('deuda')} />
      </View>

      {vista === 'facturas' ? (
        <>
          <View style={s.filaChips}>
            {FILTROS.map(x => <Chip key={x.id} texto={x.texto} activo={filtro === x.id} alPresionar={() => setFiltro(x.id)} />)}
            <Chip texto="Elegir período" activo={filtro === 'custom'} alPresionar={() => setFiltro('custom')} />
          </View>
          {filtro === 'custom' ? (
            <View style={{ flexDirection: 'row', gap: espacio.s }}>
              <View style={{ flex: 1 }}><Campo etiqueta="Desde (AAAA-MM)" value={desde} onChangeText={setDesde} placeholder="2026-01" maxLength={7} /></View>
              <View style={{ flex: 1 }}><Campo etiqueta="Hasta (AAAA-MM)" value={hasta} onChangeText={setHasta} placeholder="2026-12" maxLength={7} /></View>
            </View>
          ) : null}
          <Contenido consulta={facturas}>
            {lista => lista.length === 0 ? <Vacio texto="No hay facturas en el período elegido." icono="receipt-outline" /> : lista.map(fa => (
              <Tarjeta key={fa.id_factura} alPresionar={() => navigation.navigate('Factura', { idFactura: fa.id_factura })} etiqueta={`Factura ${fa.periodo}`}>
                <View style={s.filaEntre}>
                  <Text style={[s.texto, s.negrita]}>Período {fa.periodo}</Text>
                  <Estado estado={fa.estado} />
                </View>
                <Text style={s.textoSuave}>Factura {fa.numero} · Vence {fecha(fa.fecha_vencimiento)}</Text>
                <View style={[s.filaEntre, { marginTop: espacio.s }]}>
                  <Text style={s.texto}>Importe {pesos(fa.total)}</Text>
                  <Text style={[s.negrita, { color: fa.saldo > 0 ? colores.texto : colores.exito }]}>{fa.saldo > 0 ? `Saldo ${pesos(fa.saldo)}` : 'Pagada'}</Text>
                </View>
                {fa.en_revision > 0 ? <Text style={[s.textoSuave, { color: colores.alerta }]}>{pesos(fa.en_revision)} en revisión</Text> : null}
                {fa.comprobantes.length ? <Text style={s.textoSuave}>{fa.comprobantes.length} comprobante(s) de pago</Text> : null}
              </Tarjeta>
            ))}
          </Contenido>
        </>
      ) : (
        <Contenido consulta={deuda}>
          {dd => (
            <>
              <Seccion titulo="Por concepto">
                <Tarjeta>
                  {dd.por_tipo.length === 0 ? <Text style={s.textoSuave}>Sin facturación todavía.</Text> : dd.por_tipo.map(t => (
                    <Fila key={t.tipo} titulo={TIPO[t.tipo] ?? t.tipo} detalle={`Facturado ${pesos(t.facturado)} · Pagado ${pesos(t.pagado)}`}
                      derecha={<Text style={[s.negrita, { color: t.saldo > 0 ? colores.error : colores.exito }]}>{pesos(t.saldo)}</Text>} />
                  ))}
                </Tarjeta>
              </Seccion>
              <Seccion titulo="Detalle por ítem">
                {dd.items.map(i => (
                  <Tarjeta key={i.id_item}>
                    <View style={s.filaEntre}>
                      <Text style={[s.texto, s.negrita, { flex: 1 }]}>{i.descripcion}</Text>
                      <Text style={[s.negrita, { color: i.saldo > 0 ? colores.error : colores.exito }]}>{i.saldo > 0 ? pesos(i.saldo) : 'Pagado'}</Text>
                    </View>
                    <Text style={s.textoSuave}>Período {i.periodo} · Vence {fecha(i.fecha_vencimiento)} · Importe {pesos(i.monto)}</Text>
                    {i.pagado > 0 && i.saldo > 0 ? <Text style={s.textoSuave}>Pagado {pesos(i.pagado)}</Text> : null}
                    {i.en_revision > 0 ? <Text style={[s.textoSuave, { color: colores.alerta }]}>{pesos(i.en_revision)} en revisión</Text> : null}
                  </Tarjeta>
                ))}
              </Seccion>
            </>
          )}
        </Contenido>
      )}
    </Pantalla>
  );
}

// ── Detalle de factura: ítems, comprobantes, PDF y selección de ítems a pagar ─

export function PantallaFactura({ route, navigation }: any) {
  const { perfil } = useSesion();
  const idFactura: number = route.params.idFactura;
  const consulta = useConsulta(`factura-${idFactura}`, () => pagosRepo.factura(idFactura));
  const [seleccion, setSeleccion] = useState<Record<number, string>>({});
  const [descargando, setDescargando] = useState(false);
  const esPadre = perfil?.usuario.rol === 'PADRE';

  const alternar = (id: number, disponible: number) =>
    setSeleccion(prev => {
      const n = { ...prev };
      if (n[id] != null) delete n[id]; else n[id] = String(disponible);
      return n;
    });
  const totalSel = Object.values(seleccion).reduce((t, v) => t + (Number(v.replace(',', '.')) || 0), 0);

  const descargarPDF = async () => {
    setDescargando(true);
    try {
      await api.renovar().catch(() => false);   // asegura un token vigente para la descarga
      const destino = new File(Paths.cache, `Factura-${idFactura}.pdf`);
      if (destino.exists) destino.delete();
      const archivo = await File.downloadFileAsync(`${config.apiUrl}/movil/facturas/${idFactura}/pdf`, destino, {
        headers: { Authorization: `Bearer ${api.getToken()}`, 'X-Cliente': 'movil' }
      });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(archivo.uri, { mimeType: 'application/pdf', dialogTitle: 'Factura' });
      else Alert.alert('Factura descargada', archivo.uri);
    } catch (e) {
      Alert.alert('No se pudo descargar', 'Revisá tu conexión e intentá nuevamente.');
    } finally { setDescargando(false); }
  };

  const continuar = () => {
    const items = Object.entries(seleccion).map(([id, v]) => ({ id_item: Number(id), monto: Number(v.replace(',', '.')) }));
    const item = consulta.datos!.items;
    for (const it of items) {
      const orig = item.find(x => x.id_item === it.id_item)!;
      if (!(it.monto > 0) || it.monto > orig.disponible) return Alert.alert('Importe inválido', `Revisá el importe de "${orig.descripcion}" (máximo ${pesos(orig.disponible)}).`);
    }
    navigation.navigate('Pagar', { idFactura, items, total: items.reduce((t, i) => t + i.monto, 0), numero: consulta.datos!.numero });
  };

  return (
    <Pantalla refrescando={consulta.cargando} alRefrescar={consulta.recargar}>
      <AvisoSinConexion visible={consulta.desdeCache} sincronizadoEn={consulta.sincronizadoEn} />
      <Contenido consulta={consulta}>
        {f => (
          <>
            <Tarjeta>
              <View style={s.filaEntre}>
                <Text style={[s.titulo, { fontSize: 19 }]}>Período {f.periodo}</Text>
                <Estado estado={f.estado} />
              </View>
              <Text style={s.textoSuave}>Factura {f.numero} · {f.alumno}</Text>
              <Text style={s.textoSuave}>Emitida {fecha(f.fecha_emision)} · Vence {fecha(f.fecha_vencimiento)}</Text>
              <View style={[s.filaEntre, { marginTop: espacio.m }]}>
                <View><Text style={s.textoSuave}>Total</Text><Text style={s.monto}>{pesos(f.total)}</Text></View>
                <View style={{ alignItems: 'flex-end' }}><Text style={s.textoSuave}>Saldo</Text><Text style={[s.monto, { color: f.saldo > 0 ? colores.error : colores.exito }]}>{pesos(f.saldo)}</Text></View>
              </View>
              <Boton texto="Descargar factura (PDF)" icono="document-outline" variante="secundario" cargando={descargando} alPresionar={descargarPDF} />
            </Tarjeta>

            <Seccion titulo={esPadre ? 'Elegí los ítems a pagar' : 'Composición'}>
              {f.items.map(i => {
                const elegido = seleccion[i.id_item] != null;
                const pagable = esPadre && i.disponible > 0;
                return (
                  <Tarjeta key={i.id_item} alPresionar={pagable ? () => alternar(i.id_item, i.disponible) : undefined} etiqueta={`${elegido ? 'Quitar' : 'Elegir'} ${i.descripcion}`}
                    estilo={elegido ? { borderColor: colores.primario, borderWidth: 2 } : undefined}>
                    <View style={s.filaEntre}>
                      {pagable ? <Ionicons name={elegido ? 'checkbox' : 'square-outline'} size={24} color={colores.primario} style={{ marginRight: espacio.s }} /> : null}
                      <Text style={[s.texto, { flex: 1 }]}>{i.descripcion}</Text>
                      <Text style={s.negrita}>{pesos(i.monto)}</Text>
                    </View>
                    {i.pagado > 0 ? <Text style={[s.textoSuave, { color: colores.exito }]}>Pagado {pesos(i.pagado)}</Text> : null}
                    {i.en_revision > 0 ? <Text style={[s.textoSuave, { color: colores.alerta }]}>En revisión {pesos(i.en_revision)}</Text> : null}
                    {elegido ? (
                      <View style={[s.filaEntre, { marginTop: espacio.s }]}>
                        <Text style={s.textoSuave}>Importe a pagar</Text>
                        <TextInput value={seleccion[i.id_item]} onChangeText={v => setSeleccion(p => ({ ...p, [i.id_item]: v }))} keyboardType="decimal-pad"
                          accessibilityLabel={`Importe a pagar de ${i.descripcion}`} style={[s.campo, { width: 140, textAlign: 'right' }]} />
                      </View>
                    ) : null}
                  </Tarjeta>
                );
              })}
              {esPadre && f.saldo > 0 ? (
                <Boton texto={totalSel > 0 ? `Informar pago de ${pesos(totalSel)}` : 'Elegí al menos un ítem'} icono="card-outline" deshabilitado={totalSel <= 0} alPresionar={continuar} />
              ) : null}
            </Seccion>

            <Seccion titulo="Historial de pagos">
              {f.comprobantes.length === 0 ? <Text style={s.textoSuave}>Todavía no se informaron pagos para esta factura.</Text> : f.comprobantes.map(c => (
                <Tarjeta key={c.id_comprobante}>
                  <View style={s.filaEntre}>
                    <Text style={[s.texto, s.negrita]}>{c.numero}</Text>
                    <Estado estado={c.estado} />
                  </View>
                  <Text style={s.textoSuave}>Transferencia {c.nro_operacion} del {fecha(c.fecha_transferencia)} · {pesos(c.monto)}</Text>
                  {c.items.map((it, k) => <Text key={k} style={s.textoSuave}>• {it.descripcion}: {pesos(Number(it.monto))}</Text>)}
                  {c.observacion ? <Text style={[s.textoSuave, { color: colores.error }]}>Motivo: {c.observacion}</Text> : null}
                  <Text style={s.textoSuave}>Cargado {fechaHora(c.creado_en)}</Text>
                </Tarjeta>
              ))}
            </Seccion>
          </>
        )}
      </Contenido>
    </Pantalla>
  );
}

// ── Informar pago por transferencia y obtener el comprobante ────────────────

export function PantallaPagar({ route, navigation }: any) {
  const { idFactura, items, total, numero } = route.params as { idFactura: number; items: { id_item: number; monto: number }[]; total: number; numero: string };
  const hoy = new Date();
  const [nroOperacion, setNroOperacion] = useState('');
  const [fechaTransf, setFechaTransf] = useState(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`);
  const [archivo, setArchivo] = useState<{ nombre: string; tipo: string; base64: string } | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ numero: string; monto: number; items: { descripcion: string; monto: number }[] } | null>(null);

  const elegirArchivo = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true, base64: true });
    if (r.canceled) return;
    const a = r.assets[0];
    if (a.size && a.size > MAX_BYTES) return Alert.alert('Archivo muy grande', 'El comprobante no puede superar los 3 MB.');
    let base64 = a.base64;
    if (!base64) base64 = await new File(a.uri).base64();
    const tipo = a.mimeType ?? (a.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    setArchivo({ nombre: a.name, tipo, base64 });
  };

  const enviar = async () => {
    const e: Record<string, string> = {};
    if (!nroOperacion.trim()) e.nro = 'Ingresá el número de operación de la transferencia.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaTransf)) e.fecha = 'Usá el formato AAAA-MM-DD.';
    if (!archivo) e.archivo = 'Adjuntá la imagen o PDF del comprobante.';
    setErrores(e);
    if (Object.keys(e).length) return;
    if (!(await hayConexion())) return Alert.alert('Sin conexión', 'Para informar un pago necesitás conexión a internet.');
    setEnviando(true);
    try {
      const r = await pagosRepo.informarPago(idFactura, { nro_operacion: nroOperacion.trim(), fecha_transferencia: fechaTransf, items, archivo: archivo! });
      setResultado(r.comprobante);
    } catch (err) {
      Alert.alert('No se pudo registrar el pago', (err as Error).message);
    } finally { setEnviando(false); }
  };

  if (resultado) {
    return (
      <Pantalla>
        <View style={[s.centro, { paddingBottom: 0 }]}>
          <Ionicons name="checkmark-circle" size={72} color={colores.exito} />
          <Text style={[s.titulo, { textAlign: 'center' }]}>Comprobante de pago emitido</Text>
        </View>
        <Tarjeta>
          <Text style={s.textoSuave}>Número de comprobante</Text>
          <Text style={[s.monto, { color: colores.primario }]}>{resultado.numero}</Text>
          <Text style={[s.texto, { marginTop: espacio.s }]}>Factura {numero} · Transferencia {nroOperacion}</Text>
          {resultado.items.map((it, k) => <Fila key={k} titulo={it.descripcion} derecha={<Text style={s.negrita}>{pesos(it.monto)}</Text>} />)}
          <View style={[s.filaEntre, { marginTop: espacio.s }]}><Text style={s.negrita}>Total informado</Text><Text style={s.monto}>{pesos(resultado.monto)}</Text></View>
          <Text style={[s.textoSuave, { marginTop: espacio.m }]}>Administración verificará la transferencia. Te avisaremos cuando el pago quede acreditado.</Text>
        </Tarjeta>
        <Boton texto="Volver a la factura" alPresionar={() => navigation.goBack()} />
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <Tarjeta estilo={{ backgroundColor: colores.primarioClaro, borderColor: 'transparent' }}>
        <Text style={s.textoSuave}>Total a transferir</Text>
        <Text style={s.monto}>{pesos(total)}</Text>
        <Text style={[s.texto, { marginTop: espacio.s }]}>Solo se aceptan transferencias bancarias (no hay pagos en efectivo).</Text>
        <DatoCopiable etiqueta="CBU" valor={config.banco.cbu} />
        <DatoCopiable etiqueta="Alias" valor={config.banco.alias} />
        <Text style={s.textoSuave}>Titular: {config.banco.titular}</Text>
      </Tarjeta>
      <Seccion titulo="Datos de la transferencia">
        <Campo etiqueta="Número de operación" value={nroOperacion} onChangeText={setNroOperacion} error={errores.nro} autoCapitalize="characters" maxLength={60} />
        <Campo etiqueta="Fecha de la transferencia (AAAA-MM-DD)" value={fechaTransf} onChangeText={setFechaTransf} error={errores.fecha} maxLength={10} />
        <Text style={s.etiqueta}>Comprobante</Text>
        <Pressable onPress={elegirArchivo} accessibilityRole="button" accessibilityLabel="Adjuntar comprobante"
          style={[s.tarjeta, { borderStyle: 'dashed', alignItems: 'center', borderColor: errores.archivo ? colores.error : colores.borde }]}>
          <Ionicons name={archivo ? 'document-attach' : 'cloud-upload-outline'} size={32} color={colores.primario} />
          <Text style={[s.texto, { marginTop: 4 }]}>{archivo ? archivo.nombre : 'Adjuntar imagen o PDF (máx. 3 MB)'}</Text>
        </Pressable>
        {errores.archivo ? <Text style={{ color: colores.error, marginTop: -8, marginBottom: espacio.m }}>{errores.archivo}</Text> : null}
      </Seccion>
      <Boton texto="Enviar comprobante" icono="send-outline" alPresionar={enviar} cargando={enviando} />
    </Pantalla>
  );
}

/** Dato bancario seleccionable (mantener presionado para copiar) */
function DatoCopiable({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={[s.fila, { borderBottomWidth: 0 }]}>
      <Text style={[s.texto, { flex: 1 }]} selectable accessibilityLabel={`${etiqueta} ${valor}`}>
        <Text style={s.negrita}>{etiqueta}: </Text>{valor}
      </Text>
    </View>
  );
}
