/**
 * Sección pública de la app, igual que en la web: detalle de cada nivel, preinscripción 2027,
 * consultas al centro educativo y postulaciones laborales. No requieren iniciar sesión.
 */
import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Boton, Campo, Chip, Fila, Pantalla, Seccion, Tarjeta, Titulo, s } from '../../componentes/ui';
import { colores, espacio } from '../../tema';
import { institucionalRepo } from '../../repositorios';
import { ErrorApi } from '../../nucleo/apiClient';

type Nivel = 'inicial' | 'primario' | 'secundario';
type IconoFila = React.ComponentProps<typeof Fila>['icono'];

const NIVELES: Record<Nivel, { titulo: string; sub: string; intro: string; bloques: { titulo: string; items: { icono: IconoFila; nombre: string; detalle: string }[] }[] }> = {
  inicial: {
    titulo: 'Nivel Inicial',
    sub: 'Salas de 3, 4 y 5 años',
    intro: 'Un espacio cálido donde los más pequeños aprenden jugando, exploran el mundo y desarrollan su autonomía con acompañamiento cercano de las familias.',
    bloques: [
      { titulo: 'Ejes de trabajo', items: [
        { icono: 'body-outline', nombre: 'Desarrollo Psicomotriz', detalle: 'Juego, movimiento y expresión corporal.' },
        { icono: 'bulb-outline', nombre: 'Estimulación Cognitiva', detalle: 'Curiosidad, lenguaje y pensamiento.' },
        { icono: 'heart-outline', nombre: 'Vinculación Segura', detalle: 'Adaptación gradual y vínculo con la familia.' }
      ] },
      { titulo: 'Propuesta', items: [
        { icono: 'time-outline', nombre: 'Jornada extendida', detalle: 'Talleres y actividades por la tarde.' },
        { icono: 'tablet-portrait-outline', nombre: 'Alfabetización digital', detalle: 'Primeros pasos con la tecnología, con sentido pedagógico.' },
        { icono: 'language-outline', nombre: 'Proyecto trilingüe', detalle: 'Inglés, portugués y francés desde la sala de 3.' }
      ] }
    ]
  },
  primario: {
    titulo: 'Nivel Primario',
    sub: '1° a 7° grado',
    intro: 'Formamos lectores, escritores y pensadores críticos, con una base sólida en matemática, ciencias y lenguas.',
    bloques: [
      { titulo: 'Ejes de trabajo', items: [
        { icono: 'calculator-outline', nombre: 'Pensamiento Lógico', detalle: 'Resolución de problemas y razonamiento matemático.' },
        { icono: 'flask-outline', nombre: 'Indagación Científica', detalle: 'Experimentación en laboratorio y proyectos.' },
        { icono: 'laptop-outline', nombre: 'Alfabetización Digital', detalle: 'Programación inicial y uso responsable de la tecnología.' },
        { icono: 'people-outline', nombre: 'Trabajo Colaborativo', detalle: 'Proyectos en equipo y valores de convivencia.' }
      ] }
    ]
  },
  secundario: {
    titulo: 'Nivel Secundario',
    sub: 'Ciclo Básico y Ciclo Orientado',
    intro: 'Preparamos a los jóvenes para los estudios superiores y el mundo del trabajo, con orientaciones y laboratorios de física, química y computación.',
    bloques: [
      { titulo: 'Ciclo Básico', items: [
        { icono: 'library-outline', nombre: 'Metodología de Estudio', detalle: 'Técnicas para aprender a aprender.' },
        { icono: 'globe-outline', nombre: 'Inglés FCE', detalle: 'Preparación para el First Certificate.' },
        { icono: 'cash-outline', nombre: 'Educación Financiera', detalle: 'Ahorro, consumo responsable y emprendimiento.' },
        { icono: 'code-slash-outline', nombre: 'Lógica y Programación', detalle: 'Pensamiento computacional aplicado.' },
        { icono: 'mic-outline', nombre: 'Oratoria', detalle: 'Expresión oral y argumentación.' }
      ] },
      { titulo: 'Ciclo Orientado', items: [
        { icono: 'briefcase-outline', nombre: 'Economía y Administración', detalle: 'Gestión de organizaciones y contabilidad.' },
        { icono: 'hardware-chip-outline', nombre: 'Informática y Sistemas', detalle: 'Programación, redes y bases de datos.' },
        { icono: 'earth-outline', nombre: 'Ciencias Sociales', detalle: 'Historia, ciudadanía y comunicación.' },
        { icono: 'medkit-outline', nombre: 'Química y Salud', detalle: 'Laboratorio y ciencias de la salud.' }
      ] }
    ]
  }
};

