// A status bar do sistema (num PWA standalone) e a barra do navegador são pintadas
// pelo <meta name="theme-color">. Ela deve acompanhar o FUNDO do tema resolvido —
// claro ou escuro, já tingido pelo accent/preset — e não a cor de destaque: uma
// status bar verde sobre um app escuro destoa. O accent segue identificando ícones
// e o manifest; a status bar segue o app. Ver [[browser-accent]] (dono dos ícones)
// e o componente ThemeColorSync (dono do runtime).
//
// Alcance por plataforma (verificado 2026-07): quem lê o <meta name="theme-color">
// em runtime é o Chromium (Chrome/Edge/Samsung Internet, PWA/aba Android) — é aí que
// este módulo pinta a barra. A partir do Safari/iOS 26 o WebKit ignora a meta e deriva
// a cor da barra do background-color do <body> amostrado no primeiro paint; como o
// <body> já carrega o fundo do tema via CSS, a barra fica correta lá sem esta meta.
// Um PWA instalado no iOS nunca aceitou cor livre (só apple-mobile-web-app-status-bar-
// style). Logo, "o toggle não muda a cor no iPhone" é comportamento de plataforma,
// não bug deste módulo.

// oklch(0.145 0 0), o --background do tema escuro neutro. Fallback e âncora de marca
// para o theme_color/background_color do manifest — a cor da splash nativa e da barra
// no instante de abertura do PWA, ANTES de haver DOM/JS para o runtime assumir. O
// manifest não varia por esquema em nenhum browser (a spec color_scheme_dark, de
// 2026-04, ainda não tem implementação), então essa é uma cor única e fixa por design.
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
 *
 * O '#000' de base detecta cor inválida (fillStyle a ignora e mantém o preto) e
 * pressupõe que --background é opaco — verdade por design (os tokens de fundo não têm
 * alfa); um fundo translúcido comporia sobre esse preto e mudaria o resultado.
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

/** Escreve a cor no <meta name="theme-color"> (cria uma vez, reusa o mesmo nó). */
export function writeThemeColorMeta(color: string): void {
  if (typeof document === 'undefined') return

  let meta = document.head.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  if (meta.content !== color) meta.content = color
}

export function syncThemeColorMeta(): void {
  writeThemeColorMeta(readResolvedBackgroundColor())
}
