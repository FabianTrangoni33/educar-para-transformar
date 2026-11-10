/** Hijo seleccionado por el padre, compartido entre pestañas (Inicio, Inscripciones, Cuotas). */
import React, { createContext, useContext, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Chip } from '../../componentes/ui';
import { useSesion } from '../acceso/sesion';
import type { Hijo } from '../../modelos';

const Ctx = createContext<{ idHijo: number | null; setIdHijo: (id: number) => void }>({ idHijo: null, setIdHijo: () => {} });

export function HijoProvider({ children }: { children: React.ReactNode }) {
  const { perfil } = useSesion();
  const [idHijo, setIdHijo] = useState<number | null>(perfil?.hijos[0]?.id_alumno ?? null);
  return <Ctx.Provider value={{ idHijo, setIdHijo }}>{children}</Ctx.Provider>;
}

export function useHijo(): { hijos: Hijo[]; hijo: Hijo | null; setIdHijo: (id: number) => void } {
  const { perfil } = useSesion();
  const { idHijo, setIdHijo } = useContext(Ctx);
  const hijos = perfil?.hijos ?? [];
  const hijo = hijos.find(h => h.id_alumno === idHijo) ?? hijos[0] ?? null;
  return { hijos, hijo, setIdHijo };
}

/** Selector de hijo: solo aparece si el padre tiene más de uno */
export function SelectorHijo() {
  const { hijos, hijo, setIdHijo } = useHijo();
  if (hijos.length < 2) return null;
  return (
    <View style={{ marginBottom: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {hijos.map(h => <Chip key={h.id_alumno} texto={h.nombre} activo={h.id_alumno === hijo?.id_alumno} alPresionar={() => setIdHijo(h.id_alumno)} />)}
      </ScrollView>
    </View>
  );
}
