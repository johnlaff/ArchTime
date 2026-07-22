// A status bar do sistema (num PWA standalone) e a barra do navegador são pintadas
// pelo <meta name="theme-color">. Ela deve acompanhar o FUNDO do tema resolvido —
// claro ou escuro, já tingido pelo accent/preset — e não a cor de destaque: uma
// status bar verde sobre um app escuro destoa. O accent segue identificando ícones
// e o manifest; a status bar segue o app. Ver [[browser-accent]] (dono dos ícones)
// e o componente ThemeColorSync (dono do runtime).

// oklch(0.145 0 0), o --background do tema escuro neutro. Serve de fallback e de
// theme_color do manifest (a cor de abertura do PWA, antes do runtime assumir).
export const THEME_COLOR_DARK = '#0a0a0a'

function channelToHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0')
}

/** Caminho rápido para rgb()/rgba() (o formato que a maioria dos ambientes serializa). */
function parseRgb(color: string): string | null {
  const match = color.match(/rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/)
  if (!match) return null
  return `#${channelToHex(Number(match[1]))}${channelToHex(Number(match[2]))}${channelToHex(Number(match[3]))}`
}

/**
 * O Chromium serializa uma cor definida em oklch como `oklch(...)` (não `rgb(...)`),
 * e o <meta name="theme-color"> não aceita oklch de forma confiável. O canvas 2D usa
 * o mesmo parser de cor do browser, então normaliza qualquer espaço (oklch/oklab/
 * color()) para os canais sRGB reais. Indisponível fora do browser ⇒ null.
 */
function normalizeViaCanvas(color: string): string | null {
  try {
    const context = document.createElement('canvas').getContext('2d')
    if (!context) return null
    context.fillStyle = '#000'
    context.fillStyle = color // valor inválido é ignorado e mantém o '#000' anterior
    context.fillRect(0, 0, 1, 1)
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data
    return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`
  } catch {
    return null
  }
}

/** Lê o fundo realmente renderizado (resolve oklch, tema, preset e o tinge). */
export function readResolvedBackgroundColor(): string {
  if (typeof document === 'undefined' || !document.body) return THEME_COLOR_DARK
  const background = getComputedStyle(document.body).backgroundColor
  return parseRgb(background) ?? normalizeViaCanvas(background) ?? THEME_COLOR_DARK
}

export function syncThemeColorMeta(): void {
  if (typeof document === 'undefined') return
  const color = readResolvedBackgroundColor()

  let meta = document.head.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  if (meta.content !== color) meta.content = color
}