const mensajeError = (err: unknown) => err instanceof ErrorApi ? err.message : 'Revisá tu conexión e intentá nuevamente.';
const correoValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

function Opciones({ etiqueta, opciones, valor, alCambiar, error }: { etiqueta: string; opciones: readonly string[]; valor: string; alCambiar: (v: string) => void; error?: string }) {
  return (
    <View style={{ marginBottom: espacio.m }}>
      <Text style={s.etiqueta}>{etiqueta}</Text>
      <View style={s.filaChips}>{opciones.map(o => <Chip key={o} texto={o} activo={valor === o} alPresionar={() => alCambiar(o)} />)}</View>
      {error ? <Text style={{ color: colores.error }}>{error}</Text> : null}
    </View>
  );
}

export function PantallaNivel({ navigation, route }: any) {
  const clave: Nivel = NIVELES[route.params?.nivel as Nivel] ? route.params.nivel : 'primario';
  const n = NIVELES[clave];
  return (
    <Pantalla>
      <Titulo sub={n.sub}>{n.titulo}</Titulo>
      <Tarjeta><Text style={s.texto}>{n.intro}</Text></Tarjeta>
      {n.bloques.map(b => (
        <Seccion key={b.titulo} titulo={b.titulo}>
          <Tarjeta>{b.items.map(i => <Fila key={i.nombre} icono={i.icono} titulo={i.nombre} detalle={i.detalle} />)}</Tarjeta>
        </Seccion>
      ))}
      <Boton texto="Preinscribir para 2027" icono="document-text-outline" alPresionar={() => navigation.navigate('Preinscripcion', { nivel: clave })} />
      <Boton texto="Hacer una consulta" icono="chatbubble-ellipses-outline" variante="secundario" alPresionar={() => navigation.navigate('Consulta')} estilo={{ marginBottom: espacio.xl }} />
    </Pantalla>
  );
}

const NIVEL_ETIQUETA = { inicial: 'Inicial', primario: 'Primario', secundario: 'Secundario' } as const;
const VINCULOS = ['Madre', 'Padre', 'Tutor Legal'] as const;
const GRUPOS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', '0+', '0-'] as const;

