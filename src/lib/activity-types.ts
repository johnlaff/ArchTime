// Tipos de atividade por sessão. Lista fixa (não customizável nesta fase).
// Módulo server-safe: só dados + validação, sem imports de UI/ícones — para ser
// usável em rotas de API e no cliente. O mapeamento de ícones vive no componente
// cliente (activity-selector.tsx).

export interface ActivityTypeMeta {
  label: string
}

export const ACTIVITY_TYPES = {
  'visita-cliente': { label: 'Visita cliente' },
  modelagem: { label: 'Modelagem 3D' },
  prancha: { label: 'Prancha' },
  reuniao: { label: 'Reunião' },
  obra: { label: 'Obra' },
  admin: { label: 'Administrativo' },
  estudo: { label: 'Estudo' },
} as const satisfies Record<string, ActivityTypeMeta>

export type ActivityType = keyof typeof ACTIVITY_TYPES

export const ACTIVITY_TYPE_KEYS = Object.keys(ACTIVITY_TYPES) as ActivityType[]

export function isActivityType(value: unknown): value is ActivityType {
  return typeof value === 'string' && Object.hasOwn(ACTIVITY_TYPES, value)
}

/**
 * Normaliza um valor recebido de um body de request:
 * - `null`/`''`/ausente → `null` (atividade é sempre opcional)
 * - valor válido → a `ActivityType`
 * - valor inválido → `undefined` (o chamador deve responder 400)
 */
export function parseActivityType(value: unknown): ActivityType | null | undefined {
  if (value == null || value === '') return null
  return isActivityType(value) ? (value as ActivityType) : undefined
}

export function activityLabel(value: string | null | undefined): string | null {
  return isActivityType(value) ? ACTIVITY_TYPES[value].label : null
}
