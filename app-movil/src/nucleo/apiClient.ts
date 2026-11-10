/**
 * Cliente HTTP único de la app (patrón Singleton).
 * - Agrega el JWT y la cabecera "X-Cliente: movil" (el backend audita el origen MOVIL).
 * - Si el token de acceso expiró, lo renueva una sola vez con el refresh token y reintenta (RFM-11).
 * - Si el refresh también es inválido, avisa a la sesión para pedir un nuevo ingreso.
 * - Convierte cualquier falla en ErrorApi con un mensaje para mostrar al usuario.
 */
import { config } from '../config';
import { almacenSeguro } from './almacenamientoSeguro';

export class ErrorApi extends Error {
  constructor(mensaje: string, public status = 0, public codigo?: string) {
    super(mensaje);
  }
  get sinConexion() {
    return this.codigo === 'SIN_CONEXION';
  }
}

type Opciones = { method?: string; body?: unknown; auth?: boolean };
type Respuesta<T> = { ok: boolean; data: T; error?: string; codigo?: string };

class ApiClient {
  private token: string | null = null;
  private refrescando: Promise<boolean> | null = null;
  private alExpirarSesion: (() => void) | null = null;

  setToken(token: string | null) {
    this.token = token;
  }
  getToken() {
    return this.token;
  }
  onSesionExpirada(cb: () => void) {
    this.alExpirarSesion = cb;
  }

  get<T>(ruta: string, auth = true) {
    return this.pedir<T>(ruta, { auth });
  }
  post<T>(ruta: string, body?: unknown, auth = true) {
    return this.pedir<T>(ruta, { method: 'POST', body, auth });
  }
  put<T>(ruta: string, body?: unknown) {
    return this.pedir<T>(ruta, { method: 'PUT', body });
  }
  delete<T>(ruta: string, body?: unknown) {
    return this.pedir<T>(ruta, { method: 'DELETE', body });
  }

  async pedir<T>(ruta: string, opciones: Opciones = {}, reintento = false): Promise<T> {
    const { method = 'GET', body, auth = true } = opciones;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), config.timeoutMs);
    let resp: Response;
    try {
      resp = await fetch(config.apiUrl + ruta, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Cliente': 'movil',
          ...(auth && this.token ? { Authorization: `Bearer ${this.token}` } : {})
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal
      });
    } catch {
      throw new ErrorApi('No hay conexión con el servidor. Revisá tu conexión a internet.', 0, 'SIN_CONEXION');
    } finally {
      clearTimeout(timer);
    }

    let json: Respuesta<T>;
    try {
      json = await resp.json();
    } catch {
      throw new ErrorApi('El servidor respondió con un formato inesperado.', resp.status);
    }

    // Token vencido → renovar una vez y reintentar
    if (resp.status === 401 && auth && !reintento && json.codigo === 'TOKEN_EXPIRADO') {
      if (await this.renovar()) return this.pedir<T>(ruta, opciones, true);
    }
    if (resp.status === 401 && auth) {
      this.alExpirarSesion?.();
      throw new ErrorApi('Tu sesión expiró. Volvé a iniciar sesión.', 401, 'SESION_EXPIRADA');
    }
    if (!resp.ok || !json.ok) {
      throw new ErrorApi(json.error || 'Ocurrió un error. Intentá nuevamente.', resp.status, json.codigo);
    }
    return json.data;
  }

  /** Renueva el token con el refresh token. Si hay varias peticiones a la vez, comparten la misma renovación. */
  renovar(): Promise<boolean> {
    if (!this.refrescando) {
      this.refrescando = (async () => {
        const refresh = await almacenSeguro.leer('refresh');
        if (!refresh) return false;
        try {
          const r = await this.pedir<{ token: string; refresh_token: string }>('/auth/refresh', { method: 'POST', body: { refresh_token: refresh }, auth: false });
          this.token = r.token;
          await almacenSeguro.guardar('token', r.token);
          await almacenSeguro.guardar('refresh', r.refresh_token);
          return true;
        } catch (e) {
          // Sin conexión no se pierde la sesión: se podrá renovar más tarde
          if (e instanceof ErrorApi && e.sinConexion) throw e;
          return false;
        }
      })().finally(() => {
        this.refrescando = null;
      });
    }
    return this.refrescando;
  }
}

export const api = new ApiClient();
