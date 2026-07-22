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
 * theme_color/background_color pintam a status bar e o splash na abertura do PWA. O
 * manifest não varia por esquema em nenhum browser, então usam uma cor única e fixa —
 * o fundo escuro, como âncora de marca (não o accent). Depois da abertura, o
 * ThemeColorSync atualiza o <meta name="theme-color"> em runtime para o fundo do tema
 * efetivo (claro/escuro/tingido); um usuário com SO claro e sem preferência salva vê a
 * splash escura por um instante antes dessa correção — limitação de plataforma, não bug.
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
