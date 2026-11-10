/**
 * Administración en la app (modo reducido): indicadores del día, validación de comprobantes
 * y asistencia. La gestión completa (usuarios, reportes, tarifas) sigue en el panel web.
 */
import React, { useState } from 'react';
import { Alert, Linking, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { Boton, Chip, Contenido, Fila, Pantalla, Seccion, Tarjeta, Titulo, Vacio, s } from '../../componentes/ui';
import { colores, espacio, fecha, fechaHora, pesos } from '../../tema';
import { config } from '../../config';
import { api, ErrorApi } from '../../nucleo/apiClient';
import { useConsulta } from '../../nucleo/hooks';
import { adminRepo } from '../../repositorios';
import { useSesion } from '../acceso/sesion';
import type { ComprobanteAdmin } from '../../modelos';

type Icono = React.ComponentProps<typeof Ionicons>['name'];

function Indicador({ icono, valor, texto, color = colores.primario, alPresionar }: { icono: Icono; valor: string | number; texto: string; color?: string; alPresionar?: () => void }) {
  return (
    <Tarjeta estilo={{ flex: 1, minWidth: '45%', marginHorizontal: 4 }} alPresionar={alPresionar} etiqueta={`${texto}: ${valor}`}>
      <Ionicons name={icono} size={24} color={color} />
      <Text style={[s.titulo, { marginTop: 4 }]}>{valor}</Text>
      <Text style={s.textoSuave}>{texto}</Text>
    </Tarjeta>
  );
}

export function PantallaAdminInicio({ navigation }: any) {
  const { perfil } = useSesion();
  const consulta = useConsulta('admin-resumen', adminRepo.resumen);
  return (
    <Pantalla refrescando={consulta.cargando} alRefrescar={consulta.recargar}>
      <Titulo sub="Administración">Hola, {perfil?.usuario.nombre}</Titulo>
      <Contenido consulta={consulta}>
        {r => (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
              <Indicador icono="receipt-outline" valor={r.comprobantes_pendientes} texto={`Comprobantes por revisar (${pesos(r.monto_pendiente)})`}
                color={r.comprobantes_pendientes ? colores.acentoTexto : colores.exito} alPresionar={() => navigation.navigate('Comprobantes')} />
              <Indicador icono="checkmark-done-outline" valor={r.presentes_hoy} texto="Ingresos registrados hoy" color={colores.secundario} alPresionar={() => navigation.navigate('AsistenciaAdmin')} />
              <Indicador icono="people-outline" valor={r.alumnos} texto="Alumnos activos" />
              <Indicador icono="school-outline" valor={r.docentes} texto="Docentes" />
              <Indicador icono="person-add-outline" valor={r.preinscripciones} texto="Preinscripciones pendientes" />
              <Indicador icono="chatbubbles-outline" valor={r.consultas_pendientes} texto="Consultas web sin responder" />
            </View>
          </>
        )}
      </Contenido>
      <Seccion titulo="Accesos rápidos">
        <Boton texto="Asistencia del día" icono="list-outline" variante="secundario" alPresionar={() => navigation.navigate('AsistenciaAdmin')} />
        <Boton texto="Iniciar sesión en la web con QR" icono="qr-code-outline" variante="secundario" alPresionar={() => navigation.navigate('Escaner', { modo: 'autorizar-web' })} />
        <Boton texto="Abrir el panel web completo" icono="open-outline" variante="secundario" alPresionar={() => Linking.openURL(`${config.origen}/html/login-admin.html`)} />
        <Text style={[s.textoSuave, { marginTop: espacio.s }]}>Usuarios, reportes, tarifas y facturación se gestionan desde el panel web.</Text>
      </Seccion>
    </Pantalla>
  );
}

export function PantallaComprobantesAdmin() {
  const [estado, setEstado] = useState<'PENDIENTE' | 'APROBADO' | 'RECHAZADO'>('PENDIENTE');
  const consulta = useConsulta(`admin-comprobantes-${estado}`, () => adminRepo.comprobantes(estado));
  return (
    <Pantalla refrescando={consulta.cargando} alRefrescar={consulta.recargar}>
      <View style={[s.filaChips, { marginBottom: espacio.m }]}>
        <Chip texto="Por revisar" activo={estado === 'PENDIENTE'} alPresionar={() => setEstado('PENDIENTE')} />
        <Chip texto="Aprobados" activo={estado === 'APROBADO'} alPresionar={() => setEstado('APROBADO')} />
        <Chip texto="Rechazados" activo={estado === 'RECHAZADO'} alPresionar={() => setEstado('RECHAZADO')} />
      </View>
      <Contenido consulta={consulta}>
        {lista => lista.length === 0
          ? <Vacio texto={estado === 'PENDIENTE' ? 'No hay comprobantes por revisar.' : 'No hay comprobantes en este estado.'} icono="receipt-outline" />
          : <>{lista.slice(0, 50).map(c => <TarjetaComprobante key={c.id_comprobante} c={c} alCambiar={consulta.recargar} />)}</>}
      </Contenido>
    </Pantalla>
  );
}

function TarjetaComprobante({ c, alCambiar }: { c: ComprobanteAdmin; alCambiar: () => void }) {
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [abriendo, setAbriendo] = useState(false);

  const revisar = async (estado: 'APROBADO' | 'RECHAZADO') => {
    if (estado === 'RECHAZADO' && !motivo.trim()) return Alert.alert('Falta el motivo', 'Indicá por qué se rechaza el comprobante.');
    setOcupado(true);
    try {
      const r = await adminRepo.revisar(c.id_comprobante, estado, motivo.trim() || undefined);
      Alert.alert('Listo', r.mensaje);
      alCambiar();
    } catch (e) {
      Alert.alert('No se pudo guardar', e instanceof ErrorApi ? e.message : 'Revisá tu conexión.');
    } finally { setOcupado(false); }
  };
  const confirmarAprobar = () => Alert.alert('Aprobar comprobante', `¿Acreditar ${pesos(c.monto)} de ${c.alumno}?`, [
    { text: 'Cancelar', style: 'cancel' }, { text: 'Aprobar', onPress: () => revisar('APROBADO') }
  ]);

  const verArchivo = async () => {
    setAbriendo(true);
    try {
      await api.renovar().catch(() => false);
      const extension = (c.archivo_nombre || '').split('.').pop() || 'jpg';
      const destino = new File(Paths.cache, `comprobante-${c.id_comprobante}.${extension}`);
      if (destino.exists) destino.delete();
      const archivo = await File.downloadFileAsync(`${config.apiUrl}/movil/comprobantes/${c.id_comprobante}/archivo`, destino, {
        headers: { Authorization: `Bearer ${api.getToken()}`, 'X-Cliente': 'movil' }
      });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(archivo.uri, { dialogTitle: `Comprobante ${c.numero}` });
      else Alert.alert('Archivo descargado', archivo.uri);
    } catch {
      Alert.alert('No se pudo abrir', 'Revisá tu conexión e intentá nuevamente.');
    } finally { setAbriendo(false); }
  };

  return (
    <Tarjeta>
      <View style={s.filaEntre}>
        <Text style={[s.texto, s.negrita, { flex: 1 }]}>{c.alumno}</Text>
        <Text style={[s.texto, s.negrita]}>{pesos(c.monto)}</Text>
      </View>
      <Text style={s.textoSuave}>{c.numero} · Factura {c.factura} ({c.periodo})</Text>
      <Text style={s.textoSuave}>Operación {c.nro_operacion} · transferido el {fecha(c.fecha_transferencia)}</Text>
      <Text style={s.textoSuave}>Recibido {fechaHora(c.creado_en)}</Text>
      {c.items.map((i, k) => <Fila key={k} icono="pricetag-outline" titulo={i.descripcion} detalle={pesos(i.monto)} />)}
      {c.observacion ? <Text style={[s.textoSuave, { marginTop: 4 }]}>Motivo: {c.observacion}</Text> : null}
      {c.tiene_archivo ? <Boton texto="Ver archivo adjunto" icono="document-attach-outline" variante="texto" cargando={abriendo} alPresionar={verArchivo} /> : null}
      {c.estado === 'PENDIENTE' ? (
        rechazando ? (
          <View>
            <Text style={s.etiqueta}>Motivo del rechazo</Text>
            <TextInput value={motivo} onChangeText={setMotivo} placeholder="Ej: el monto no coincide con la transferencia" maxLength={200}
              style={s.campo} accessibilityLabel="Motivo del rechazo" placeholderTextColor={colores.textoSuave} />
            <Boton texto="Confirmar rechazo" icono="close-circle-outline" variante="peligro" cargando={ocupado} alPresionar={() => revisar('RECHAZADO')} estilo={{ marginTop: espacio.s }} />
            <Boton texto="Cancelar" variante="texto" alPresionar={() => setRechazando(false)} />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: espacio.s, marginTop: espacio.s }}>
            <Boton texto="Aprobar" icono="checkmark-circle-outline" cargando={ocupado} alPresionar={confirmarAprobar} estilo={{ flex: 1 }} />
            <Boton texto="Rechazar" icono="close-circle-outline" variante="peligro" alPresionar={() => setRechazando(true)} estilo={{ flex: 1 }} />
          </View>
        )
      ) : null}
    </Tarjeta>
  );
}

