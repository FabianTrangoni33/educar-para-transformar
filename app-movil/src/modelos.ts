/** Modelos que usa la app (los repositorios adaptan las respuestas de la API a estos tipos). */

export type Rol = 'PADRE' | 'ESTUDIANTE' | 'DOCENTE' | 'ADMIN';

export type Hijo = { id_alumno: number; nombre: string; apellido: string; legajo: string; curso: string | null; division: string | null; nivel: string | null };

export type Perfil = {
  usuario: { id_usuario: number; email: string; rol: Rol; nombre: string; apellido: string };
  hijos: Hijo[];
  alumno: Hijo | null;
  docente: { id_profesor: number; legajo: string; nombre: string; apellido: string; especialidad: string | null } | null;
};

export type Materia = { id_materia: number; nombre: string; carga_horaria: number; profesor: string | null; notas: { trimestre: number; nota: number; observacion: string | null }[]; promedio: number | null };
export type BloqueHorario = { dia: string; inicio: string; fin: string; aula?: string | null; materia?: string };
export type DeporteInscripto = { id_deporte: number; nombre: string; dia_semana: string; inicio: string; fin: string; precio: number; profesor: string | null };
export type Transporte = { recorrido_numero: number; parada: string; nombre: string; zona: string; horario_ida: string; horario_vuelta: string; precio: number };

export type ResumenAlumno = {
  alumno: { id_alumno: number; legajo: string; nombre: string; apellido: string; estado: string; curso: string | null; division: string | null; nivel: string | null; id_nivel: number | null; ciclo: string | null };
  materias: Materia[];
  horarios: BloqueHorario[];
  deportes: DeporteInscripto[];
  transporte: Transporte | null;
  comedor: { modalidad: string; fecha_inscripcion: string; precio: number | null } | null;
};

export type Deporte = { id_deporte: number; nombre: string; id_nivel: number | null; nivel_nombre: string | null; dia_semana: string; hora_inicio: string; hora_fin: string; cupo_maximo: number; inscriptos_actuales: number; precio_mensual: number };
export type Recorrido = { numero: number; nombre: string; zona: string; paradas: string[]; horario_ida: string; horario_vuelta: string; precio: number };

export type Asignacion = { id_asignacion: number; materia: string; carga_horaria: number; curso: string | null; division: string | null; nivel: string | null; alumnos: number; horarios: BloqueHorario[] };
export type DatosDocente = { asignaciones: Asignacion[]; deportes: { id_deporte: number; nombre: string; dia_semana: string; inicio: string; fin: string; nivel: string | null; inscriptos: number }[] };

export type EstadoFactura = 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'VENCIDA';
export type Factura = { id_factura: number; numero: string; periodo: string; fecha_emision: string; fecha_vencimiento: string; total: number; pagado: number; en_revision: number; saldo: number; estado: EstadoFactura; comprobantes: { numero: string; monto: number; estado: string; fecha_transferencia: string }[] };
export type ItemFactura = { id_item: number; tipo: string; descripcion: string; monto: number; pagado: number; en_revision: number; disponible: number };
export type Comprobante = { id_comprobante: number; numero: string; nro_operacion: string; fecha_transferencia: string; monto: number; estado: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO'; observacion: string | null; creado_en: string; items: { descripcion: string; monto: number }[] };
export type DetalleFactura = Omit<Factura, 'comprobantes'> & { alumno: string; curso: string | null; nivel: string | null; items: ItemFactura[]; comprobantes: Comprobante[] };
export type Deuda = { deuda_total: number; por_tipo: { tipo: string; facturado: number; pagado: number; saldo: number }[]; items: (ItemFactura & { numero: string; periodo: string; fecha_vencimiento: string; saldo: number })[] };
export type ResumenPagoHijo = { id_alumno: number; nombre: string; saldo: number; proximo_vencimiento: string | null; vencidas: number };

export type Notificacion = { id: number; titulo: string; cuerpo: string; tipo: string; datos: Record<string, unknown> | null; leida: boolean; creado_en: string };
export type Noticia = { id_noticia: number; titulo: string; categoria: string; fecha: string; imagen_url: string; descripcion: string; cuerpo: string | null };
export type Opinion = { id_opinion: number; nombre: string; comentario: string; calificacion: number; creado_en: string };
