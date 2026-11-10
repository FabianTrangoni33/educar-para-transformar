/**
 * Almacenamiento seguro (Keystore en Android / Keychain en iOS) mediante expo-secure-store.
 * Acá se guardan los tokens y el perfil; NUNCA en AsyncStorage (RNFM-03).
 */
import * as SecureStore from 'expo-secure-store';

const CLAVES = {
  token: 'eft_token',
  refresh: 'eft_refresh',
  perfil: 'eft_perfil',
  biometria: 'eft_biometria',
  tokenPush: 'eft_token_push'
} as const;

type Clave = keyof typeof CLAVES;

export const almacenSeguro = {
  async leer(clave: Clave): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(CLAVES[clave]);
    } catch {
      return null;
    }
  },
  async guardar(clave: Clave, valor: string | null | undefined) {
    if (valor == null) return SecureStore.deleteItemAsync(CLAVES[clave]);
    return SecureStore.setItemAsync(CLAVES[clave], valor);
  },
  async leerJSON<T>(clave: Clave): Promise<T | null> {
    const v = await this.leer(clave);
    try {
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  },
  guardarJSON(clave: Clave, valor: unknown) {
    return this.guardar(clave, valor == null ? null : JSON.stringify(valor));
  },
  /** Borra la sesión (se conserva la preferencia de biometría del dispositivo) */
  async borrarSesion() {
    await Promise.all(['token', 'refresh', 'perfil', 'tokenPush'].map(c => SecureStore.deleteItemAsync(CLAVES[c as Clave])));
  }
};
