/** Paleta y medidas comunes (Material Design 3 / HIG: zonas táctiles de 48 dp como mínimo) */
export const colores = {
  primario: '#1f4e79',
  primarioClaro: '#e3edf7',
  secundario: '#2e86c1',
  fondo: '#f4f6f9',
  superficie: '#ffffff',
  texto: '#1b1f24',
  textoSuave: '#5b6470',
  borde: '#dde3ea',
  exito: '#1e7e34',
  exitoClaro: '#e3f4e8',
  alerta: '#9a6700',
  alertaClaro: '#fff4d6',
  error: '#b42318',
  errorClaro: '#fde8e6'
};

export const espacio = { xs: 4, s: 8, m: 12, l: 16, xl: 24 };
export const radio = 12;
export const ALTO_TOCABLE = 48;

export const pesos = (n?: number | null) =>
  '$ ' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const fecha = (iso?: string | null) => {
  if (!iso) return '-';
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(iso) || /T00:00:00(\.000)?Z$/.test(iso);
  const d = new Date(soloFecha ? iso.slice(0, 10) + 'T12:00:00' : iso);
  return d.toLocaleDateString('es-AR');
};

export const fechaHora = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
