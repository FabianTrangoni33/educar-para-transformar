/**
 * Hooks del núcleo (capa ViewModel del patrón MVVM).
 * - useConexion: estado de la red (Observer sobre NetInfo).
 * - useConsulta: carga datos de un repositorio, los guarda en caché y, sin conexión,
 *   muestra la última versión guardada con su fecha de sincronización.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useFocusEffect } from '@react-navigation/native';
import { cache } from './cache';
import { ErrorApi } from './apiClient';

export function useConexion() {
  const [conectado, setConectado] = useState(true);
  useEffect(() => NetInfo.addEventListener(s => setConectado(s.isConnected !== false && s.isInternetReachable !== false)), []);
  return conectado;
}

/** true si hay red; si no, muestra el motivo para operaciones que requieren conexión */
export async function hayConexion() {
  const s = await NetInfo.fetch();
  return s.isConnected !== false && s.isInternetReachable !== false;
}

type EstadoConsulta<T> = {
  datos: T | null;
  cargando: boolean;
  error: string | null;
  /** true cuando lo que se muestra viene de la caché porque no hubo conexión */
  desdeCache: boolean;
  sincronizadoEn: string | null;
  recargar: () => Promise<void>;
};

/**
 * @param clave clave de caché (null para no consultar todavía)
 * @param cargar función del repositorio que trae los datos
 */
export function useConsulta<T>(clave: string | null, cargar: () => Promise<T>, { alEnfocar = true } = {}): EstadoConsulta<T> {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [desdeCache, setDesdeCache] = useState(false);
  const [sincronizadoEn, setSincronizadoEn] = useState<string | null>(null);
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;
  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);

  const recargar = useCallback(async () => {
    if (!clave) return;
    setCargando(true);
    try {
      const d = await cargarRef.current();
      if (!montado.current) return;
      setDatos(d);
      setError(null);
      setDesdeCache(false);
      setSincronizadoEn(new Date().toISOString());
      cache.guardar(clave, d);
    } catch (e) {
      if (!montado.current) return;
      const err = e instanceof ErrorApi ? e : new ErrorApi('Ocurrió un error inesperado.');
      const guardado = await cache.leer<T>(clave);
      if (err.sinConexion && guardado) {
        setDatos(guardado.datos);
        setDesdeCache(true);
        setSincronizadoEn(guardado.guardadoEn);
        setError(null);
      } else {
        setError(err.message);
      }
    } finally {
      if (montado.current) setCargando(false);
    }
  }, [clave]);

  // Muestra la caché al instante mientras llega la respuesta (arranque rápido, RNFM-05)
  useEffect(() => {
    if (!clave) return;
    let activo = true;
    // Al cambiar de clave (por ejemplo, otro hijo) no se muestran datos del anterior
    setDatos(null);
    setSincronizadoEn(null);
    setDesdeCache(false);
    cache.leer<T>(clave).then(g => {
      if (activo && g) {
        setDatos(prev => prev ?? g.datos);
        setSincronizadoEn(prev => prev ?? g.guardadoEn);
      }
    });
    if (!alEnfocar) recargar();
    return () => { activo = false; };
  }, [clave, alEnfocar, recargar]);

  // Refresca cada vez que la pantalla vuelve a estar visible (refleja cambios hechos desde la web)
  useFocusEffect(useCallback(() => { if (alEnfocar) recargar(); }, [alEnfocar, recargar]));

  return { datos, cargando, error, desdeCache, sincronizadoEn, recargar };
}
