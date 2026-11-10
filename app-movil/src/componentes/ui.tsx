/**
 * Componentes de interfaz reutilizables.
 * Accesibilidad (RNFM-09): zonas táctiles >= 48 dp, etiquetas accesibles y tamaño de fuente escalable
 * (no se desactiva allowFontScaling).
 */
import React from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
  type TextInputProps, type ViewStyle, type StyleProp
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colores, espacio, radio, ALTO_TOCABLE, fechaHora } from '../tema';

type Icono = React.ComponentProps<typeof Ionicons>['name'];

export function Pantalla({ children, refrescando, alRefrescar, estilo }: { children: React.ReactNode; refrescando?: boolean; alRefrescar?: () => void; estilo?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView
      style={s.pantalla}
      contentContainerStyle={[s.contenido, estilo]}
      keyboardShouldPersistTaps="handled"
      refreshControl={alRefrescar ? <RefreshControl refreshing={!!refrescando} onRefresh={alRefrescar} colors={[colores.primario]} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Titulo({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <View style={{ marginBottom: espacio.m }}>
      <Text style={s.titulo} accessibilityRole="header">{children}</Text>
      {sub ? <Text style={s.textoSuave}>{sub}</Text> : null}
    </View>
  );
}

export function Seccion({ titulo, children, accion }: { titulo: string; children: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <View style={{ marginBottom: espacio.l }}>
      <View style={s.filaEntre}>
        <Text style={s.seccion} accessibilityRole="header">{titulo}</Text>
        {accion}
      </View>
      {children}
    </View>
  );
}

export function Tarjeta({ children, alPresionar, estilo, etiqueta }: { children: React.ReactNode; alPresionar?: () => void; estilo?: StyleProp<ViewStyle>; etiqueta?: string }) {
  if (!alPresionar) return <View style={[s.tarjeta, estilo]}>{children}</View>;
  return (
    <Pressable
      onPress={alPresionar}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      style={({ pressed }) => [s.tarjeta, estilo, pressed && { opacity: 0.7 }]}
    >
      {children}
    </Pressable>
  );
}

export function Boton({ texto, alPresionar, variante = 'primario', icono, cargando, deshabilitado, estilo }: {
  texto: string; alPresionar: () => void; variante?: 'primario' | 'secundario' | 'peligro' | 'texto'; icono?: Icono;
  cargando?: boolean; deshabilitado?: boolean; estilo?: StyleProp<ViewStyle>;
}) {
  const fondo = { primario: colores.primario, secundario: colores.primarioClaro, peligro: colores.errorClaro, texto: 'transparent' }[variante];
  const color = { primario: '#fff', secundario: colores.primario, peligro: colores.error, texto: colores.primario }[variante];
  const inactivo = deshabilitado || cargando;
  return (
    <Pressable
      onPress={alPresionar}
      disabled={inactivo}
      accessibilityRole="button"
      accessibilityLabel={texto}
      accessibilityState={{ disabled: !!inactivo, busy: !!cargando }}
      style={({ pressed }) => [s.boton, { backgroundColor: fondo, opacity: inactivo ? 0.55 : pressed ? 0.8 : 1 }, estilo]}
    >
      {cargando ? <ActivityIndicator color={color} /> : (
        <>
          {icono ? <Ionicons name={icono} size={20} color={color} style={{ marginRight: 8 }} /> : null}
          <Text style={[s.textoBoton, { color }]}>{texto}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Campo({ etiqueta, error, ...props }: TextInputProps & { etiqueta: string; error?: string | null }) {
  return (
    <View style={{ marginBottom: espacio.m }}>
      <Text style={s.etiqueta}>{etiqueta}</Text>
      <TextInput
        accessibilityLabel={etiqueta}
        placeholderTextColor={colores.textoSuave}
        style={[s.campo, error ? { borderColor: colores.error } : null]}
        {...props}
      />
      {error ? <Text style={{ color: colores.error, marginTop: 4 }}>{error}</Text> : null}
    </View>
  );
}

export function Chip({ texto, activo, alPresionar, color }: { texto: string; activo?: boolean; alPresionar?: () => void; color?: string }) {
  return (
    <Pressable
      onPress={alPresionar}
      disabled={!alPresionar}
      accessibilityRole={alPresionar ? 'button' : 'text'}
      accessibilityState={{ selected: !!activo }}
      style={[s.chip, activo && { backgroundColor: colores.primario, borderColor: colores.primario }, color ? { backgroundColor: color, borderColor: color } : null]}
    >
      <Text style={[s.textoChip, activo && { color: '#fff' }]}>{texto}</Text>
    </Pressable>
  );
}

const ESTADOS: Record<string, { fondo: string; color: string; texto: string }> = {
  PAGADA: { fondo: colores.exitoClaro, color: colores.exito, texto: 'Pagada' },
  APROBADO: { fondo: colores.exitoClaro, color: colores.exito, texto: 'Aprobado' },
  PARCIAL: { fondo: colores.alertaClaro, color: colores.alerta, texto: 'Pago parcial' },
  PENDIENTE: { fondo: colores.primarioClaro, color: colores.primario, texto: 'Pendiente' },
  VENCIDA: { fondo: colores.errorClaro, color: colores.error, texto: 'Vencida' },
  RECHAZADO: { fondo: colores.errorClaro, color: colores.error, texto: 'Rechazado' }
};
export function Estado({ estado }: { estado: string }) {
  const e = ESTADOS[estado] || ESTADOS.PENDIENTE;
  return <Text style={[s.estado, { backgroundColor: e.fondo, color: e.color }]}>{e.texto}</Text>;
}

export function Fila({ icono, titulo, detalle, derecha }: { icono?: Icono; titulo: string; detalle?: string | null; derecha?: React.ReactNode }) {
  return (
    <View style={s.fila}>
      {icono ? <Ionicons name={icono} size={22} color={colores.primario} style={{ marginRight: espacio.m }} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={s.texto}>{titulo}</Text>
        {detalle ? <Text style={s.textoSuave}>{detalle}</Text> : null}
      </View>
      {derecha}
    </View>
  );
}

export function Cargando({ texto = 'Cargando...' }: { texto?: string }) {
  return (
    <View style={s.centro} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colores.primario} />
      <Text style={[s.textoSuave, { marginTop: espacio.s }]}>{texto}</Text>
    </View>
  );
}

export function Vacio({ texto, icono = 'file-tray-outline' }: { texto: string; icono?: Icono }) {
  return (
    <View style={s.centro}>
      <Ionicons name={icono} size={40} color={colores.textoSuave} />
      <Text style={[s.textoSuave, { marginTop: espacio.s, textAlign: 'center' }]}>{texto}</Text>
    </View>
  );
}

export function ErrorCarga({ mensaje, alReintentar }: { mensaje: string; alReintentar: () => void }) {
  return (
    <View style={s.centro}>
      <Ionicons name="alert-circle-outline" size={40} color={colores.error} />
      <Text style={[s.texto, { marginVertical: espacio.s, textAlign: 'center' }]}>{mensaje}</Text>
      <Boton texto="Reintentar" icono="refresh" variante="secundario" alPresionar={alReintentar} />
    </View>
  );
}

/** Aviso de "sin conexión": indica de cuándo es la información mostrada (RFM-12) */
export function AvisoSinConexion({ visible, sincronizadoEn }: { visible: boolean; sincronizadoEn?: string | null }) {
  if (!visible) return null;
  return (
    <View style={s.avisoOffline} accessibilityRole="alert">
      <Ionicons name="cloud-offline-outline" size={18} color={colores.alerta} />
      <Text style={{ color: colores.alerta, marginLeft: 6, flex: 1 }}>
        Sin conexión. Mostrando datos guardados{sincronizadoEn ? ` el ${fechaHora(sincronizadoEn)}` : ''}.
      </Text>
    </View>
  );
}

/** Envuelve el estado típico de una consulta: cargando / error / contenido */
export function Contenido<T>({ consulta, children, vacio }: {
  consulta: { datos: T | null; cargando: boolean; error: string | null; recargar: () => void };
  children: (datos: T) => React.ReactNode; vacio?: (datos: T) => boolean;
}) {
  if (consulta.datos == null && consulta.cargando) return <Cargando />;
  if (consulta.datos == null && consulta.error) return <ErrorCarga mensaje={consulta.error} alReintentar={consulta.recargar} />;
  if (consulta.datos == null) return null;
  if (vacio?.(consulta.datos)) return <Vacio texto="No hay información para mostrar." />;
  return <>{children(consulta.datos)}</>;
}

export const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.l, paddingBottom: 40 },
  titulo: { fontSize: 22, fontWeight: '700', color: colores.texto },
  seccion: { fontSize: 17, fontWeight: '700', color: colores.texto, marginBottom: espacio.s },
  texto: { fontSize: 15, color: colores.texto },
  textoSuave: { fontSize: 13, color: colores.textoSuave },
  negrita: { fontWeight: '700' },
  tarjeta: { backgroundColor: colores.superficie, borderRadius: radio, padding: espacio.l, marginBottom: espacio.m, borderWidth: 1, borderColor: colores.borde },
  boton: { minHeight: ALTO_TOCABLE, borderRadius: radio, paddingHorizontal: espacio.l, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: espacio.xs },
  textoBoton: { fontSize: 16, fontWeight: '600' },
  etiqueta: { fontSize: 14, fontWeight: '600', color: colores.texto, marginBottom: 6 },
  campo: { minHeight: ALTO_TOCABLE, borderWidth: 1, borderColor: colores.borde, borderRadius: radio, paddingHorizontal: espacio.m, fontSize: 16, backgroundColor: colores.superficie, color: colores.texto },
  chip: { minHeight: 40, paddingHorizontal: espacio.m, borderRadius: 20, borderWidth: 1, borderColor: colores.borde, backgroundColor: colores.superficie, justifyContent: 'center', marginRight: espacio.s, marginBottom: espacio.s },
  textoChip: { fontSize: 14, color: colores.texto },
  estado: { fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden', alignSelf: 'flex-start' },
  fila: { flexDirection: 'row', alignItems: 'center', minHeight: ALTO_TOCABLE, paddingVertical: espacio.s, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colores.borde },
  filaEntre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  filaChips: { flexDirection: 'row', flexWrap: 'wrap' },
  centro: { alignItems: 'center', justifyContent: 'center', padding: espacio.xl },
  avisoOffline: { flexDirection: 'row', alignItems: 'center', backgroundColor: colores.alertaClaro, padding: espacio.m, borderRadius: radio, marginBottom: espacio.m },
  monto: { fontSize: 24, fontWeight: '700', color: colores.texto }
});
