/** Módulo Institucional (sin iniciar sesión): información, noticias, galería y opiniones (RFM-02, RFM-03). */
import React, { useState } from 'react';
import { Alert, Image, Linking, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AvisoSinConexion, Boton, Campo, Contenido, Fila, Pantalla, Seccion, Tarjeta, Titulo, Vacio, s } from '../../componentes/ui';
import { colores, espacio, fecha } from '../../tema';
import { config, urlRecurso } from '../../config';
import { useConsulta } from '../../nucleo/hooks';
import { institucionalRepo } from '../../repositorios';

const NIVELES = [
  { icono: 'happy-outline', nombre: 'Nivel Inicial', detalle: 'Salas de 3, 4 y 5 años con jornada extendida.' },
  { icono: 'book-outline', nombre: 'Nivel Primario', detalle: '1° a 6° grado. Inglés, portugués y francés.' },
  { icono: 'school-outline', nombre: 'Nivel Secundario', detalle: 'Ciclo básico y orientado, laboratorios de física, química y computación.' }
] as const;

const BIENESTAR = [
  { icono: 'medkit-outline', nombre: 'Enfermería', detalle: 'Atención durante toda la jornada.' },
  { icono: 'people-outline', nombre: 'Apoyo estudiantil', detalle: 'Acompañamiento pedagógico y psicopedagógico.' },
  { icono: 'restaurant-outline', nombre: 'Comedor', detalle: 'Menú equilibrado supervisado por nutricionistas.' },
  { icono: 'bus-outline', nombre: 'Transporte', detalle: 'Cuatro recorridos de micros escolares.' },
  { icono: 'football-outline', nombre: 'Deportes', detalle: 'Atletismo, natación, fútbol, artes marciales, vóley, danza, básquet y ajedrez.' }
] as const;

export function PantallaInstitucional({ navigation }: any) {
  return (
    <Pantalla>
      <Image source={{ uri: urlRecurso('/img/portada1.jpg') }} style={{ height: 170, borderRadius: 12, marginBottom: espacio.l, backgroundColor: colores.primarioClaro }} accessibilityLabel="Frente del edificio de la escuela" />
      <Titulo sub="Resistencia, Chaco · Inicio de actividades: marzo 2027">Centro Educativo "Educar para Transformar"</Titulo>
      <Tarjeta>
        <Text style={s.texto}>
          Inspiramos, desafiamos y empoderamos a nuestros alumnos a ser miembros comprometidos y éticos de una comunidad global, para que se conviertan en agentes de cambio conscientes de sí mismos, seguros, innovadores y colaborativos.
        </Text>
      </Tarjeta>

      <Seccion titulo="Niveles educativos">
        <Tarjeta>{NIVELES.map(n => <Fila key={n.nombre} icono={n.icono} titulo={n.nombre} detalle={n.detalle} />)}</Tarjeta>
      </Seccion>

      <Seccion titulo="Bienestar estudiantil">
        <Tarjeta>{BIENESTAR.map(n => <Fila key={n.nombre} icono={n.icono} titulo={n.nombre} detalle={n.detalle} />)}</Tarjeta>
      </Seccion>

      <Seccion titulo="Más">
        <Tarjeta alPresionar={() => navigation.navigate('Noticias')} etiqueta="Noticias"><Fila icono="newspaper-outline" titulo="Noticias" derecha={<Ionicons name="chevron-forward" size={20} color={colores.textoSuave} />} /></Tarjeta>
        <Tarjeta alPresionar={() => navigation.navigate('Galeria')} etiqueta="Galería de imágenes"><Fila icono="images-outline" titulo="Galería de imágenes" derecha={<Ionicons name="chevron-forward" size={20} color={colores.textoSuave} />} /></Tarjeta>
        <Tarjeta alPresionar={() => navigation.navigate('Opinar')} etiqueta="Opiniones"><Fila icono="star-outline" titulo="Opiniones de la comunidad" detalle="Dejá la tuya sin iniciar sesión" derecha={<Ionicons name="chevron-forward" size={20} color={colores.textoSuave} />} /></Tarjeta>
      </Seccion>

      <Seccion titulo="Contacto">
        <Boton texto="Escribinos por WhatsApp" icono="logo-whatsapp" variante="secundario" alPresionar={() => Linking.openURL(`https://wa.me/${config.contacto.whatsapp}`)} />
        <Boton texto={config.contacto.email} icono="mail-outline" variante="texto" alPresionar={() => Linking.openURL(`mailto:${config.contacto.email}`)} />
      </Seccion>
    </Pantalla>
  );
}

