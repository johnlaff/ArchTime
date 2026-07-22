import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getBrowserAccentIconUrl, normalizeHexColor } from '@/lib/custom-color'
import { THEME_COLOR_DARK } from '@/lib/theme-color'

const ICON_SIZES = [192, 512] as const
const ICON_PURPOSES = ['any', 'maskable'] as const

/**
 * Manifest dinâmico: os ícones seguem o accent do usuário. A cor chega por query
 * param (`?color=`), escrita pelo browser-accent.ts no href do <link rel="manifest">
 * — o fetch do manifest é feito sem credenciais pelo browser, então cookie sozinho
 * não funcionaria. O cookie fica como fallback para acessos diretos. O manifest era
 * um arquivo estático em public/ e acabava pré-cacheado pelo service worker com ícone
 * indigo fixo; como rota dinâmica ele fica fora do precache e reflete a cor atual em
 * instalações e atualizações do app.
 *
 * theme_color/background_color pintam a status bar e o splash na abertura do PWA e
 * usam o fundo do tema escuro (o app abre escuro por padrão), não o accent — a status
 * bar acompanha o app. Depois da abertura, o ThemeColorSync atualiza o <meta
 * name="theme-color"> em runtime para o fundo do tema efetivo (claro/escuro/tingido).
 */
export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const { searchParams } = new URL(req.url)
  const color =
    normalizeHexColor(searchParams.get('color')) ??
    normalizeHexColor(cookieStore.get('archtime-accent-color')?.value) ??
    '#6366f1'

  const manifest = {
    name: 'ArchTime',
    short_name: 'ArchTime',
    description: 'Time tracking para freelancers e profissionais independentes',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: THEME_COLOR_DARK,
    theme_color: THEME_COLOR_DARK,
    orientation: 'portrait',
    icons: ICON_SIZES.flatMap((size) =>
      ICON_PURPOSES.map((purpose) => ({
        src: getBrowserAccentIconUrl(color, size),
        sizes: `${size}x${size}`,
        type: 'image/png',
        purpose,
      }))
    ),
  }

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
