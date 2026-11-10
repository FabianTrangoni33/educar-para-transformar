/**
 * Repositorios (patrón Repository): única puerta de la app hacia la API.
 * Las pantallas nunca llaman a fetch: usan estos métodos, y los adaptadores
 * (patrón Adapter) convierten los datos de la API en los modelos de la app.
 */
import { api } from './nucleo/apiClient';
import type {
  Perfil, ResumenAlumno, Deporte, Recorrido, DatosDocente, Factura, DetalleFactura, Deuda,
  ResumenPagoHijo, Notificacion, Noticia, Opinion
} from './modelos';

const num = (v: unknown) => (v == null ? 0 : Number(v));

// ── Adaptadores ──
const adaptarDeporte = (d: any): Deporte => ({
  ...d,
  hora_inicio: String(d.hora_inicio).slice(0, 5),
  hora_fin: String(d.hora_fin).slice(0, 5),
  precio_mensual: num(d.precio_mensual),
  inscriptos_actuales: num(d.inscriptos_actuales)
});
const adaptarFactura = (f: any): Factura => ({
  ...f,
  comprobantes: (f.comprobantes || []).map((c: any) => ({ ...c, monto: num(c.monto) }))
});

export const accesoRepo = {
  login: (usuario: string, password: string) => {
    const esDni = /^\d{7,9}$/.test(usuario.trim());
    return api.post<{ token: string; refresh_token: string; usuario: { rol: string } }>(
      '/auth/login', esDni ? { dni: usuario.trim(), password } : { email: usuario.trim().toLowerCase(), password }, false);
  },
  perfil: () => api.get<Perfil>('/me'),
  logout: (refresh_token: string | null, token_push: string | null) => api.post('/auth/logout', { refresh_token, token_push }, false),
  cambiarPassword: (actual: string, nueva: string) => api.post<{ mensaje: string }>('/auth/cambiar-password', { actual, nueva }),
  recuperar: (email: string) => api.post<{ mensaje: string; codigo_demo?: string }>('/auth/recuperar', { email }, false),
  restablecer: (email: string, codigo: string, nueva: string) => api.post<{ mensaje: string }>('/auth/restablecer', { email, codigo, nueva }, false),
  registrarDispositivo: (token_push: string, plataforma: string) => api.post('/dispositivos', { token_push, plataforma })
};

export const alumnosRepo = {
  resumen: (idAlumno: number) => api.get<ResumenAlumno>(`/movil/alumnos/${idAlumno}/resumen`),
  deportes: async () => (await api.get<any[]>('/deportes', false)).map(adaptarDeporte),
  recorridos: () => api.get<Recorrido[]>('/transporte/recorridos', false),
  inscribirDeporte: (idAlumno: number, id_deporte: number) => api.post<{ mensaje: string }>(`/movil/alumnos/${idAlumno}/deportes`, { id_deporte }),
  bajaDeporte: (idAlumno: number, idDeporte: number) => api.delete<{ mensaje: string }>(`/movil/alumnos/${idAlumno}/deportes/${idDeporte}`),
  asignarTransporte: (idAlumno: number, recorrido_numero: number, parada: string) =>
    api.put<{ mensaje: string }>(`/movil/alumnos/${idAlumno}/transporte`, { recorrido_numero, parada }),
  bajaTransporte: (idAlumno: number) => api.delete<{ mensaje: string }>(`/movil/alumnos/${idAlumno}/transporte`),
  inscribirComedor: (idAlumno: number) => api.put<{ mensaje: string }>(`/movil/alumnos/${idAlumno}/comedor`, { modalidad: 'ALMUERZO' }),
  bajaComedor: (idAlumno: number) => api.delete<{ mensaje: string }>(`/movil/alumnos/${idAlumno}/comedor`)
};

export const docentesRepo = {
  asignaciones: () => api.get<DatosDocente>('/movil/docente/asignaciones')
};

export const pagosRepo = {
  facturas: async (idAlumno: number, desde?: string, hasta?: string) => {
    const q = [desde && `desde=${desde}`, hasta && `hasta=${hasta}`].filter(Boolean).join('&');
    const r = await api.get<{ facturas: any[] }>(`/movil/alumnos/${idAlumno}/facturas${q ? '?' + q : ''}`);
    return r.facturas.map(adaptarFactura);
  },
  factura: (idFactura: number) => api.get<DetalleFactura>(`/movil/facturas/${idFactura}`),
  deuda: (idAlumno: number) => api.get<Deuda>(`/movil/alumnos/${idAlumno}/deuda`),
  resumen: () => api.get<ResumenPagoHijo[]>('/movil/pagos/resumen'),
  informarPago: (idFactura: number, datos: { nro_operacion: string; fecha_transferencia: string; items: { id_item: number; monto: number }[]; archivo: { nombre: string; tipo: string; base64: string } }) =>
    api.post<{ mensaje: string; comprobante: { numero: string; monto: number; estado: string; items: { descripcion: string; monto: number }[] } }>(
      `/movil/facturas/${idFactura}/comprobantes`, { medio: 'TRANSFERENCIA', ...datos })
};

export const notificacionesRepo = {
  listar: () => api.get<Notificacion[]>('/movil/notificaciones'),
  marcarLeidas: () => api.post('/movil/notificaciones/leidas')
};

export const institucionalRepo = {
  noticias: () => api.get<Noticia[]>('/noticias', false),
  galeria: () => api.get<{ titulo: string; ruta: string }[]>('/galeria', false),
  opiniones: () => api.get<{ opiniones: Opinion[]; promedio: number | null; total: number }>('/opiniones', false),
  opinar: (nombre: string, comentario: string, calificacion: number) =>
    api.post<{ mensaje: string }>('/opiniones', { nombre, comentario, calificacion }, false)
};
