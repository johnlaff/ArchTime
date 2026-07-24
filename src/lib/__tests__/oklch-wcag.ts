/**
 * Matemática OKLCH → sRGB → luminância/contraste WCAG usada pelas provas de
 * acessibilidade dos tokens derivados em CSS (tint de fundo e accent custom).
 * Reproduz o pipeline do browser: OKLCH → linear RGB → clip de gamut → sRGB.
 */

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))

const linToSrgb = (c: number) => {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
  return clamp(v, 0, 1)
}

export function oklchToLinearRgb(L: number, C: number, H: number) {
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
export function wcagLuminance(L: number, C = 0, H = 0): number {
  const lin = oklchToLinearRgb(L, C, H)
  // clip de gamut como o browser faz, depois relineariza para luminância
  const r = linToSrgb(lin.r), g = linToSrgb(lin.g), b = linToSrgb(lin.b)
  const de = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * de(r) + 0.7152 * de(g) + 0.0722 * de(b)
}

export function contrast(
  aL: number, aC: number, aH: number,
  bL: number, bC: number, bH: number
): number {
  const la = wcagLuminance(aL, aC, aH), lb = wcagLuminance(bL, bC, bH)
  const hi = Math.max(la, lb), lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

export const AA = 4.5

export const HUES = Array.from({ length: 360 }, (_, h) => h)

/** Chromas de origem representativos: near-cinza até saturação alta de gamut sRGB. */
export const SOURCE_CHROMAS = [0.004, 0.012, 0.045, 0.1, 0.18, 0.25, 0.37]

/** Menor contraste do par ao longo de todas as matizes × chromas de origem. */
export function worstContrast(
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