export function PantallaPreinscripcion({ navigation, route }: any) {
  const inicial = NIVEL_ETIQUETA[route.params?.nivel as Nivel] ?? '';
  const [d, setD] = useState<Record<string, string>>({ nivelIngresa: inicial, vinculo: '' });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [codigo, setCodigo] = useState<string | null>(null);
  const campo = (k: string) => ({ value: d[k] ?? '', onChangeText: (v: string) => setD(p => ({ ...p, [k]: v })), error: errores[k] });

  const enviar = async () => {
    const e: Record<string, string> = {};
    if (!d.nombreAlumno?.trim()) e.nombreAlumno = 'Ingresá el nombre del alumno.';
    if (!/^\d{7,9}$/.test(d.dniAlumno ?? '')) e.dniAlumno = 'DNI de 7 a 9 dígitos, sin puntos.';
    const edad = Number(d.edadAlumno);
    if (!d.edadAlumno || !Number.isInteger(edad) || edad < 2 || edad > 19) e.edadAlumno = 'Edad entre 2 y 19 años.';
    if (!d.nivelIngresa) e.nivelIngresa = 'Elegí el nivel.';
    if (!d.nombreTutor?.trim()) e.nombreTutor = 'Ingresá el nombre del responsable.';
    if (!d.vinculo) e.vinculo = 'Elegí el vínculo.';
    if (!/^\d{7,9}$/.test(d.dniTutor ?? '')) e.dniTutor = 'DNI de 7 a 9 dígitos, sin puntos.';
    if (!/^[\d\s()+-]{6,30}$/.test(d.telefonoTutor ?? '')) e.telefonoTutor = 'Ingresá un teléfono válido.';
    if (d.telefonoEmergencia && !/^[\d\s()+-]{6,30}$/.test(d.telefonoEmergencia)) e.telefonoEmergencia = 'Teléfono no válido.';
    setErrores(e);
    if (Object.keys(e).length) return Alert.alert('Revisá el formulario', 'Hay datos incompletos o con errores.');
    setEnviando(true);
    try {
      const datos = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, String(v).trim()]).filter(([, v]) => v));
      const r = await institucionalRepo.preinscribir(datos);
      setCodigo(r.codigo_tramite);
    } catch (err) {
      Alert.alert('No se pudo enviar', mensajeError(err));
    } finally { setEnviando(false); }
  };

  if (codigo) {
    return (
      <Pantalla>
        <Tarjeta>
          <Fila icono="checkmark-circle-outline" titulo="¡Preinscripción enviada!" detalle="Nos comunicaremos a la brevedad para coordinar la entrevista presencial." />
          <Text style={[s.textoSuave, { marginTop: espacio.m }]}>Tu código de trámite</Text>
          <Text selectable style={{ fontSize: 28, fontWeight: '800', color: colores.primario, marginVertical: espacio.s }}>{codigo}</Text>
          <Text style={s.textoSuave}>Guardalo: te lo pediremos para consultar el estado de la solicitud.</Text>
        </Tarjeta>
        <Boton texto="Volver" icono="arrow-back-outline" variante="secundario" alPresionar={() => navigation.goBack()} />
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <Titulo sub="Ciclo lectivo 2027 · Los cupos son limitados">Preinscripción</Titulo>
      <Seccion titulo="Datos del alumno">
        <Tarjeta>
          <Campo etiqueta="Nombre y apellido *" {...campo('nombreAlumno')} maxLength={100} />
          <Campo etiqueta="DNI *" {...campo('dniAlumno')} keyboardType="number-pad" maxLength={9} />
          <Campo etiqueta="Edad *" {...campo('edadAlumno')} keyboardType="number-pad" maxLength={2} />
          <Opciones etiqueta="Nivel al que ingresa *" opciones={Object.values(NIVEL_ETIQUETA)} valor={d.nivelIngresa} alCambiar={v => setD(p => ({ ...p, nivelIngresa: v }))} error={errores.nivelIngresa} />
          <Opciones etiqueta="Grupo sanguíneo" opciones={GRUPOS} valor={d.tipoSangre ?? ''} alCambiar={v => setD(p => ({ ...p, tipoSangre: p.tipoSangre === v ? '' : v }))} />
          <Campo etiqueta="Domicilio" {...campo('domicilioAlumno')} maxLength={150} />
          <Campo etiqueta="Teléfono de emergencia" {...campo('telefonoEmergencia')} keyboardType="phone-pad" maxLength={30} />
        </Tarjeta>
      </Seccion>
      <Seccion titulo="Responsable">
        <Tarjeta>
          <Campo etiqueta="Nombre y apellido *" {...campo('nombreTutor')} maxLength={100} />
          <Opciones etiqueta="Vínculo *" opciones={VINCULOS} valor={d.vinculo} alCambiar={v => setD(p => ({ ...p, vinculo: v }))} error={errores.vinculo} />
          <Campo etiqueta="DNI *" {...campo('dniTutor')} keyboardType="number-pad" maxLength={9} />
          <Campo etiqueta="Teléfono *" {...campo('telefonoTutor')} keyboardType="phone-pad" maxLength={30} />
          <Campo etiqueta="Domicilio" {...campo('domicilioTutor')} maxLength={150} />
        </Tarjeta>
      </Seccion>
      <Boton texto="Enviar preinscripción" icono="send-outline" cargando={enviando} alPresionar={enviar} estilo={{ marginBottom: espacio.xl }} />
    </Pantalla>
  );
}

const MOTIVOS = [
  { valor: 'INSCRIPCIONES', texto: 'Inscripciones' },
  { valor: 'INFORMACION', texto: 'Información general' },
  { valor: 'CUOTAS', texto: 'Cuotas' },
  { valor: 'TRANSPORTE', texto: 'Transporte' },
  { valor: 'OTRO', texto: 'Otro' }
] as const;

