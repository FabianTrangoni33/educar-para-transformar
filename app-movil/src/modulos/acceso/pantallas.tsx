/** Pantallas del módulo Acceso: ingreso, recuperación de contraseña, bloqueo biométrico y perfil. */
import React, { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Switch, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Boton, Campo, Fila, Pantalla, Seccion, Tarjeta, Titulo, s } from '../../componentes/ui';
import { colores, espacio } from '../../tema';
import { ErrorApi } from '../../nucleo/apiClient';
import { accesoRepo } from '../../repositorios';
import { useSesion } from './sesion';

const logo = require('../../../assets/icon.png');
const ROLES: Record<string, string> = { PADRE: 'Padre / Tutor', ESTUDIANTE: 'Estudiante', DOCENTE: 'Docente', ADMIN: 'Administrador' };

export function PantallaLogin() {
  const { ingresar, aviso, limpiarAviso } = useSesion();
  const nav = useNavigation<any>();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const enviar = async () => {
    limpiarAviso();
    if (!usuario.trim() || !password) return setError('Ingresá tu correo o DNI y tu contraseña.');
    setCargando(true);
    setError(null);
    try {
      await ingresar(usuario, password);
    } catch (e) {
      // El mensaje del servidor no revela qué dato falló ("Credenciales inválidas")
      setError(e instanceof ErrorApi ? e.message : 'No se pudo iniciar sesión.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pantalla>
        <View style={{ alignItems: 'center', marginVertical: espacio.xl }}>
          <Image source={logo} style={{ width: 88, height: 88, borderRadius: 20 }} accessibilityIgnoresInvertColors />
          <Text style={[s.titulo, { marginTop: espacio.m }]}>Educar para Transformar</Text>
          <Text style={s.textoSuave}>Acceso para familias, estudiantes y docentes</Text>
        </View>
        {aviso ? <Text style={[s.avisoOffline, { color: colores.alerta }]}>{aviso}</Text> : null}
        <Campo etiqueta="Correo electrónico o DNI" value={usuario} onChangeText={setUsuario} autoCapitalize="none" autoComplete="username" keyboardType="email-address" textContentType="username" />
        <Campo etiqueta="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={enviar} />
        {error ? <Text style={{ color: colores.error, marginBottom: espacio.m }} accessibilityRole="alert">{error}</Text> : null}
        <Boton texto="Ingresar" icono="log-in-outline" alPresionar={enviar} cargando={cargando} />
        <Boton texto="Olvidé mi contraseña" variante="texto" alPresionar={() => nav.navigate('Recuperar')} />
      </Pantalla>
    </KeyboardAvoidingView>
  );
}

export function PantallaRecuperar() {
  const nav = useNavigation<any>();
  const [paso, setPaso] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [nueva, setNueva] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const pedirCodigo = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Ingresá un correo válido.');
    setCargando(true); setError(null);
    try {
      const r = await accesoRepo.recuperar(email);
      setMensaje(r.mensaje + (r.codigo_demo ? `\n(Modo prueba: tu código es ${r.codigo_demo})` : ''));
      setPaso(2);
    } catch (e) {
      setError((e as Error).message);
    } finally { setCargando(false); }
  };

  const restablecer = async () => {
    if (codigo.trim().length !== 6) return setError('El código tiene 6 dígitos.');
    if (nueva.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');
    setCargando(true); setError(null);
    try {
      const r = await accesoRepo.restablecer(email, codigo, nueva);
      Alert.alert('Listo', r.mensaje, [{ text: 'Ingresar', onPress: () => nav.goBack() }]);
    } catch (e) {
      setError((e as Error).message);
    } finally { setCargando(false); }
  };

  return (
    <Pantalla>
      <Titulo sub="Te enviaremos un código a tu correo registrado.">Recuperar contraseña</Titulo>
      <Campo etiqueta="Correo electrónico" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" editable={paso === 1} />
      {paso === 2 ? (
        <>
          {mensaje ? <Text style={[s.texto, { marginBottom: espacio.m }]}>{mensaje}</Text> : null}
          <Campo etiqueta="Código de 6 dígitos" value={codigo} onChangeText={setCodigo} keyboardType="number-pad" maxLength={6} />
          <Campo etiqueta="Nueva contraseña" value={nueva} onChangeText={setNueva} secureTextEntry />
        </>
      ) : null}
      {error ? <Text style={{ color: colores.error, marginBottom: espacio.m }} accessibilityRole="alert">{error}</Text> : null}
      <Boton texto={paso === 1 ? 'Enviar código' : 'Cambiar contraseña'} alPresionar={paso === 1 ? pedirCodigo : restablecer} cargando={cargando} />
      {paso === 2 ? <Boton texto="Reenviar código" variante="texto" alPresionar={pedirCodigo} /> : null}
    </Pantalla>
  );
}

export function PantallaBloqueo() {
  const { desbloquear, salir } = useSesion();
  const [error, setError] = useState<string | null>(null);
  const intentar = async () => {
    setError(null);
    if (!(await desbloquear())) setError('No se pudo verificar tu identidad.');
  };
  React.useEffect(() => { intentar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={[s.pantalla, s.centro]}>
      <Ionicons name="finger-print" size={72} color={colores.primario} />
      <Text style={[s.titulo, { marginVertical: espacio.m }]}>App bloqueada</Text>
      {error ? <Text style={{ color: colores.error, marginBottom: espacio.m }}>{error}</Text> : null}
      <Boton texto="Desbloquear" icono="lock-open-outline" alPresionar={intentar} estilo={{ alignSelf: 'stretch' }} />
      <Boton texto="Ingresar con otra cuenta" variante="texto" alPresionar={() => salir()} />
    </View>
  );
}

export function PantallaPerfil() {
  const { perfil, salir, biometriaActiva, cambiarBiometria } = useSesion();
  const nav = useNavigation<any>();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [cargando, setCargando] = useState(false);
  if (!perfil) return null;
  const u = perfil.usuario;

  const cambiar = async () => {
    if (!actual || nueva.length < 6) return Alert.alert('Revisá los datos', 'La nueva contraseña debe tener al menos 6 caracteres.');
    setCargando(true);
    try {
      const r = await accesoRepo.cambiarPassword(actual, nueva);
      setActual(''); setNueva('');
      Alert.alert('Contraseña actualizada', r.mensaje);
    } catch (e) {
      Alert.alert('No se pudo cambiar', (e as Error).message);
    } finally { setCargando(false); }
  };

  const confirmarSalida = () => Alert.alert('Cerrar sesión', '¿Querés salir de tu cuenta en este dispositivo?', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Cerrar sesión', style: 'destructive', onPress: () => salir() }
  ]);

  return (
    <Pantalla>
      <Tarjeta>
        <Text style={s.titulo}>{u.nombre} {u.apellido}</Text>
        <Text style={s.textoSuave}>{ROLES[u.rol]} · {u.email}</Text>
        {perfil.docente?.especialidad ? <Text style={s.textoSuave}>{perfil.docente.especialidad}</Text> : null}
      </Tarjeta>

      <Seccion titulo="Seguridad">
        <Tarjeta>
          <Fila
            icono="finger-print"
            titulo="Desbloqueo con huella o rostro"
            detalle="Pide tu biometría cada vez que abrís la app"
            derecha={<Switch value={biometriaActiva} accessibilityLabel="Desbloqueo biométrico" onValueChange={async v => {
              const err = await cambiarBiometria(v);
              if (err) Alert.alert('Biometría', err);
            }} />}
          />
        </Tarjeta>
        <Tarjeta>
          <Text style={[s.etiqueta, { marginBottom: espacio.m }]}>Cambiar contraseña</Text>
          <Campo etiqueta="Contraseña actual" value={actual} onChangeText={setActual} secureTextEntry />
          <Campo etiqueta="Nueva contraseña" value={nueva} onChangeText={setNueva} secureTextEntry />
          <Boton texto="Guardar nueva contraseña" variante="secundario" alPresionar={cambiar} cargando={cargando} />
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Institucional">
        <Tarjeta alPresionar={() => nav.navigate('Institucional')} etiqueta="Ver información institucional">
          <Fila icono="school-outline" titulo="Información, noticias y galería" detalle="También podés dejar tu opinión" />
        </Tarjeta>
      </Seccion>

      <Boton texto="Cerrar sesión" icono="log-out-outline" variante="peligro" alPresionar={confirmarSalida} />
    </Pantalla>
  );
}
