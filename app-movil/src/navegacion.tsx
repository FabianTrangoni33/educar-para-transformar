/**
 * Navegación por rol (mínimo privilegio): cada rol ve solo sus pestañas.
 * La autorización real la resuelve siempre el backend (JWT + RBAC); acá solo se oculta lo que no corresponde.
 *
 *  Sin sesión  → Inicio · Noticias · Galería · Opinar · Ingresar
 *  Padre       → Mis hijos · Inscripciones · Cuotas · Avisos · Perfil
 *  Estudiante  → Mis datos · Avisos · Perfil
 *  Docente     → Mis cursos · Avisos · Perfil
 */
import React, { useEffect } from 'react';
import { Linking, Text, View } from 'react-native';
import { NavigationContainer, createNavigationContainerRef, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colores } from './tema';
import { config } from './config';
import { Boton, Cargando, s } from './componentes/ui';
import { useSesion } from './modulos/acceso/sesion';
import { PantallaBloqueo, PantallaLogin, PantallaPerfil, PantallaRecuperar } from './modulos/acceso/pantallas';
import { PantallaGaleria, PantallaInstitucional, PantallaNoticias, PantallaOpinar } from './modulos/institucional/pantallas';
import { HijoProvider } from './modulos/alumnos/hijo';
import { PantallaAlumno, PantallaInicioPadre, PantallaInscripciones } from './modulos/alumnos/pantallas';
import { PantallaCuotas, PantallaFactura, PantallaPagar } from './modulos/pagos/pantallas';
import { PantallaDocente } from './modulos/docentes/pantallas';
import { PantallaAvisos } from './modulos/notificaciones/pantallas';
import { escucharToques } from './modulos/notificaciones/push';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();
export const navegacionRef = createNavigationContainerRef<any>();

