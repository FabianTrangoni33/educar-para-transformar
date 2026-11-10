/**
 * Repositorios (patrón Repository): única puerta de la app hacia la API.
 * Las pantallas nunca llaman a fetch: usan estos métodos, y los adaptadores
 * (patrón Adapter) convierten los datos de la API en los modelos de la app.
 */
import { api } from './nucleo/apiClient';
import type {
  Perfil, ResumenAlumno, Deporte, Recorrido, DatosDocente, AlumnoDeCurso, Factura, DetalleFactura, Deuda,
  ResumenPagoHijo, Notificacion, Noticia, Opinion, Credencial, TipoMovimiento, ResultadoMovimiento,
  FichaSalud, RespuestaSalud, ResumenAdmin, ComprobanteAdmin, AsistenciaDia, Planilla
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
  asignaciones: () => api.get<DatosDocente>('/movil/docente/asignaciones'),
  alumnosDeCurso: (idCurso: number) => api.get<AlumnoDeCurso[]>(`/movil/docente/cursos/${idCurso}/alumnos`)
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
    api.post<{ mensaje: string }>('/opiniones', { nombre, comentario, calificacion }, false),
  /** Mismos formularios públicos que el sitio web: le llegan a administración en el panel web */
  consultar: (d: { nombre: string; email: string; telefono?: string; motivo: string; mensaje: string }) =>
    api.post<{ mensaje: string }>('/consultas', d, false),
  postular: (d: { nombre: string; email: string; telefono?: string; puesto: string; mensaje?: string }) =>
    api.post<{ mensaje: string }>('/empleo', d, false),
  preinscribir: (d: Record<string, string>) =>
    api.post<{ mensaje: string; codigo_tramite: string }>('/preinscripciones', d, false)
};

/** Valor agregado (TP1 punto 5): login con QR entre web y app, credencial digital y registro de ingresos. */
export const qrRepo = {
  /** La app (logueada) autoriza el QR que muestra la web */
  aprobarWeb: (codigo: string) => api.post<{ mensaje: string }>('/qr-login/web/aprobar', { codigo }),
  /** La app (sin sesión) entra con el QR que genera la web logueada */
  canjearApp: (codigo: string) =>
    api.post<{ token: string; refresh_token: string; usuario: { rol: string } }>('/qr-login/app/canjear', { codigo }, false),
  credenciales: () => api.get<Credencial[]>('/movil/credenciales'),
  registrarMovimiento: (qr: string, tipo: TipoMovimiento) => api.post<ResultadoMovimiento>('/movil/movimientos', { qr, tipo })
};

export const saludRepo = {
  ver: (idAlumno: number) => api.get<RespuestaSalud>(`/movil/alumnos/${idAlumno}/salud`),
  guardar: (idAlumno: number, ficha: FichaSalud) => api.put<{ mensaje: string }>(`/movil/alumnos/${idAlumno}/salud`, ficha)
};

export const adminRepo = {
  resumen: () => api.get<ResumenAdmin>('/movil/admin/resumen'),
  comprobantes: (estado = 'PENDIENTE') => api.get<any[]>(`/admin/comprobantes?estado=${estado}`).then(l => l.map(c => ({
    ...c, monto: Number(c.monto), items: (c.items || []).map((i: any) => ({ descripcion: i.descripcion, monto: Number(i.monto) }))
  })) as ComprobanteAdmin[]),
  revisar: (id: number, estado: 'APROBADO' | 'RECHAZADO', observacion?: string) =>
    api.put<{ mensaje: string }>(`/admin/comprobantes/${id}`, { estado, observacion }),
  asistencia: () => api.get<AsistenciaDia>('/reportes/asistencia')
};

export const notasRepo = {
  planilla: (idCurso: number, idMateria: number) =>
    api.get<Planilla>(`/movil/docente/planilla?id_curso=${idCurso}&id_materia=${idMateria}`),
  guardar: (idCurso: number, idMateria: number, notas: { id_alumno: number; trimestre: number; nota: number | null; observacion?: string | null }[]) =>
    api.put<{ mensaje: string }>('/movil/docente/calificaciones', { id_curso: idCurso, id_materia: idMateria, notas })
};
