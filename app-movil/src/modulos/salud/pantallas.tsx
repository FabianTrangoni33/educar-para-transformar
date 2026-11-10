/**
 * Ficha de salud del alumno (datos sensibles).
 * - Familia y administración: ven y editan.
 * - Docentes del curso y el propio alumno: solo lectura.
 * Los datos no se guardan en el caché del teléfono: se consultan siempre al servidor.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Linking, Switch, Text, View } from 'react-native';
import { Boton, Campo, Cargando, Chip, ErrorCarga, Fila, Pantalla, Seccion, Tarjeta, s } from '../../componentes/ui';
import { colores, espacio, fecha } from '../../tema';
import { ErrorApi } from '../../nucleo/apiClient';
import { saludRepo } from '../../repositorios';
import type { FichaSalud } from '../../modelos';

const GRUPOS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', '0+', '0-'];
const VACIA: FichaSalud = {
  grupo_sanguineo: null, alergias: null, medicacion: null, condiciones: null, obra_social: null, nro_afiliado: null,
  emergencia_nombre: null, emergencia_telefono: null, emergencia_parentesco: null, observaciones: null,
  autoriza_imagen: false, autoriza_salidas: false
};

export function PantallaFichaSalud({ route, navigation }: any) {
  const idAlumno: number = route.params.idAlumno;
  const [ficha, setFicha] = useState<FichaSalud | null>(null);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [editando, setEditando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    setCargando(true);
    try {
      const r = await saludRepo.ver(idAlumno);
      setFicha(r.ficha);
      setPuedeEditar(r.puede_editar);
      setEditando(!r.ficha && r.puede_editar);
      setError(null);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar la ficha.');
    } finally { setCargando(false); }
  };
  useEffect(() => { cargar(); }, [idAlumno]);

  if (cargando && !ficha) return <Cargando texto="Cargando ficha de salud..." />;
  if (error) return <ErrorCarga mensaje={error} alReintentar={cargar} />;
  if (editando) return <FormularioSalud idAlumno={idAlumno} inicial={ficha ?? VACIA} alGuardar={() => { setEditando(false); cargar(); }}
    alCancelar={ficha ? () => setEditando(false) : () => navigation.goBack()} />;

  return (
    <Pantalla refrescando={cargando} alRefrescar={cargar}>
      <Text style={[s.textoSuave, { marginBottom: espacio.m }]}>Datos confidenciales: solo los ven la familia, los docentes del curso y la administración. Cada consulta queda registrada.</Text>
      {!ficha ? (
        <Tarjeta><Text style={s.texto}>La familia todavía no completó la ficha de salud.</Text></Tarjeta>
      ) : (
        <>
          <Seccion titulo="Salud">
            <Tarjeta>
              <Fila icono="water-outline" titulo="Grupo sanguíneo" detalle={ficha.grupo_sanguineo || 'Sin dato'} />
              <Fila icono="alert-circle-outline" titulo="Alergias" detalle={ficha.alergias || 'Ninguna'} />
              <Fila icono="medkit-outline" titulo="Medicación" detalle={ficha.medicacion || 'Ninguna'} />
              <Fila icono="pulse-outline" titulo="Condiciones" detalle={ficha.condiciones || 'Ninguna'} />
              <Fila icono="card-outline" titulo="Obra social" detalle={[ficha.obra_social, ficha.nro_afiliado].filter(Boolean).join(' · ') || 'Sin dato'} />
              {ficha.observaciones ? <Fila icono="document-text-outline" titulo="Observaciones" detalle={ficha.observaciones} /> : null}
            </Tarjeta>
          </Seccion>
          <Seccion titulo="Contacto de emergencia">
            <Tarjeta>
              <Fila icono="call-outline" titulo={ficha.emergencia_nombre || '-'} detalle={[ficha.emergencia_parentesco, ficha.emergencia_telefono].filter(Boolean).join(' · ')} />
              {ficha.emergencia_telefono ? <Boton texto="Llamar" icono="call-outline" variante="secundario" alPresionar={() => Linking.openURL(`tel:${ficha.emergencia_telefono}`)} /> : null}
            </Tarjeta>
          </Seccion>
          <Seccion titulo="Autorizaciones">
            <Tarjeta>
              <Fila icono={ficha.autoriza_imagen ? 'checkmark-circle' : 'close-circle-outline'} titulo="Uso de imagen" detalle={ficha.autoriza_imagen ? 'Autorizado' : 'No autorizado'} />
              <Fila icono={ficha.autoriza_salidas ? 'checkmark-circle' : 'close-circle-outline'} titulo="Salidas educativas" detalle={ficha.autoriza_salidas ? 'Autorizadas' : 'No autorizadas'} />
            </Tarjeta>
          </Seccion>
          {ficha.actualizado_en ? <Text style={[s.textoSuave, { marginBottom: espacio.m }]}>Actualizada el {fecha(ficha.actualizado_en)}{ficha.actualizado_por_nombre ? ` por ${ficha.actualizado_por_nombre}` : ''}.</Text> : null}
        </>
      )}
      {puedeEditar ? <Boton texto={ficha ? 'Editar ficha' : 'Completar ficha'} icono="create-outline" alPresionar={() => setEditando(true)} /> : null}
    </Pantalla>
  );
}

function FormularioSalud({ idAlumno, inicial, alGuardar, alCancelar }: { idAlumno: number; inicial: FichaSalud; alGuardar: () => void; alCancelar: () => void }) {
  const [f, setF] = useState<FichaSalud>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const cambiar = (campo: keyof FichaSalud) => (v: string) => setF(prev => ({ ...prev, [campo]: v }));
  const texto = (campo: keyof FichaSalud) => (f[campo] as string | null) ?? '';

  const guardar = async () => {
    const e: Record<string, string> = {};
    if (!texto('emergencia_nombre').trim()) e.emergencia_nombre = 'Indicá quién responde en una emergencia.';
    if (!/^[\d\s()+-]{6,30}$/.test(texto('emergencia_telefono').trim())) e.emergencia_telefono = 'Ingresá un teléfono válido.';
    setErrores(e);
    if (Object.keys(e).length) return;
    setGuardando(true);
    try {
      const r = await saludRepo.guardar(idAlumno, f);
      Alert.alert('Listo', r.mensaje);
      alGuardar();
    } catch (err) {
      Alert.alert('No se pudo guardar', err instanceof ErrorApi ? err.message : 'Revisá tu conexión e intentá nuevamente.');
    } finally { setGuardando(false); }
  };

  return (
    <Pantalla>
      <Text style={s.etiqueta}>Grupo sanguíneo</Text>
      <View style={[s.filaChips, { marginBottom: espacio.m }]}>
        <Chip texto="Sin dato" activo={!f.grupo_sanguineo} alPresionar={() => setF(p => ({ ...p, grupo_sanguineo: null }))} />
        {GRUPOS.map(g => <Chip key={g} texto={g} activo={f.grupo_sanguineo === g} alPresionar={() => setF(p => ({ ...p, grupo_sanguineo: g }))} />)}
      </View>
      <Campo etiqueta="Alergias" value={texto('alergias')} onChangeText={cambiar('alergias')} placeholder="Ej: penicilina, maní" multiline maxLength={500} />
      <Campo etiqueta="Medicación habitual" value={texto('medicacion')} onChangeText={cambiar('medicacion')} placeholder="Nombre, dosis y horario" multiline maxLength={500} />
      <Campo etiqueta="Condiciones o enfermedades" value={texto('condiciones')} onChangeText={cambiar('condiciones')} placeholder="Ej: asma, celiaquía" multiline maxLength={500} />
      <Campo etiqueta="Obra social / prepaga" value={texto('obra_social')} onChangeText={cambiar('obra_social')} maxLength={100} />
      <Campo etiqueta="N.º de afiliado" value={texto('nro_afiliado')} onChangeText={cambiar('nro_afiliado')} maxLength={50} />
      <Text style={[s.texto, s.negrita, { marginVertical: espacio.s }]}>Contacto de emergencia</Text>
      <Campo etiqueta="Nombre y apellido *" value={texto('emergencia_nombre')} onChangeText={cambiar('emergencia_nombre')} error={errores.emergencia_nombre} maxLength={100} />
      <Campo etiqueta="Teléfono *" value={texto('emergencia_telefono')} onChangeText={cambiar('emergencia_telefono')} error={errores.emergencia_telefono} keyboardType="phone-pad" maxLength={30} />
      <Campo etiqueta="Parentesco" value={texto('emergencia_parentesco')} onChangeText={cambiar('emergencia_parentesco')} placeholder="Ej: abuela" maxLength={40} />
      <Campo etiqueta="Observaciones" value={texto('observaciones')} onChangeText={cambiar('observaciones')} multiline maxLength={800} />
      <Interruptor texto="Autorizo el uso de su imagen en publicaciones del colegio" valor={f.autoriza_imagen} alCambiar={v => setF(p => ({ ...p, autoriza_imagen: v }))} />
      <Interruptor texto="Autorizo salidas educativas acompañadas por docentes" valor={f.autoriza_salidas} alCambiar={v => setF(p => ({ ...p, autoriza_salidas: v }))} />
      <Boton texto="Guardar ficha" icono="save-outline" cargando={guardando} alPresionar={guardar} />
      <Boton texto="Cancelar" variante="texto" alPresionar={alCancelar} />
    </Pantalla>
  );
}

function Interruptor({ texto, valor, alCambiar }: { texto: string; valor: boolean; alCambiar: (v: boolean) => void }) {
  return (
    <View style={[s.filaEntre, { marginBottom: espacio.m, minHeight: 48 }]}>
      <Text style={[s.texto, { flex: 1, marginRight: espacio.m }]}>{texto}</Text>
      <Switch value={valor} onValueChange={alCambiar} accessibilityLabel={texto}
        trackColor={{ true: colores.secundario, false: colores.borde }} thumbColor="#fff" />
    </View>
  );
}
