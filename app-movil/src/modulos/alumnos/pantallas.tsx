/** Módulo Alumnos: inicio del padre, datos académicos (RFM-04, RFM-05) e inscripciones (RFM-06/07/08). */
import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { AvisoSinConexion, Boton, Chip, Contenido, Fila, Pantalla, Seccion, Tarjeta, Titulo, Vacio, s } from '../../componentes/ui';
import { colores, espacio, fecha, pesos } from '../../tema';
import { hayConexion, useConsulta } from '../../nucleo/hooks';
import { config } from '../../config';
import { api } from '../../nucleo/apiClient';
import { alumnosRepo, pagosRepo } from '../../repositorios';
import { useSesion } from '../acceso/sesion';
import { SelectorHijo, useHijo } from './hijo';
import type { ResumenAlumno } from '../../modelos';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

// ── Inicio del padre ────────────────────────────────────────────────────────

export function PantallaInicioPadre({ navigation }: any) {
  const { perfil } = useSesion();
  const { hijos, setIdHijo } = useHijo();
  const pagos = useConsulta('pagos-resumen', pagosRepo.resumen);
  const saldoDe = (id: number) => pagos.datos?.find(p => p.id_alumno === id);

  return (
    <Pantalla refrescando={pagos.cargando} alRefrescar={pagos.recargar}>
      <Titulo sub="Elegí a tu hijo para ver su información académica.">Hola, {perfil?.usuario.nombre}</Titulo>
      <AvisoSinConexion visible={pagos.desdeCache} sincronizadoEn={pagos.sincronizadoEn} />
      {hijos.length > 0 ? (
        <Tarjeta alPresionar={() => navigation.navigate('Credencial')} etiqueta="Ver credenciales digitales" estilo={{ backgroundColor: colores.primarioClaro }}>
          <Fila icono="qr-code-outline" titulo="Credencial digital" detalle="QR para portería y transporte. Te avisamos cuando entran y salen." />
        </Tarjeta>
      ) : null}
      {hijos.length === 0 ? <Vacio texto="No hay alumnos asociados a tu cuenta. Consultá con administración." /> : hijos.map(h => {
        const p = saldoDe(h.id_alumno);
        return (
          <Tarjeta key={h.id_alumno} alPresionar={() => navigation.navigate('Alumno', { idAlumno: h.id_alumno, nombre: h.nombre })} etiqueta={`Ver datos de ${h.nombre}`}>
            <View style={s.filaEntre}>
              <View style={{ flex: 1 }}>
                <Text style={[s.texto, s.negrita, { fontSize: 18 }]}>{h.nombre} {h.apellido}</Text>
                <Text style={s.textoSuave}>{h.curso ?? 'Sin curso'}{h.nivel ? ` · ${h.nivel}` : ''} · Legajo {h.legajo}</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colores.textoSuave} />
            </View>
            {p ? (
              <View style={[s.filaEntre, { marginTop: espacio.m }]}>
                <Text style={{ color: p.saldo > 0 ? (p.vencidas ? colores.error : colores.alerta) : colores.exito }}>
                  {p.saldo > 0 ? `Saldo pendiente ${pesos(p.saldo)}${p.vencidas ? ' · con cuotas vencidas' : ''}` : 'Cuotas al día'}
                </Text>
                {p.saldo > 0 ? <Boton texto="Pagar" variante="secundario" alPresionar={() => { setIdHijo(h.id_alumno); navigation.navigate('CuotasTab'); }} /> : null}
              </View>
            ) : null}
          </Tarjeta>
        );
      })}
    </Pantalla>
  );
}

// ── Datos académicos (padre o estudiante) ───────────────────────────────────

