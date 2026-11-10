/**
 * Notificaciones push (RFM-10): permiso con explicación previa, registro del dispositivo
 * en el backend, y apertura de la pantalla correspondiente al tocar la notificación.
 *
 * Nota: Expo Go en Android no recibe push remotos desde SDK 53; para probarlos hace falta un
 * development build (`npx expo run:android` o EAS). La bandeja de avisos dentro de la app
 * funciona siempre, con o sin push.
 */
import { Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { almacenSeguro } from '../../nucleo/almacenamientoSeguro';
import { api } from '../../nucleo/apiClient';
import { accesoRepo } from '../../repositorios';

// Cómo se muestran las notificaciones con la app abierta
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false })
});

function explicarPermiso(): Promise<boolean> {
  return new Promise(resolve =>
    Alert.alert(
      'Activar notificaciones',
      'Te avisaremos cuando se confirme una inscripción, se emita una factura o haya novedades de la escuela. Nunca incluimos datos personales de los alumnos en el aviso.',
      [
        { text: 'Ahora no', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continuar', onPress: () => resolve(true) }
      ]
    )
  );
}

export async function registrarPush(): Promise<string | null> {
  if (!Device.isDevice) return null; // los emuladores no reciben push remotos

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Avisos',
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE // no muestra el contenido con pantalla bloqueada
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status === 'undetermined') {
    if (!(await explicarPermiso())) return null;
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.log('[Push] Falta extra.eas.projectId en app.json: se omite el registro push.');
    return null;
  }
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (api.getToken()) await accesoRepo.registrarDispositivo(token, Platform.OS);
    await almacenSeguro.guardar('tokenPush', token);
    return token;
  } catch (e) {
    console.log('[Push] No disponible en este entorno:', (e as Error).message);
    return null;
  }
}

export async function desregistrarPush() {
  await almacenSeguro.guardar('tokenPush', null);
  await Notifications.setBadgeCountAsync(0).catch(() => {});
}

/** Llama a `abrir(pantalla, datos)` cuando el usuario toca una notificación */
export function escucharToques(abrir: (pantalla: string, datos: Record<string, unknown>) => void) {
  const sub = Notifications.addNotificationResponseReceivedListener(r => {
    const datos = (r.notification.request.content.data || {}) as Record<string, unknown>;
    abrir(String(datos.pantalla || 'avisos'), datos);
  });
  return () => sub.remove();
}
