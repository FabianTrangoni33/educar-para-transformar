/** Módulo Docentes: materias y cursos asignados con sus horarios (RFM-09). */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AvisoSinConexion, Contenido, Fila, Pantalla, Seccion, Tarjeta, Titulo, Vacio, s } from '../../componentes/ui';
import { colores, espacio } from '../../tema';
import { useConsulta } from '../../nucleo/hooks';
import { docentesRepo } from '../../repositorios';
import { useSesion } from '../acceso/sesion';

export function PantallaDocente() {
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
