/**
 * Planilla de calificaciones: el docente carga o corrige las notas de un trimestre para todo el curso.
 * Usa la misma tabla de calificaciones que el panel web, así ambos quedan sincronizados.
 * Dejar la nota vacía borra la que estaba cargada. Se envían solo los cambios.
 */
import React, { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { Boton, Chip, Contenido, Pantalla, Tarjeta, Vacio, s } from '../../componentes/ui';
import { colores, espacio } from '../../tema';
import { useConsulta } from '../../nucleo/hooks';
import { ErrorApi } from '../../nucleo/apiClient';
import { notasRepo } from '../../repositorios';
import type { FilaPlanilla } from '../../modelos';

type Cambio = { nota: string; obs: string };
type Pendiente = { id_alumno: number; trimestre: number; nota: number | null; observacion: string | null };

const clave = (idAlumno: number, t: number) => `${idAlumno}-${t}`;
const aNumero = (t: string) => (t.trim() === '' ? null : Number(t.replace(',', '.')));
const conComa = (n: number) => n.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');

function original(f: FilaPlanilla, t: number) {
  return {
    nota: (t === 1 ? f.t1 : t === 2 ? f.t2 : f.t3) ?? null,
    obs: (t === 1 ? f.obs1 : t === 2 ? f.obs2 : f.obs3) ?? ''
  };
}

export function PantallaPlanilla({ route }: any) {
  const { idCurso, idMateria } = route.params as { idCurso: number; idMateria: number };
  const consulta = useConsulta(`planilla-${idCurso}-${idMateria}`, () => notasRepo.planilla(idCurso, idMateria), { alEnfocar: false });
  const [trimestre, setTrimestre] = useState<1 | 2 | 3>(1);
  const [cambios, setCambios] = useState<Record<string, Cambio>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  const valor = (f: FilaPlanilla, t: number): Cambio => {
    const c = cambios[clave(f.id_alumno, t)];
    if (c) return c;
    const o = original(f, t);
    return { nota: o.nota == null ? '' : conComa(o.nota), obs: o.obs };
  };
  const cambiar = (f: FilaPlanilla, campo: keyof Cambio, v: string) =>
    setCambios(prev => ({ ...prev, [clave(f.id_alumno, trimestre)]: { ...valor(f, trimestre), [campo]: v } }));

  const pendientes = (filas: FilaPlanilla[]): Pendiente[] => {
    const lista: Pendiente[] = [];
    for (const f of filas) for (const t of [1, 2, 3]) {
      const c = cambios[clave(f.id_alumno, t)];
      if (!c) continue;
      const o = original(f, t);
      const nueva = aNumero(c.nota);
      if (nueva === o.nota && c.obs.trim() === (o.obs || '')) continue;
      lista.push({ id_alumno: f.id_alumno, trimestre: t, nota: nueva, observacion: c.obs.trim() || null });
    }
    return lista;
  };

  const guardar = async (filas: FilaPlanilla[]) => {
    const lista = pendientes(filas);
    const e: Record<string, string> = {};
    for (const n of lista) {
      if (n.nota != null && (!Number.isFinite(n.nota) || n.nota < 1 || n.nota > 10)) e[clave(n.id_alumno, n.trimestre)] = 'La nota va de 1 a 10.';
    }
    setErrores(e);
    if (Object.keys(e).length) return Alert.alert('Revisá las notas', 'Hay notas fuera del rango de 1 a 10.');
    if (!lista.length) return Alert.alert('Sin cambios', 'No modificaste ninguna nota.');
    setGuardando(true);
    try {
      const r = await notasRepo.guardar(idCurso, idMateria, lista);
      setCambios({});
      Alert.alert('Notas guardadas', r.mensaje);
      consulta.recargar();
    } catch (err) {
      Alert.alert('No se pudo guardar', err instanceof ErrorApi ? err.message : 'Revisá tu conexión e intentá nuevamente.');
    } finally { setGuardando(false); }
  };

  return (
    <Pantalla refrescando={consulta.cargando} alRefrescar={consulta.recargar}>
      <Contenido consulta={consulta}>
        {p => {
          const cantidad = pendientes(p.alumnos).length;
          return (
            <>
              <Text style={[s.textoSuave, { marginBottom: espacio.s }]}>Notas de 1 a 10 (con coma para decimales). Dejá el campo vacío para borrar una nota. Las familias reciben un aviso.</Text>
              <View style={[s.filaChips, { marginBottom: espacio.m }]}>
                {([1, 2, 3] as const).map(t => <Chip key={t} texto={`${t}° trimestre`} activo={trimestre === t} alPresionar={() => setTrimestre(t)} />)}
              </View>
              {p.alumnos.length === 0 ? <Vacio texto="No hay alumnos activos en este curso para la materia." icono="people-outline" /> : p.alumnos.map(f => {
                const v = valor(f, trimestre);
                const notas = [1, 2, 3].map(t => aNumero(valor(f, t).nota)).filter((n): n is number => n != null && Number.isFinite(n));
                const prom = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null;
                const error = errores[clave(f.id_alumno, trimestre)];
                const modificado = !!cambios[clave(f.id_alumno, trimestre)];
                return (
                  <Tarjeta key={f.id_alumno}>
                    <View style={s.filaEntre}>
                      <View style={{ flex: 1, marginRight: espacio.m }}>
                        <Text style={[s.texto, s.negrita]}>{f.apellido}, {f.nombre}</Text>
                        <Text style={s.textoSuave}>Legajo {f.legajo}{prom != null ? ` · promedio ${conComa(prom)}` : ''}</Text>
                      </View>
                      <TextInput
                        value={v.nota} onChangeText={t => cambiar(f, 'nota', t.replace(/[^0-9.,]/g, ''))}
                        keyboardType="decimal-pad" maxLength={5} placeholder="-" placeholderTextColor={colores.textoSuave}
                        accessibilityLabel={`Nota del ${trimestre}° trimestre de ${f.nombre} ${f.apellido}`}
                        style={[s.campo, { width: 76, textAlign: 'center', fontSize: 18, fontWeight: '700' },
                          error ? { borderColor: colores.error } : modificado ? { borderColor: colores.acento, borderWidth: 2 } : null]} />
                    </View>
                    <TextInput
                      value={v.obs} onChangeText={t => cambiar(f, 'obs', t)} maxLength={100}
                      placeholder="Observación (opcional)" placeholderTextColor={colores.textoSuave}
                      accessibilityLabel={`Observación de ${f.nombre} ${f.apellido}`}
                      style={[s.campo, { marginTop: espacio.s, fontSize: 14 }]} />
                    {error ? <Text style={{ color: colores.error, marginTop: 4 }}>{error}</Text> : null}
                  </Tarjeta>
                );
              })}
              {p.alumnos.length ? (
                <Boton texto={cantidad ? `Guardar ${cantidad} cambio(s)` : 'Guardar notas'} icono="save-outline" cargando={guardando}
                  alPresionar={() => guardar(p.alumnos)} estilo={{ marginBottom: espacio.xl }} />
              ) : null}
            </>
          );
        }}
      </Contenido>
    </Pantalla>
  );
}