export function PantallaAlumno({ route, navigation }: any) {
  const { perfil } = useSesion();
  const idAlumno: number | undefined = route?.params?.idAlumno ?? perfil?.alumno?.id_alumno;
  const consulta = useConsulta(idAlumno ? `resumen-${idAlumno}` : null, () => alumnosRepo.resumen(idAlumno!));
  const [vista, setVista] = useState<'materias' | 'horarios' | 'servicios'>('materias');
  const [descargando, setDescargando] = useState(false);

  /** Boletín de calificaciones en PDF (el mismo que genera la web) */
  const descargarBoletin = async () => {
    setDescargando(true);
    try {
      await api.renovar().catch(() => false);
      const destino = new File(Paths.cache, `Boletin-${idAlumno}.pdf`);
      if (destino.exists) destino.delete();
      const archivo = await File.downloadFileAsync(`${config.apiUrl}/movil/alumnos/${idAlumno}/boletin/pdf`, destino, {
        headers: { Authorization: `Bearer ${api.getToken()}`, 'X-Cliente': 'movil' }
      });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(archivo.uri, { mimeType: 'application/pdf', dialogTitle: 'Boletín' });
      else Alert.alert('Boletín descargado', archivo.uri);
    } catch {
      Alert.alert('No se pudo descargar', 'Revisá tu conexión e intentá nuevamente.');
    } finally { setDescargando(false); }
  };

  if (!idAlumno) return <Vacio texto="Tu usuario no está asociado a un legajo de alumno." />;
  return (
    <Pantalla refrescando={consulta.cargando} alRefrescar={consulta.recargar}>
      <AvisoSinConexion visible={consulta.desdeCache} sincronizadoEn={consulta.sincronizadoEn} />
      <Contenido consulta={consulta}>
        {d => (
          <>
            <Tarjeta>
              <Text style={[s.titulo, { fontSize: 20 }]}>{d.alumno.nombre} {d.alumno.apellido}</Text>
              <Text style={s.textoSuave}>{d.alumno.curso ?? 'Sin curso asignado'}{d.alumno.nivel ? ` · ${d.alumno.nivel}` : ''}{d.alumno.ciclo ? ` · ${d.alumno.ciclo}` : ''}</Text>
              <Text style={s.textoSuave}>Legajo {d.alumno.legajo} · {d.alumno.estado}</Text>
              <Boton texto="Ficha de salud" icono="medkit-outline" variante="secundario" estilo={{ marginTop: espacio.s }}
                alPresionar={() => navigation.navigate('FichaSalud', { idAlumno, nombre: d.alumno.nombre })} />
              <Boton texto="Descargar boletín (PDF)" icono="document-outline" variante="secundario" cargando={descargando}
                alPresionar={descargarBoletin} />
            </Tarjeta>
            <View style={[s.filaChips, { marginBottom: espacio.s }]}>
              <Chip texto="Materias y notas" activo={vista === 'materias'} alPresionar={() => setVista('materias')} />
              <Chip texto="Horarios" activo={vista === 'horarios'} alPresionar={() => setVista('horarios')} />
              <Chip texto="Inscripciones" activo={vista === 'servicios'} alPresionar={() => setVista('servicios')} />
            </View>
            {vista === 'materias' ? <VistaMaterias d={d} /> : vista === 'horarios' ? <VistaHorarios d={d} /> : <VistaServicios d={d} />}
          </>
        )}
      </Contenido>
    </Pantalla>
  );
}

function VistaMaterias({ d }: { d: ResumenAlumno }) {
  if (d.materias.length === 0) return <Vacio texto="El curso todavía no tiene materias asignadas." />;
  return (
    <>
      {d.materias.map(m => (
        <Tarjeta key={m.id_materia}>
          <View style={s.filaEntre}>
            <Text style={[s.texto, s.negrita, { flex: 1 }]}>{m.nombre}</Text>
            {m.promedio != null ? <Text style={[s.negrita, { color: m.promedio >= 6 ? colores.exito : colores.error }]}>{m.promedio.toFixed(2)}</Text> : null}
          </View>
          <Text style={s.textoSuave}>Profesor/a: {m.profesor ?? 'A designar'} · {m.carga_horaria} hs semanales</Text>
          {m.notas.length ? (
            <View style={[s.filaChips, { marginTop: espacio.s }]}>
              {m.notas.map(n => <Chip key={n.trimestre} texto={`${n.trimestre}° trim: ${n.nota}`} />)}
            </View>
          ) : <Text style={[s.textoSuave, { marginTop: 4 }]}>Sin calificaciones cargadas</Text>}
        </Tarjeta>
      ))}
    </>
  );
}

function VistaHorarios({ d }: { d: ResumenAlumno }) {
  const extra = d.deportes.map(x => ({ dias: x.dia_semana, inicio: x.inicio, fin: x.fin, nombre: x.nombre }));
  if (d.horarios.length === 0 && extra.length === 0) return <Vacio texto="No hay horarios cargados." />;
  return (
    <>
      {DIAS.map(dia => {
        const bloques = d.horarios.filter(h => h.dia === dia);
        const deportes = extra.filter(x => x.dias.normalize('NFD').replace(/[̀-ͯ]/g, '').includes(dia.normalize('NFD').replace(/[̀-ͯ]/g, '')));
        if (!bloques.length && !deportes.length) return null;
        return (
          <Seccion key={dia} titulo={dia}>
            <Tarjeta>
              {bloques.map(b => <Fila key={b.inicio} icono="time-outline" titulo={b.materia ?? ''} detalle={`${b.inicio} - ${b.fin}${b.aula ? ` · ${b.aula}` : ''}`} />)}
              {deportes.map(x => <Fila key={x.nombre} icono="football-outline" titulo={x.nombre} detalle={`${x.inicio} - ${x.fin} · Deporte`} />)}
            </Tarjeta>
          </Seccion>
        );
      })}
    </>
  );
}

