/**
 * App Móvil "Educar para Transformar" (React Native + Expo).
 * Nuevo cliente del backend existente: comparte la API REST (/api/v1) y la base de datos con la web.
 */
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SesionProvider } from './src/modulos/acceso/sesion';
import { Navegacion } from './src/navegacion';

export default function App() {
  return (
    <SafeAreaProvider>
      <SesionProvider>
        <Navegacion />
        <StatusBar style="light" />
      </SesionProvider>
    </SafeAreaProvider>
  );
}