export function PantallaAsistenciaAdmin() {
  const consulta = useConsulta('admin-asistencia', adminRepo.asistencia);
  const [filtro, setFiltro] = useState<'todos' | 'presentes' | 'ausentes'>('ausentes');
  return (
    <Pantalla refrescando={consulta.cargando} alRefrescar={consulta.recargar}>
      <Contenido consulta={consulta}>
        {d => {
          const lista = d.alumnos.filter(a => filtro === 'todos' || (filtro === 'presentes' ? a.presente : !a.presente));
          const cursos = [...new Set(lista.map(a => `${a.curso}${a.division ? ' ' + a.division : ''} · ${a.nivel}`))];
          return (
            <>
              <Tarjeta estilo={{ backgroundColor: colores.primarioClaro, borderColor: 'transparent' }}>
                <Text style={[s.texto, s.negrita]}>{fecha(d.fecha)}: {d.presentes} presente(s) y {d.ausentes} ausente(s) de {d.total}</Text>
                <Text style={s.textoSuave}>Según los ingresos registrados con la credencial QR en portería.</Text>
              </Tarjeta>
              <View style={[s.filaChips, { marginVertical: espacio.s }]}>
                <Chip texto="Ausentes" activo={filtro === 'ausentes'} alPresionar={() => setFiltro('ausentes')} />
                <Chip texto="Presentes" activo={filtro === 'presentes'} alPresionar={() => setFiltro('presentes')} />
                <Chip texto="Todos" activo={filtro === 'todos'} alPresionar={() => setFiltro('todos')} />
              </View>
              {lista.length === 0 ? <Vacio texto="No hay alumnos en esta lista." icono="people-outline" /> : cursos.map(curso => (
                <Seccion key={curso} titulo={curso}>
                  <Tarjeta>
                    {lista.filter(a => `${a.curso}${a.division ? ' ' + a.division : ''} · ${a.nivel}` === curso).map(a => (
                      <Fila key={a.legajo} icono={a.presente ? 'checkmark-circle' : 'ellipse-outline'} titulo={a.alumno}
                        detalle={a.presente ? `Ingreso ${a.ingreso ?? '-'}${a.egreso ? ` · salida ${a.egreso}` : ''}` : `Legajo ${a.legajo} · sin ingreso`} />
                    ))}
                  </Tarjeta>
                </Seccion>
              ))}
            </>
          );
        }}
      </Contenido>
    </Pantalla>
  );
}