function VistaServicios({ d }: { d: ResumenAlumno }) {
  return (
    <>
      <Seccion titulo={`Deportes (${d.deportes.length}/2)`}>
        <Tarjeta>
          {d.deportes.length === 0 ? <Text style={s.textoSuave}>Sin deportes inscriptos.</Text> :
            d.deportes.map(x => <Fila key={x.id_deporte} icono="football-outline" titulo={x.nombre} detalle={`${x.dia_semana} ${x.inicio}-${x.fin} · Prof. ${x.profesor ?? '-'}`} />)}
        </Tarjeta>
      </Seccion>
      <Seccion titulo="Transporte">
        <Tarjeta>
          {d.transporte ? <Fila icono="bus-outline" titulo={d.transporte.nombre} detalle={`Parada: ${d.transporte.parada} · Ida ${d.transporte.horario_ida} · Vuelta ${d.transporte.horario_vuelta}`} />
            : <Text style={s.textoSuave}>No usa el servicio de transporte.</Text>}
        </Tarjeta>
      </Seccion>
      <Seccion titulo="Comedor">
        <Tarjeta>
          {d.comedor ? <Fila icono="restaurant-outline" titulo="Inscripto en el comedor" detalle={`Desde ${fecha(d.comedor.fecha_inscripcion)}`} />
            : <Text style={s.textoSuave}>No está inscripto en el comedor.</Text>}
        </Tarjeta>
      </Seccion>
    </>
  );
}

// ── Inscripciones (solo padre) ──────────────────────────────────────────────

/** Ejecuta una gestión que requiere conexión y muestra el resultado o el rechazo de la API */
async function gestionar(accion: () => Promise<{ mensaje: string }>, alTerminar: () => void, setOcupado: (v: string | null) => void, clave: string) {
  if (!(await hayConexion())) {
    Alert.alert('Sin conexión', 'Las inscripciones requieren conexión a internet. Intentá nuevamente cuando tengas señal.');
    return;
  }
  setOcupado(clave);
  try {
    const r = await accion();
    Alert.alert('Listo', r.mensaje);
    alTerminar();
  } catch (e) {
    Alert.alert('No se pudo completar', (e as Error).message);
  } finally {
    setOcupado(null);
  }
}