export function PantallaNoticias() {
  const consulta = useConsulta('noticias', institucionalRepo.noticias);
  const [abierta, setAbierta] = useState<number | null>(null);
  return (
    <Pantalla refrescando={consulta.cargando} alRefrescar={consulta.recargar}>
      <AvisoSinConexion visible={consulta.desdeCache} sincronizadoEn={consulta.sincronizadoEn} />
      <Contenido consulta={consulta}>
        {noticias => noticias.length === 0 ? <Vacio texto="Todavía no hay noticias publicadas." /> : noticias.map(n => (
          <Tarjeta key={n.id_noticia} alPresionar={() => setAbierta(abierta === n.id_noticia ? null : n.id_noticia)} etiqueta={n.titulo}>
            <Image source={{ uri: urlRecurso(n.imagen_url) }} style={{ height: 150, borderRadius: 8, marginBottom: espacio.s, backgroundColor: colores.primarioClaro }} accessibilityIgnoresInvertColors />
            <Text style={s.textoSuave}>{n.categoria} · {fecha(n.fecha)}</Text>
            <Text style={[s.texto, s.negrita, { marginVertical: 4 }]}>{n.titulo}</Text>
            <Text style={s.texto}>{abierta === n.id_noticia && n.cuerpo ? n.cuerpo.replace(/<[^>]+>/g, '') : n.descripcion}</Text>
          </Tarjeta>
        ))}
      </Contenido>
    </Pantalla>
  );
}

export function PantallaGaleria() {
  const consulta = useConsulta('galeria', institucionalRepo.galeria);
  const { width } = useWindowDimensions();
  const lado = (width - espacio.l * 2 - espacio.s) / 2;
  return (
    <Pantalla>
      <Contenido consulta={consulta}>
        {fotos => (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            {fotos.map(f => (
              <View key={f.ruta} style={{ width: lado, marginBottom: espacio.m }}>
                <Image source={{ uri: urlRecurso(f.ruta) }} style={{ width: lado, height: lado, borderRadius: 10, backgroundColor: colores.primarioClaro }} accessibilityLabel={f.titulo} />
                <Text style={[s.textoSuave, { marginTop: 4 }]}>{f.titulo}</Text>
              </View>
            ))}
          </View>
        )}
      </Contenido>
    </Pantalla>
  );
}

function Estrellas({ valor, alCambiar, tamano = 32 }: { valor: number; alCambiar?: (v: number) => void; tamano?: number }) {
  return (
    <View style={{ flexDirection: 'row' }} accessibilityRole={alCambiar ? 'adjustable' : 'text'} accessibilityLabel={`${valor} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Pressable key={i} onPress={alCambiar ? () => alCambiar(i) : undefined} disabled={!alCambiar} hitSlop={8} style={{ padding: alCambiar ? 6 : 0 }} accessibilityLabel={`${i} estrellas`}>
          <Ionicons name={i <= valor ? 'star' : 'star-outline'} size={tamano} color="#e0a800" />
        </Pressable>
      ))}
    </View>
  );
}

export function PantallaOpinar() {
  const consulta = useConsulta('opiniones', institucionalRepo.opiniones);
  const [nombre, setNombre] = useState('');
  const [comentario, setComentario] = useState('');
  const [calificacion, setCalificacion] = useState(0);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    const e: Record<string, string> = {};
    if (!nombre.trim()) e.nombre = 'Ingresá tu nombre.';
    if (!comentario.trim()) e.comentario = 'Escribí tu comentario.';
    if (!calificacion) e.calificacion = 'Elegí una calificación.';
    setErrores(e);
    if (Object.keys(e).length) return;
    setEnviando(true);
    try {
      const r = await institucionalRepo.opinar(nombre.trim(), comentario.trim(), calificacion);
      setNombre(''); setComentario(''); setCalificacion(0);
      Alert.alert('¡Gracias!', r.mensaje);
      consulta.recargar();
    } catch (err) {
      Alert.alert('No se pudo enviar', (err as Error).message);
    } finally { setEnviando(false); }
  };

  return (
    <Pantalla>
      <Seccion titulo="Dejá tu opinión">
        <Tarjeta>
          <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} error={errores.nombre} maxLength={80} />
          <Campo etiqueta="Comentario" value={comentario} onChangeText={setComentario} error={errores.comentario} multiline maxLength={1000} style={[s.campo, { minHeight: 100, textAlignVertical: 'top', paddingTop: 12 }]} />
          <Text style={s.etiqueta}>Calificación</Text>
          <Estrellas valor={calificacion} alCambiar={setCalificacion} />
          {errores.calificacion ? <Text style={{ color: colores.error }}>{errores.calificacion}</Text> : null}
          <Boton texto="Enviar opinión" icono="send-outline" alPresionar={enviar} cargando={enviando} estilo={{ marginTop: espacio.m }} />
        </Tarjeta>
      </Seccion>
      <Contenido consulta={consulta}>
        {d => (
          <Seccion titulo={`Opiniones${d.promedio ? ` · ${d.promedio} ★ (${d.total})` : ''}`}>
            {d.opiniones.length === 0 ? <Vacio texto="Sé el primero en opinar." /> : d.opiniones.map(o => (
              <Tarjeta key={o.id_opinion}>
                <View style={s.filaEntre}>
                  <Text style={[s.texto, s.negrita]}>{o.nombre}</Text>
                  <Estrellas valor={o.calificacion} tamano={16} />
                </View>
                <Text style={[s.texto, { marginTop: 4 }]}>{o.comentario}</Text>
                <Text style={s.textoSuave}>{fecha(o.creado_en)}</Text>
              </Tarjeta>
            ))}
          </Seccion>
        )}
      </Contenido>
    </Pantalla>
  );
}
