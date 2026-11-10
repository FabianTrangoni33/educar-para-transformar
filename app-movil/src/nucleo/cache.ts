/**
 * Caché de la última información consultada (RFM-12 / RNFM-06).
 * Se guarda en AsyncStorage junto con la fecha de sincronización. No se guardan tokens ni contraseñas,
 * y todo se borra al cerrar sesión.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIJO = 'eft_cache:';

export type EntradaCache<T> = { datos: T; guardadoEn: string };

export const cache = {
  async leer<T>(clave: string): Promise<EntradaCache<T> | null> {
    try {
      const v = await AsyncStorage.getItem(PREFIJO + clave);
      return v ? (JSON.parse(v) as EntradaCache<T>) : null;
    } catch {
      return null;
    }
  },
  async guardar<T>(clave: string, datos: T) {
    try {
      await AsyncStorage.setItem(PREFIJO + clave, JSON.stringify({ datos, guardadoEn: new Date().toISOString() }));
    } catch {
      // Si no hay espacio la app sigue funcionando sin caché
    }
  },
  async borrarTodo() {
    const claves = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(PREFIJO));
    await AsyncStorage.multiRemove(claves);
  }
};