export function PantallaInscripciones() {
  const { hijo } = useHijo();
  const id = hijo?.id_alumno;
  const resumen = useConsulta(id ? `resumen-${id}` : null, () => alumnosRepo.resumen(id!));
  const deportes = useConsulta('deportes', alumnosRepo.deportes);
  const recorridos = useConsulta('recorridos', alumnosRepo.recorridos);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [recorridoSel, setRecorridoSel] = useState<number | null>(null);
  const [paradaSel, setParadaSel] = useState<string | null>(null);

  if (!hijo) return <Vacio texto="No hay alumnos asociados a tu cuenta." />;
  const recargar = () => { resumen.recargar(); deportes.recargar(); };
  const offline = resumen.desdeCache || deportes.desdeCache;

  return (
    <Pantalla refrescando={resumen.cargando} alRefrescar={recargar}>
      <SelectorHijo />
      <AvisoSinConexion visible={offline} sincronizadoEn={resumen.sincronizadoEn} />
      <Contenido consulta={resumen}>
        {d => {
          const inscriptos = new Set(d.deportes.map(x => x.id_deporte));
          const actual = d.transporte;
          const recSel = recorridoSel ?? actual?.recorrido_numero ?? null;
          const recorrido = recorridos.datos?.find(r => r.numero === recSel);
          const parada = paradaSel ?? (recSel === actual?.recorrido_numero ? actual?.parada : recorrido?.paradas[0]) ?? null;
          return (
            <>
              <Seccion titulo={`Deportes · ${d.deportes.length} de 2`}>
                <Text style={[s.textoSuave, { marginBottom: espacio.s }]}>Máximo 2 deportes sin superposición horaria. El sistema rechaza los choques de horario.</Text>
                {(deportes.datos ?? []).map(dep => {
                  const yaEsta = inscriptos.has(dep.id_deporte);
                  const otroNivel = dep.id_nivel != null && d.alumno.id_nivel != null && dep.id_nivel !== d.alumno.id_nivel;
                  return (
                    <Tarjeta key={dep.id_deporte} estilo={otroNivel ? { opacity: 0.6 } : undefined}>
                      <View style={s.filaEntre}>
                        <Text style={[s.texto, s.negrita]}>{dep.nombre}</Text>
                        <Text style={s.negrita}>{pesos(dep.precio_mensual)}/mes</Text>
                      </View>
                      <Text style={s.textoSuave}>{dep.dia_semana} · {dep.hora_inicio} a {dep.hora_fin} · {dep.nivel_nombre ?? 'Todos los niveles'}</Text>
                      <Text style={s.textoSuave}>Cupo: {dep.inscriptos_actuales}/{dep.cupo_maximo}</Text>
                      {otroNivel ? <Text style={[s.textoSuave, { marginTop: 4 }]}>Grupo de otro nivel educativo.</Text> : yaEsta ? (
                        <Boton texto="Dar de baja" variante="peligro" cargando={ocupado === `d${dep.id_deporte}`} alPresionar={() =>
                          Alert.alert('Dar de baja', `¿Dar de baja a ${hijo.nombre} de ${dep.nombre}?`, [
                            { text: 'Cancelar', style: 'cancel' },
                            { text: 'Dar de baja', style: 'destructive', onPress: () => gestionar(() => alumnosRepo.bajaDeporte(hijo.id_alumno, dep.id_deporte), recargar, setOcupado, `d${dep.id_deporte}`) }
                          ])} />
                      ) : (
                        <Boton texto="Inscribir" variante="secundario" icono="add-circle-outline" cargando={ocupado === `d${dep.id_deporte}`}
                          alPresionar={() => gestionar(() => alumnosRepo.inscribirDeporte(hijo.id_alumno, dep.id_deporte), recargar, setOcupado, `d${dep.id_deporte}`)} />
                      )}
                    </Tarjeta>
                  );
                })}
              </Seccion>

              <Seccion titulo="Transporte escolar">
                <Tarjeta>
                  <Text style={[s.texto, { marginBottom: espacio.s }]}>
                    {actual ? `Inscripto en ${actual.nombre} (parada ${actual.parada}). Podés cambiar de recorrido.` : 'Elegí uno de los 4 recorridos.'}
                  </Text>
                  <View style={s.filaChips}>
                    {(recorridos.datos ?? []).map(r => (
                      <Chip key={r.numero} texto={`${r.numero} · ${r.zona}`} activo={r.numero === recSel} alPresionar={() => { setRecorridoSel(r.numero); setParadaSel(null); }} />
                    ))}
                  </View>
                  {recorrido ? (
                    <>
                      <Text style={s.textoSuave}>Ida {recorrido.horario_ida} · Vuelta {recorrido.horario_vuelta} · {pesos(recorrido.precio)}/mes</Text>
                      <Text style={[s.etiqueta, { marginTop: espacio.m }]}>Parada</Text>
                      <View style={s.filaChips}>
                        {recorrido.paradas.map(p => <Chip key={p} texto={p} activo={p === parada} alPresionar={() => setParadaSel(p)} />)}
                      </View>
                      <Boton texto={actual ? 'Guardar cambio de recorrido' : 'Inscribir al transporte'} icono="bus-outline" cargando={ocupado === 't'}
                        deshabilitado={actual?.recorrido_numero === recSel && actual?.parada === parada}
                        alPresionar={() => gestionar(() => alumnosRepo.asignarTransporte(hijo.id_alumno, recorrido.numero, parada!), () => { setRecorridoSel(null); setParadaSel(null); recargar(); }, setOcupado, 't')} />
                    </>
                  ) : null}
                  {actual ? <Boton texto="Dar de baja el transporte" variante="texto" cargando={ocupado === 'tb'}
                    alPresionar={() => gestionar(() => alumnosRepo.bajaTransporte(hijo.id_alumno), recargar, setOcupado, 'tb')} /> : null}
                </Tarjeta>
              </Seccion>

              <Seccion titulo="Comedor">
                <Tarjeta>
                  {d.comedor ? (
                    <>
                      <Fila icono="checkmark-circle" titulo="Inscripto en el comedor" detalle={`Desde ${fecha(d.comedor.fecha_inscripcion)} · ${pesos(d.comedor.precio)}/mes`} />
                      <Boton texto="Dar de baja el comedor" variante="texto" cargando={ocupado === 'c'}
                        alPresionar={() => gestionar(() => alumnosRepo.bajaComedor(hijo.id_alumno), recargar, setOcupado, 'c')} />
                    </>
                  ) : (
                    <>
                      <Text style={[s.texto, { marginBottom: espacio.s }]}>Almuerzo diario supervisado por nutricionistas.</Text>
                      <Boton texto="Inscribir al comedor" icono="restaurant-outline" variante="secundario" cargando={ocupado === 'c'}
                        alPresionar={() => gestionar(() => alumnosRepo.inscribirComedor(hijo.id_alumno), recargar, setOcupado, 'c')} />
                    </>
                  )}
                </Tarjeta>
              </Seccion>
            </>
          );
        }}
      </Contenido>
    </Pantalla>
  );
}
