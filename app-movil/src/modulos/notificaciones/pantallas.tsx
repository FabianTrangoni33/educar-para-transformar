/** Bandeja de avisos: confirmaciones de inscripción, facturas, pagos y novedades (RFM-10). */
import React, { useCallback } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { AvisoSinConexion, Contenido, Pantalla, Tarjeta, Vacio, s } from '../../componentes/ui';
import { colores, espacio, fechaHora } from '../../tema';
import { useConsulta } from '../../nucleo/hooks';
import { notificacionesRepo } from '../../repositorios';

const ICONOS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  INSCRIPCION: 'checkmark-done-outline', FACTURA: 'receipt-outline', PAGO: 'card-outline', NOTICIA: 'newspaper-outline', GENERAL: 'notifications-outline'
};

export function PantallaAvisos() {
  const consulta = useConsulta('avisos', notificacionesRepo.listar);
  // Al salir de la pantalla se marcan como leídos
  useFocusEffect(useCallback(() => () => { notificacionesRepo.marcarLeidas().catch(() => {}); }, []));

  return (
    <Pantalla refrescando={consulta.cargando} alRefrescar={consulta.recargar}>
      <AvisoSinConexion visible={consulta.desdeCache} sincronizadoEn={consulta.sincronizadoEn} />
      <Contenido consulta={consulta}>
        {avisos => avisos.length === 0 ? <Vacio texto="No tenés avisos todavía." icono="notifications-off-outline" /> : avisos.map(a => (
          <Tarjeta key={a.id} estilo={!a.leida ? { borderLeftWidth: 4, borderLeftColor: colores.primario } : undefined}>
            <View style={{ flexDirection: 'row' }}>
              <Ionicons name={ICONOS[a.tipo] ?? ICONOS.GENERAL} size={24} color={colores.primario} style={{ marginRight: espacio.m }} />
              <View style={{ flex: 1 }}>
                <Text style={[s.texto, !a.leida && s.negrita]}>{a.titulo}</Text>
                <Text style={s.texto}>{a.cuerpo}</Text>
                <Text style={s.textoSuave}>{fechaHora(a.creado_en)}</Text>
              </View>
            </View>
          </Tarjeta>
        ))}
      </Contenido>
    </Pantalla>
  );
}
