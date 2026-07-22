import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Prova de acessibilidade do tint de fundo dinâmico (cor de destaque → fundo).
 *
 * O tint é aplicado em CSS via relative color: `oklch(from var(--primary) L C h)`,
 * com L fixo no valor do tema neutro e chroma clampado. Este teste reproduz EXATAMENTE
 * essa fórmula (mesmas constantes de globals.css) e varre todo o círculo de matizes,
 * exigindo contraste WCAG AA em cada par texto/superfície. É o critério de parada
 * verificável: se qualquer matiz cair abaixo de 4.5:1, o teste falha.
 *
 * Fonte da verdade das constantes: os blocos `[data-bg-tint="on"]...` em
 * src/app/globals.css. O bloco "sincronia com globals.css" (no fim deste arquivo) lê
 * o CSS e casa os valores da fórmula, travando o drift entre teste e folha de estilo.
 */

// ── Constantes do tint (espelham globals.css) ─────────────────────────────────
const TINT = {
  light: {
    bg: { L: 0.98, Cmax: 0.012 },
    mutedFg: { L: 0.5, Cmax: 0.02 },
  },
  dark: {
    bg: { L: 0.145, Cmax: 0.01 },
    card: { L: 0.205, Cmax: 0.008 },
  },
} as const

// Foregrounds herdados do tema (não mudam no modo tingido).
const FOREGROUND = { light: 0.145, dark: 0.985 } // --foreground / --card-foreground (cinza neutro)
const MUTED_FG_DARK = 0.708 // --muted-foreground no dark (inalterado)
const CARD_LIGHT = 1 // --card no light permanece branco

// ── OKLCH → sRGB → luminância WCAG (mesma matemática do runtime CSS) ───────────
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
const linToSrgb = (c: number) => {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
  return clamp(v, 0, 1)
}
function oklchToLinearRgb(L: number, C: number, H: number) {
  const a = C * Math.cos((H * Math.PI) / 180)
  const b = C * Math.sin((H * Math.PI) / 180)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  }
}
/** Luminância relativa WCAG a partir de OKLCH (via sRGB clipado em gamut). */
function wcagLuminance(L: number, C = 0, H = 0): number {
  const lin = oklchToLinearRgb(L, C, H)
  // clip de gamut como o browser faz, depois relineariza para luminância
  const r = linToSrgb(lin.r), g = linToSrgb(lin.g), b = linToSrgb(lin.b)
  const de = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * de(r) + 0.7152 * de(g) + 0.0722 * de(b)
}
function contrast(aL: number, aC: number, aH: number, bL: number, bC: number, bH: number): number {
  const la = wcagLuminance(aL, aC, aH), lb = wcagLuminance(bL, bC, bH)
  const hi = Math.max(la, lb), lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

const AA = 4.5
const HUES = Array.from({ length: 360 }, (_, h) => h)
// Chroma de origem do accent: near-cinza até saturação alta. clamp() decide o tint real.
const SOURCE_CHROMAS = [0.004, 0.012, 0.045, 0.1, 0.18, 0.25, 0.37]

/** Menor contraste do par ao longo de todas as matizes × chromas de origem. */
function worstContrast(
  pairFor: (h: number, srcC: number) => number
): { min: number; at: { h: number; srcC: number } } {
  let min = Infinity
  let at = { h: 0, srcC: 0 }
  for (const srcC of SOURCE_CHROMAS) {
    for (const h of HUES) {
      const c = pairFor(h, srcC)
      if (c < min) { min = c; at = { h, srcC } }
    }
  }
  return { min, at }
}

describe('tint de fundo dinâmico — garantia WCAG AA', () => {
  it('texto principal sobre o fundo tingido (light) ≥ 4.5', () => {
    const { min } = worstContrast((h, srcC) =>
      contrast(FOREGROUND.light, 0, 0, TINT.light.bg.L, Math.min(srcC, TINT.light.bg.Cmax), h)
    )
    expect(min).toBeGreaterThanOrEqual(AA)
  })

  it('texto-muted sobre o fundo tingido (light) ≥ 4.5', () => {
    const { min, at } = worstContrast((h, srcC) =>
      contrast(
        TINT.light.mutedFg.L, Math.min(srcC, TINT.light.mutedFg.Cmax), h,
        TINT.light.bg.L, Math.min(srcC, TINT.light.bg.Cmax), h
      )
    )
    expect(min, `pior caso em h=${at.h} srcC=${at.srcC}`).toBeGreaterThanOrEqual(AA)
  })

  it('texto-muted sobre card branco (light) ≥ 4.5', () => {
    const { min } = worstContrast((h, srcC) =>
      contrast(TINT.light.mutedFg.L, Math.min(srcC, TINT.light.mutedFg.Cmax), h, CARD_LIGHT, 0, 0)
    )
    expect(min).toBeGreaterThanOrEqual(AA)
  })

  it('texto-muted sobre superfície --muted (light, L≈0.97) ≥ 4.5', () => {
    const { min } = worstContrast((h, srcC) =>
      contrast(
        TINT.light.mutedFg.L, Math.min(srcC, TINT.light.mutedFg.Cmax), h,
        0.97, Math.min(srcC, 0.015), h
      )
    )
    expect(min).toBeGreaterThanOrEqual(AA)
  })

  it('texto principal sobre o fundo tingido (dark) ≥ 4.5', () => {
    const { min } = worstContrast((h, srcC) =>
      contrast(FOREGROUND.dark, 0, 0, TINT.dark.bg.L, Math.min(srcC, TINT.dark.bg.Cmax), h)
    )
    expect(min).toBeGreaterThanOrEqual(AA)
  })

  it('texto-muted sobre o fundo tingido (dark) ≥ 4.5', () => {
    const { min } = worstContrast((h, srcC) =>
      contrast(MUTED_FG_DARK, 0, 0, TINT.dark.bg.L, Math.min(srcC, TINT.dark.bg.Cmax), h)
    )
    expect(min).toBeGreaterThanOrEqual(AA)
  })

  it('texto-muted sobre o card tingido (dark) ≥ 4.5', () => {
    const { min } = worstContrast((h, srcC) =>
      contrast(MUTED_FG_DARK, 0, 0, TINT.dark.card.L, Math.min(srcC, TINT.dark.card.Cmax), h)
    )
    expect(min).toBeGreaterThanOrEqual(AA)
  })
})

describe('sincronia com globals.css — o CSS shipado usa as constantes provadas', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8')
  const rel = (L: number, Cmax: number) =>
    `oklch(from var(--primary) ${L} clamp(0, c, ${Cmax}) h)`

  it('fundo e muted-foreground do light batem com o teste', () => {
    expect(css).toContain(rel(TINT.light.bg.L, TINT.light.bg.Cmax))
    expect(css).toContain(rel(TINT.light.mutedFg.L, TINT.light.mutedFg.Cmax))
  })

  it('fundo e card do dark batem com o teste', () => {
    expect(css).toContain(rel(TINT.dark.bg.L, TINT.dark.bg.Cmax))
    expect(css).toContain(rel(TINT.dark.card.L, TINT.dark.card.Cmax))
  })

  it('o muted-foreground do dark é restaurado ao valor neutro que passa AA', () => {
    expect(css).toContain(`--muted-foreground: oklch(${MUTED_FG_DARK} 0 0)`)
  })
})
