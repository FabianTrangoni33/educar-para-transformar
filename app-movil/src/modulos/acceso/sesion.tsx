/**
 * Sesión del usuario (módulo Acceso): ingreso, restauración, desbloqueo biométrico y cierre.
 * Expone el estado a toda la app mediante un Context (Observer: las pantallas se actualizan solas).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import { api } from '../../nucleo/apiClient';
import { almacenSeguro } from '../../nucleo/almacenamientoSeguro';
import { cache } from '../../nucleo/cache';
import { accesoRepo } from '../../repositorios';
import { desregistrarPush, registrarPush } from '../notificaciones/push';
import type { Perfil } from '../../modelos';

type EstadoSesion = 'iniciando' | 'publico' | 'bloqueado' | 'activo';

type Sesion = {
  estado: EstadoSesion;
  perfil: Perfil | null;
  aviso: string | null;
  biometriaActiva: boolean;
  ingresar: (usuario: string, password: string) => Promise<void>;
  salir: (aviso?: string) => Promise<void>;
  desbloquear: () => Promise<boolean>;
  cambiarBiometria: (activar: boolean) => Promise<string | null>;
  recargarPerfil: () => Promise<void>;
  limpiarAviso: () => void;
};

const Contexto = createContext<Sesion | null>(null);

export function useSesion() {
  const s = useContext(Contexto);
  if (!s) throw new Error('useSesion debe usarse dentro de SesionProvider');
  return s;
}

async function biometriaDisponible() {
  return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
}

export function SesionProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<EstadoSesion>('iniciando');
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [biometriaActiva, setBiometriaActiva] = useState(false);

  const salir = useCallback(async (motivo?: string) => {
    const [refresh, tokenPush] = await Promise.all([almacenSeguro.leer('refresh'), almacenSeguro.leer('tokenPush')]);
    // Revoca el refresh token y el registro push en el servidor (si no hay red, igual se cierra localmente)
    accesoRepo.logout(refresh, tokenPush).catch(() => {});
    await desregistrarPush();
    await almacenSeguro.borrarSesion();
    await cache.borrarTodo();
    api.setToken(null);
    setPerfil(null);
    setAviso(motivo ?? null);
    setEstado('publico');
  }, []);

  const recargarPerfil = useCallback(async () => {
    try {
      const p = await accesoRepo.perfil();
      setPerfil(p);
      await almacenSeguro.guardarJSON('perfil', p);
    } catch {
      // sin conexión: se mantiene el perfil guardado
    }
  }, []);

  // Restaurar sesión al abrir la app (funciona sin conexión con el perfil guardado)
  useEffect(() => {
    api.onSesionExpirada(() => { salir('Tu sesión expiró. Volvé a iniciar sesión.'); });
    (async () => {
      const [token, refresh, guardado, bio] = await Promise.all([
        almacenSeguro.leer('token'), almacenSeguro.leer('refresh'), almacenSeguro.leerJSON<Perfil>('perfil'), almacenSeguro.leer('biometria')
      ]);
      const usarBio = bio === '1' && (await biometriaDisponible());
      setBiometriaActiva(usarBio);
      if (!refresh || !guardado) {
        setEstado('publico');
        return;
      }
      api.setToken(token);
      setPerfil(guardado);
      setEstado(usarBio ? 'bloqueado' : 'activo');
      recargarPerfil();
    })();
  }, [salir, recargarPerfil]);

  // Al quedar activa la sesión, se registra el dispositivo para recibir push
  useEffect(() => {
    if (estado === 'activo' && perfil && perfil.usuario.rol !== 'ADMIN') registrarPush().catch(() => {});
  }, [estado, perfil]);

  const ingresar = useCallback(async (usuario: string, password: string) => {
    const r = await accesoRepo.login(usuario, password);
    api.setToken(r.token);
    await almacenSeguro.guardar('token', r.token);
    await almacenSeguro.guardar('refresh', r.refresh_token);
    const p = await accesoRepo.perfil();
    await almacenSeguro.guardarJSON('perfil', p);
    setPerfil(p);
    setAviso(null);
    setEstado('activo');
  }, []);

  const desbloquear = useCallback(async () => {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Desbloqueá Educar para Transformar', cancelLabel: 'Cancelar' });
    if (r.success) setEstado('activo');
    return r.success;
  }, []);

  const cambiarBiometria = useCallback(async (activar: boolean) => {
    if (activar) {
      if (!(await biometriaDisponible())) return 'Este dispositivo no tiene huella o reconocimiento facial configurado.';
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirmá para activar el desbloqueo biométrico' });
      if (!r.success) return 'No se pudo verificar tu identidad.';
    }
    await almacenSeguro.guardar('biometria', activar ? '1' : null);
    setBiometriaActiva(activar);
    return null;
  }, []);

  const valor = useMemo<Sesion>(() => ({
    estado, perfil, aviso, biometriaActiva, ingresar, salir, desbloquear, cambiarBiometria, recargarPerfil,
    limpiarAviso: () => setAviso(null)
  }), [estado, perfil, aviso, biometriaActiva, ingresar, salir, desbloquear, cambiarBiometria, recargarPerfil]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
