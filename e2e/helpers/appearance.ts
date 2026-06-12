import type { Page } from '@playwright/test'

/**
 * Canal alpha de uma cor CSS computada. Cores sem componente alpha explícito
 * (rgb/oklch/color-mix de 3 canais) são opacas. O parse de rgb()/rgba() é por
 * posição (4º componente), nunca por regex gulosa — 'rgb(120, 60, 0)' é opaco,
 * não alpha 0.
 */
export function alpha(color: string): number {
  const slash = color.match(/\/\s*([\d.]+)(%?)\s*\)\s*$/)
  if (slash) return slash[2] === '%' ? Number(slash[1]) / 100 : Number(slash[1])
  const fn = color.match(/^rgba?\(([^)]+)\)$/)
  if (fn) {
    const channels = fn[1].split(',').map((c) => c.trim())
    if (channels.length === 4) return Number(channels[3])
  }
  return 1
}

export interface AppearanceOptions {
  dark: boolean
  pink?: boolean
  blueprint?: boolean
}

/**
 * Injeta tema + accent ANTES do load. O script anti-flash do layout lê o
 * localStorage, e o marcador `archtime-preferences-updated-at` impede que o
 * PreferencesHydrator sobrescreva a aparência injetada com as prefs salvas do
 * servidor (a conta de teste tem preset/tema próprios). Sem preset → o custom
 * accent rosa não é vencido por um data-preset.
 */
export async function applyAppearance(page: Page, opts: AppearanceOptions) {
  await page.addInitScript((o) => {
    try {
      localStorage.setItem('theme', o.dark ? 'dark' : 'light')
      localStorage.removeItem('archtime-preset')
      if (o.blueprint) localStorage.setItem('archtime-blueprint', 'true')
      if (o.pink) {
        localStorage.setItem('archtime-accent', 'custom')
        localStorage.setItem('archtime-accent-custom', '#ec4899') // rosa saturado
      } else {
        localStorage.setItem('archtime-accent', 'indigo')
        localStorage.removeItem('archtime-accent-custom')
      }
      localStorage.setItem('archtime-preferences-updated-at', String(Date.now()))
    } catch {}
  }, opts)
}