export function PantallaConsulta({ navigation }: any) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [motivo, setMotivo] = useState('INFORMACION');
  const [mensaje, setMensaje] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    const e: Record<string, string> = {};
    if (!nombre.trim()) e.nombre = 'Ingresá tu nombre.';
    if (!correoValido(email)) e.email = 'Ingresá un correo válido.';
    if (mensaje.trim().length < 10) e.mensaje = 'Contanos un poco más (mínimo 10 caracteres).';
    setErrores(e);
    if (Object.keys(e).length) return;
    setEnviando(true);
    try {
      const r = await institucionalRepo.consultar({ nombre: nombre.trim(), email: email.trim(), telefono: telefono.trim() || undefined, motivo, mensaje: mensaje.trim() });
      Alert.alert('Consulta enviada', r.mensaje, [{ text: 'Aceptar', onPress: () => navigation.goBack() }]);
    } catch (err) {
      Alert.alert('No se pudo enviar', mensajeError(err));
    } finally { setEnviando(false); }
  };

  return (
    <Pantalla>
      <Titulo sub="Te respondemos por correo electrónico">Contacto y consultas</Titulo>
      <Tarjeta>
        <Campo etiqueta="Nombre y apellido *" value={nombre} onChangeText={setNombre} error={errores.nombre} maxLength={100} />
        <Campo etiqueta="Correo electrónico *" value={email} onChangeText={setEmail} error={errores.email} keyboardType="email-address" autoCapitalize="none" maxLength={120} />
        <Campo etiqueta="Teléfono" value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" maxLength={30} />
        <View style={{ marginBottom: espacio.m }}>
          <Text style={s.etiqueta}>Motivo</Text>
          <View style={s.filaChips}>{MOTIVOS.map(m => <Chip key={m.valor} texto={m.texto} activo={motivo === m.valor} alPresionar={() => setMotivo(m.valor)} />)}</View>
        </View>
        <Campo etiqueta="Consulta *" value={mensaje} onChangeText={setMensaje} error={errores.mensaje} multiline maxLength={2000}
          style={[s.campo, { minHeight: 110, textAlignVertical: 'top', paddingTop: 12 }]} />
        <Boton texto="Enviar consulta" icono="send-outline" cargando={enviando} alPresionar={enviar} estilo={{ marginTop: espacio.s }} />
      </Tarjeta>
    </Pantalla>
  );
}

const PUESTOS = [
  'Docente Nivel Inicial', 'Docente Nivel Primario', 'Docente Nivel Secundario',
  'Profesor/a de Educación Física', 'Preceptor/a', 'Administración', 'Mantenimiento'
] as const;

export function PantallaEmpleo({ navigation }: any) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [puesto, setPuesto] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    const e: Record<string, string> = {};
    if (!nombre.trim()) e.nombre = 'Ingresá tu nombre.';
    if (!correoValido(email)) e.email = 'Ingresá un correo válido.';
    if (!puesto) e.puesto = 'Elegí el puesto al que te postulás.';
    setErrores(e);
    if (Object.keys(e).length) return;
    setEnviando(true);
    try {
      const r = await institucionalRepo.postular({ nombre: nombre.trim(), email: email.trim(), telefono: telefono.trim() || undefined, puesto, mensaje: mensaje.trim() || undefined });
      Alert.alert('Postulación enviada', r.mensaje, [{ text: 'Aceptar', onPress: () => navigation.goBack() }]);
    } catch (err) {
      Alert.alert('No se pudo enviar', mensajeError(err));
    } finally { setEnviando(false); }
  };

  return (
    <Pantalla>
      <Titulo sub="Sumate a nuestro equipo">Trabajá con nosotros</Titulo>
      <Tarjeta>
        <Campo etiqueta="Nombre y apellido *" value={nombre} onChangeText={setNombre} error={errores.nombre} maxLength={100} />
        <Campo etiqueta="Correo electrónico *" value={email} onChangeText={setEmail} error={errores.email} keyboardType="email-address" autoCapitalize="none" maxLength={120} />
        <Campo etiqueta="Teléfono" value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" maxLength={30} />
        <Opciones etiqueta="Puesto *" opciones={PUESTOS} valor={puesto} alCambiar={setPuesto} error={errores.puesto} />
        <Campo etiqueta="Contanos sobre vos" value={mensaje} onChangeText={setMensaje} multiline maxLength={1500}
          placeholder="Formación, experiencia y disponibilidad horaria"
          style={[s.campo, { minHeight: 110, textAlignVertical: 'top', paddingTop: 12 }]} />
        <Boton texto="Enviar postulación" icono="send-outline" cargando={enviando} alPresionar={enviar} estilo={{ marginTop: espacio.s }} />
      </Tarjeta>
    </Pantalla>
  );
}
