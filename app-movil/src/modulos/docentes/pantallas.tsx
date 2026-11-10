/** Módulo Docentes: materias y cursos asignados con sus horarios (RFM-09) y alumnos de cada curso. */
import React, { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AvisoSinConexion, Boton, Contenido, Fila, Pantalla, Seccion, Tarjeta, Titulo, Vacio, s } from '../../componentes/ui';
import { colores, espacio } from '../../tema';
import { useConsulta } from '../../nucleo/hooks';
import { docentesRepo } from '../../repositorios';
import { useSesion } from '../acceso/sesion';

export function PantallaDocente({ navigation }: any) {
  const { perfil } = useSesion();
  const consulta = useConsulta('docente-asignaciones', docentesRepo.asignaciones);
  const [abierta, setAbierta] = useState<number | null>(null);

  return (
    <Pantalla refrescando={consulta.cargando} alRefrescar={consulta.recargar}>
      <Titulo sub={perfil?.docente?.especialidad ?? undefined}>Hola, {perfil?.usuario.nombre}</Titulo>
      <AvisoSinConexion visible={consulta.desdeCache} sincronizadoEn={consulta.sincronizadoEn} />
      <Contenido consulta={consulta}>
        {d => {
          if (d.asignaciones.length === 0 && d.deportes.length === 0) {
            return <Vacio texto="Sin asignaciones. Cuando administración te asigne materias, aparecerán acá." icono="briefcase-outline" />;
          }
          const niveles = [...new Set(d.asignaciones.map(a => a.nivel ?? 'Sin nivel'))];
          return (
            <>
              {niveles.map(nivel => (
                <Seccion key={nivel} titulo={`Nivel ${nivel}`}>
                  {d.asignaciones.filter(a => (a.nivel ?? 'Sin nivel') === nivel).map(a => (
                    <Tarjeta key={a.id_asignacion} alPresionar={() => setAbierta(abierta === a.id_asignacion ? null : a.id_asignacion)} etiqueta={`${a.materia} en ${a.curso}`}>
                      <View style={s.filaEntre}>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.texto, s.negrita]}>{a.materia}</Text>
                          <Text style={s.textoSuave}>{a.curso ?? 'Sin curso'}{a.division ? ` "${a.division}"` : ''} · {a.alumnos} alumno(s) · {a.carga_horaria} hs</Text>
                        </View>
                        <Ionicons name={abierta === a.id_asignacion ? 'chevron-up' : 'chevron-down'} size={20} color={colores.textoSuave} />
                      </View>
                      {abierta === a.id_asignacion ? (
                        <View style={{ marginTop: espacio.s }}>
                          {a.horarios.length === 0 ? <Text style={s.textoSuave}>Sin horarios cargados.</Text> :
                            a.horarios.map((h, i) => <Fila key={i} icono="time-outline" titulo={h.dia} detalle={`${h.inicio} - ${h.fin}${h.aula ? ` · ${h.aula}` : ''}`} />)}
                          {a.id_curso ? (
                            <Boton texto={`Ver alumnos (${a.alumnos})`} icono="people-outline" variante="secundario"
                              alPresionar={() => navigation.navigate('AlumnosCurso', { idCurso: a.id_curso, titulo: `${a.curso ?? 'Curso'}${a.division ? ` "${a.division}"` : ''}` })} />
                          ) : null}
                        </View>
                      ) : null}
                    </Tarjeta>
                  ))}
                </Seccion>
              ))}
              {d.deportes.length ? (
                <Seccion titulo="Deportes a cargo">
                  <Tarjeta>
                    {d.deportes.map(x => <Fila key={x.id_deporte} icono="football-outline" titulo={x.nombre}
                      detalle={`${x.dia_semana} ${x.inicio}-${x.fin} · ${x.nivel ?? 'Todos'} · ${x.inscriptos} inscriptos`} />)}
                  </Tarjeta>
                </Seccion>
              ) : null}
            </>
          );
        }}
      </Contenido>
    </Pantalla>
  );
}

/** Alumnos activos de un curso del docente, con el contacto de sus tutores. */
export function PantallaAlumnosCurso({ route }: any) {
  const idCurso: number = route.params.idCurso;
  const consulta = useConsulta(`docente-curso-${idCurso}`, () => docentesRepo.alumnosDeCurso(idCurso));
  const [abierto, setAbierto] = useState<number | null>(null);
  return (
    <Pantalla refrescando={consulta.cargando} alRefrescar={consulta.recargar}>
      <AvisoSinConexion visible={consulta.desdeCache} sincronizadoEn={consulta.sincronizadoEn} />
      <Contenido consulta={consulta}>
        {lista => lista.length === 0 ? <Vacio texto="El curso todavía no tiene alumnos activos." icono="people-outline" /> : (
          <Seccion titulo={`${lista.length} alumno(s)`}>
            {lista.map(a => (
              <Tarjeta key={a.id_alumno} alPresionar={() => setAbierto(abierto === a.id_alumno ? null : a.id_alumno)} etiqueta={`${a.apellido}, ${a.nombre}`}>
                <View style={s.filaEntre}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.texto, s.negrita]}>{a.apellido}, {a.nombre}</Text>
                    <Text style={s.textoSuave}>Legajo {a.legajo}{a.edad != null ? ` · ${a.edad} años` : ''}</Text>
                  </View>
                  <Ionicons name={abierto === a.id_alumno ? 'chevron-up' : 'chevron-down'} size={20} color={colores.textoSuave} />
                </View>
                {abierto === a.id_alumno ? (
                  <View style={{ marginTop: espacio.s }}>
                    {a.tutores.length === 0 ? <Text style={s.textoSuave}>Sin tutores cargados.</Text> : a.tutores.map((t, i) => (
                      <View key={i}>
                        <Fila icono="people-outline" titulo={t.nombre} detalle={t.parentesco ? t.parentesco.charAt(0) + t.parentesco.slice(1).toLowerCase() : null} />
                        {t.telefono ? <Boton texto={`Llamar ${t.telefono}`} icono="call-outline" variante="texto" alPresionar={() => Linking.openURL(`tel:${t.telefono}`)} /> : null}
                      </View>
                    ))}
                  </View>
                ) : null}
              </Tarjeta>
            ))}
          </Seccion>
        )}
      </Contenido>
    </Pantalla>
  );
}
