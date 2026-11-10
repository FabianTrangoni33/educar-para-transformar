/**
 * Funcionalidad de valor agregado (TP1, punto 5):
 * - PantallaEscaner: un solo escáner con tres usos
 *     · 'porteria'      → docente/administración registra ingreso, salida o micro escaneando la credencial
 *     · 'autorizar-web' → la app logueada aprueba el QR que muestra la web (la web queda logueada)
 *     · 'ingresar'      → la app sin sesión entra escaneando el QR que genera la web logueada
 * - PantallaCredencial: credencial digital con QR del alumno (padre: de cada hijo; estudiante: la propia).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AvisoSinConexion, Boton, Chip, Contenido, Fila, Pantalla, Seccion, Tarjeta, Vacio, s } from '../../componentes/ui';
import { colores, espacio, fechaHora, radio } from '../../tema';
import { useConsulta } from '../../nucleo/hooks';
import { qrRepo } from '../../repositorios';
import { useSesion } from '../acceso/sesion';
import type { Credencial, TipoMovimiento } from '../../modelos';

type Modo = 'porteria' | 'autorizar-web' | 'ingresar';
type Icono = React.ComponentProps<typeof Ionicons>['name'];

const TIPOS: { tipo: TipoMovimiento; texto: string; icono: Icono }[] = [
  { tipo: 'INGRESO', texto: 'Ingreso', icono: 'enter-outline' },
  { tipo: 'EGRESO', texto: 'Salida', icono: 'exit-outline' },
  { tipo: 'SUBE_MICRO', texto: 'Sube al micro', icono: 'bus-outline' },
  { tipo: 'BAJA_MICRO', texto: 'Baja del micro', icono: 'walk-outline' }
];
const ICONO_TIPO: Record<TipoMovimiento, Icono> = { INGRESO: 'enter-outline', EGRESO: 'exit-outline', SUBE_MICRO: 'bus-outline', BAJA_MICRO: 'walk-outline' };

const AYUDA: Record<Modo, string> = {
  porteria: 'Elegí qué registrar y apuntá a la credencial del alumno.',
  'autorizar-web': 'En la web tocá "Ingresar con QR" y apuntá la cámara al código que aparece.',
  ingresar: 'En la web, con tu sesión abierta, tocá "Abrir en la app" y escaneá el código.'
};

type Resultado = { ok: boolean; titulo: string; detalle?: string };

export function PantallaEscaner({ route, navigation }: any) {
  const modo: Modo = route?.params?.modo ?? 'porteria';
  const enfocada = useIsFocused();
  const { ingresarConQR } = useSesion();
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [tipo, setTipo] = useState<TipoMovimiento>('INGRESO');
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [procesando, setProcesando] = useState(false);
  const ocupado = useRef(false);
  const tipoRef = useRef(tipo);
  tipoRef.current = tipo;

  useEffect(() => { if (permiso && !permiso.granted && permiso.canAskAgain) pedirPermiso(); }, [permiso, pedirPermiso]);

  /** Libera el escáner después de un momento para no leer el mismo QR varias veces seguidas */
  const liberar = (ms = 2500) => setTimeout(() => { ocupado.current = false; }, ms);

  const alEscanear = useCallback(async ({ data }: { data: string }) => {
    if (ocupado.current) return;
    ocupado.current = true;
    setProcesando(true);
    try {
      if (modo === 'porteria') {
        if (!data.startsWith('EFT-CRED:')) throw new Error('Este código no es una credencial del colegio.');
        const r = await qrRepo.registrarMovimiento(data, tipoRef.current);
        setResultado({
          ok: true,
          titulo: `${r.alumno.nombre} ${r.alumno.apellido}`,
          detalle: `${TIPOS.find(t => t.tipo === r.tipo)?.texto} registrado a las ${r.hora} h · ${r.alumno.curso ?? ''} · Legajo ${r.alumno.legajo}. Se avisó a la familia.`
        });
        liberar();
      } else if (modo === 'autorizar-web') {
        if (!data.startsWith('EFT-LOGIN:')) throw new Error('Este código no es un inicio de sesión de la web del colegio.');
        Alert.alert('Iniciar sesión en la web', '¿Querés abrir tu cuenta en la computadora que muestra este código?', [
          { text: 'Cancelar', style: 'cancel', onPress: () => liberar(500) },
          {
            text: 'Sí, ingresar', onPress: async () => {
              try {
                const r = await qrRepo.aprobarWeb(data);
                Alert.alert('Listo', r.mensaje, [{ text: 'OK', onPress: () => navigation.goBack() }]);
              } catch (e) {
                setResultado({ ok: false, titulo: 'No se pudo autorizar', detalle: (e as Error).message });
                liberar();
              }
            }
          }
        ]);
      } else {
        if (!data.startsWith('EFT-APP:')) throw new Error('Este código no es un acceso a la app. Generalo desde la web con "Abrir en la app".');
        await ingresarConQR(data); // la sesión pasa a activa y la navegación cambia sola
      }
    } catch (e) {
      setResultado({ ok: false, titulo: 'No se pudo registrar', detalle: (e as Error).message });
      liberar();
    } finally {
      setProcesando(false);
    }
  }, [modo, navigation, ingresarConQR]);

  if (!permiso) return <View style={[s.pantalla, s.centro]}><Text style={s.textoSuave}>Preparando la cámara...</Text></View>;
  if (!permiso.granted) {
    return (
      <View style={[s.pantalla, s.centro]}>
        <Ionicons name="camera-outline" size={56} color={colores.primario} />
        <Text style={[s.titulo, { textAlign: 'center', marginVertical: espacio.m }]}>Necesitamos la cámara</Text>
        <Text style={[s.textoSuave, { textAlign: 'center', marginBottom: espacio.l }]}>Se usa solo para leer códigos QR. No se toman ni guardan fotos.</Text>
        <Boton texto="Permitir cámara" icono="camera" alPresionar={pedirPermiso} estilo={{ alignSelf: 'stretch' }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {enfocada ? (
        <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={alEscanear} />
      ) : null}
      <View style={estilos.marco} pointerEvents="none" />
      <View style={estilos.panel}>
        {modo === 'porteria' ? (
          <View style={s.filaChips} accessibilityRole="radiogroup">
            {TIPOS.map(t => <Chip key={t.tipo} texto={t.texto} activo={tipo === t.tipo} alPresionar={() => { setTipo(t.tipo); setResultado(null); }} />)}
          </View>
        ) : null}
        <Text style={[s.textoSuave, { marginBottom: espacio.s }]}>{procesando ? 'Procesando...' : AYUDA[modo]}</Text>
        {resultado ? (
          <View style={[estilos.resultado, { backgroundColor: resultado.ok ? colores.exitoClaro : colores.errorClaro }]} accessibilityLiveRegion="polite">
            <Ionicons name={resultado.ok ? 'checkmark-circle' : 'close-circle'} size={28} color={resultado.ok ? colores.exito : colores.error} />
            <View style={{ flex: 1, marginLeft: espacio.s }}>
              <Text style={[s.texto, s.negrita]}>{resultado.titulo}</Text>
              {resultado.detalle ? <Text style={s.texto}>{resultado.detalle}</Text> : null}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function PantallaCredencial() {
  const consulta = useConsulta('credenciales', qrRepo.credenciales);
  const [idSel, setIdSel] = useState<number | null>(null);

  return (
    <Pantalla refrescando={consulta.cargando} alRefrescar={consulta.recargar}>
      <AvisoSinConexion visible={consulta.desdeCache} sincronizadoEn={consulta.sincronizadoEn} />
      <Contenido consulta={consulta}>
        {(lista: Credencial[]) => {
          if (!lista.length) return <Vacio texto="No hay credenciales asociadas a tu cuenta." icono="id-card-outline" />;
          const c = lista.find(x => x.id_alumno === idSel) ?? lista[0];
          return (
            <>
              {lista.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: espacio.s }}>
                  {lista.map(x => <Chip key={x.id_alumno} texto={x.nombre} activo={x.id_alumno === c.id_alumno} alPresionar={() => setIdSel(x.id_alumno)} />)}
                </ScrollView>
              ) : null}
              <TarjetaCredencial c={c} />
              <Seccion titulo="Últimos movimientos">
                <Tarjeta>
                  {c.movimientos.length === 0 ? <Text style={s.textoSuave}>Todavía no hay ingresos registrados.</Text> : c.movimientos.map((m, i) => (
                    <Fila key={i} icono={ICONO_TIPO[m.tipo]} titulo={m.titulo} detalle={`${fechaHora(m.creado_en)}${m.recorrido_numero ? ` · Recorrido ${m.recorrido_numero}` : ''}`} />
                  ))}
                </Tarjeta>
              </Seccion>
            </>
          );
        }}
      </Contenido>
    </Pantalla>
  );
}

function TarjetaCredencial({ c }: { c: Credencial }) {
  const curso = c.curso ? `${c.curso}${c.division ? ' ' + c.division : ''}` : 'Sin curso';
  return (
    <View style={estilos.credencial} accessible accessibilityLabel={`Credencial de ${c.nombre} ${c.apellido}, legajo ${c.legajo}`}>
      <View style={estilos.credencialCabecera}>
        <Ionicons name="school" size={22} color="#fff" />
        <View style={{ marginLeft: espacio.s }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Educar para Transformar</Text>
          <Text style={{ color: '#dbe7f3', fontSize: 12 }}>Credencial estudiantil digital</Text>
        </View>
      </View>
      <View style={{ padding: espacio.l, alignItems: 'center' }}>
        <Text style={[s.titulo, { textAlign: 'center' }]}>{c.nombre} {c.apellido}</Text>
        <Text style={s.textoSuave}>{curso}{c.nivel ? ` · ${c.nivel}` : ''}</Text>
        <Text style={s.textoSuave}>Legajo {c.legajo}{c.dni ? ` · DNI ${c.dni}` : ''}</Text>
        <Image source={{ uri: c.qr }} style={estilos.qr} resizeMode="contain" accessibilityIgnoresInvertColors />
        <Text style={[s.textoSuave, { textAlign: 'center' }]}>
          Mostrá este código en portería{c.recorrido_numero ? ` y al subir al transporte (recorrido ${c.recorrido_numero})` : ''}. Funciona sin conexión.
        </Text>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  marco: { position: 'absolute', top: '18%', alignSelf: 'center', width: 240, height: 240, borderWidth: 3, borderColor: '#fff', borderRadius: 24 },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colores.superficie, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: espacio.l },
  resultado: { flexDirection: 'row', alignItems: 'flex-start', padding: espacio.m, borderRadius: radio, marginTop: espacio.s },
  credencial: { backgroundColor: colores.superficie, borderRadius: 16, borderWidth: 1, borderColor: colores.borde, overflow: 'hidden', marginBottom: espacio.l },
  credencialCabecera: { backgroundColor: colores.primario, flexDirection: 'row', alignItems: 'center', padding: espacio.m },
  qr: { width: 240, height: 240, marginVertical: espacio.m, backgroundColor: '#fff' }
});