type Icono = React.ComponentProps<typeof Ionicons>['name'];
const encabezado = { headerStyle: { backgroundColor: colores.primario }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' as const } };
const opcionesTabs = (icono: Icono, titulo: string, conEncabezado = true) => ({
  title: titulo,
  headerShown: conEncabezado,
  ...encabezado,
  tabBarIcon: ({ color, size }: { color: string; size: number }) => <Ionicons name={icono} color={color} size={size} />,
  tabBarActiveTintColor: colores.primario,
  tabBarInactiveTintColor: colores.textoSuave,
  tabBarLabelStyle: { fontSize: 12 }
});

// ── Sin sesión ──
function TabsPublicas() {
  return (
    <Tabs.Navigator>
      <Tabs.Screen name="Institucional" component={PantallaInstitucional} options={opcionesTabs('home-outline', 'Inicio')} />
      <Tabs.Screen name="Noticias" component={PantallaNoticias} options={opcionesTabs('newspaper-outline', 'Noticias')} />
      <Tabs.Screen name="Galeria" component={PantallaGaleria} options={opcionesTabs('images-outline', 'Galería')} />
      <Tabs.Screen name="Opinar" component={PantallaOpinar} options={opcionesTabs('star-outline', 'Opinar')} />
      <Tabs.Screen name="Login" component={PantallaLogin} options={opcionesTabs('log-in-outline', 'Ingresar')} />
    </Tabs.Navigator>
  );
}

// ── Padre ──
function StackInicioPadre() {
  return (
    <Stack.Navigator screenOptions={encabezado}>
      <Stack.Screen name="InicioPadre" component={PantallaInicioPadre} options={{ title: 'Mis hijos' }} />
      <Stack.Screen name="Alumno" component={PantallaAlumno} options={({ route }: any) => ({ title: route.params?.nombre ?? 'Alumno' })} />
    </Stack.Navigator>
  );
}
function StackCuotas() {
  return (
    <Stack.Navigator screenOptions={encabezado}>
      <Stack.Screen name="Cuotas" component={PantallaCuotas} options={{ title: 'Cuotas y pagos' }} />
      <Stack.Screen name="Factura" component={PantallaFactura} options={{ title: 'Factura' }} />
      <Stack.Screen name="Pagar" component={PantallaPagar} options={{ title: 'Informar pago' }} />
    </Stack.Navigator>
  );
}
function TabsPadre() {
  return (
    <HijoProvider>
      <Tabs.Navigator>
        <Tabs.Screen name="InicioTab" component={StackInicioPadre} options={opcionesTabs('people-outline', 'Mis hijos', false)} />
        <Tabs.Screen name="Inscripciones" component={PantallaInscripciones} options={opcionesTabs('add-circle-outline', 'Inscripciones')} />
        <Tabs.Screen name="CuotasTab" component={StackCuotas} options={opcionesTabs('card-outline', 'Cuotas', false)} />
        <Tabs.Screen name="Avisos" component={PantallaAvisos} options={opcionesTabs('notifications-outline', 'Avisos')} />
        <Tabs.Screen name="Perfil" component={PantallaPerfil} options={opcionesTabs('person-circle-outline', 'Perfil')} />
      </Tabs.Navigator>
    </HijoProvider>
  );
}

// ── Estudiante ──
function TabsEstudiante() {
  return (
    <Tabs.Navigator>
      <Tabs.Screen name="MisDatos" component={PantallaAlumno} options={opcionesTabs('school-outline', 'Mis datos')} />
      <Tabs.Screen name="Avisos" component={PantallaAvisos} options={opcionesTabs('notifications-outline', 'Avisos')} />
      <Tabs.Screen name="Perfil" component={PantallaPerfil} options={opcionesTabs('person-circle-outline', 'Perfil')} />
    </Tabs.Navigator>
  );
}

// ── Docente ──
function TabsDocente() {
  return (
    <Tabs.Navigator>
      <Tabs.Screen name="MisCursos" component={PantallaDocente} options={opcionesTabs('briefcase-outline', 'Mis cursos')} />
      <Tabs.Screen name="Avisos" component={PantallaAvisos} options={opcionesTabs('notifications-outline', 'Avisos')} />
      <Tabs.Screen name="Perfil" component={PantallaPerfil} options={opcionesTabs('person-circle-outline', 'Perfil')} />
    </Tabs.Navigator>
  );
}

// ── Administrador: opera solo desde la web ──
function PantallaSoloWeb() {
  const { salir } = useSesion();
  return (
    <View style={[s.pantalla, s.centro]}>
      <Ionicons name="desktop-outline" size={64} color={colores.primario} />
      <Text style={[s.titulo, { textAlign: 'center', marginVertical: 12 }]}>El rol Administrador usa el sistema web</Text>
      <Text style={[s.textoSuave, { textAlign: 'center', marginBottom: 16 }]}>ABM, reportes, tarifas y revisión de pagos se gestionan desde el panel web.</Text>
      <Boton texto="Abrir el sistema web" icono="open-outline" alPresionar={() => Linking.openURL(`${config.origen}/html/login-admin.html`)} estilo={{ alignSelf: 'stretch' }} />
      <Boton texto="Cerrar sesión" variante="texto" alPresionar={() => salir()} />
    </View>
  );
}

const PANTALLA_DE_AVISO: Record<string, string> = {
  cuotas: 'CuotasTab', deportes: 'Inscripciones', transporte: 'Inscripciones', comedor: 'Inscripciones', noticias: 'Noticias'
};

export function Navegacion() {
  const { estado, perfil } = useSesion();
  const rol = perfil?.usuario.rol;

  // Tocar una notificación abre la pantalla correspondiente
  useEffect(() => escucharToques(pantalla => {
    if (!navegacionRef.isReady()) return;
    const destino = PANTALLA_DE_AVISO[pantalla] ?? 'Avisos';
    try { navegacionRef.navigate(destino); } catch { navegacionRef.navigate('Avisos'); }
  }), []);

  if (estado === 'iniciando') return <Cargando texto="Iniciando..." />;

  const tabsPorRol = rol === 'PADRE' ? TabsPadre : rol === 'ESTUDIANTE' ? TabsEstudiante : rol === 'DOCENTE' ? TabsDocente : PantallaSoloWeb;

  return (
    <NavigationContainer ref={navegacionRef} theme={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colores.fondo, primary: colores.primario } }}>
      <Stack.Navigator screenOptions={encabezado}>
        {estado === 'publico' ? (
          <>
            <Stack.Screen name="Publico" component={TabsPublicas} options={{ headerShown: false }} />
            <Stack.Screen name="Recuperar" component={PantallaRecuperar} options={{ title: 'Recuperar contraseña' }} />
          </>
        ) : estado === 'bloqueado' ? (
          <Stack.Screen name="Bloqueo" component={PantallaBloqueo} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="Principal" component={tabsPorRol} options={{ headerShown: false }} />
            {/* Todos los roles acceden también a la sección pública */}
            <Stack.Screen name="Institucional" component={PantallaInstitucional} options={{ title: 'Institucional' }} />
            <Stack.Screen name="Noticias" component={PantallaNoticias} options={{ title: 'Noticias' }} />
            <Stack.Screen name="Galeria" component={PantallaGaleria} options={{ title: 'Galería' }} />
            <Stack.Screen name="Opinar" component={PantallaOpinar} options={{ title: 'Opiniones' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
