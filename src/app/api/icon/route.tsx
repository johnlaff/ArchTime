import { NextRequest } from 'next/server'
import { ImageResponse } from 'next/og'
import { cookies } from 'next/headers'
import {
  getReadableCustomForeground,
  getVisibleCustomOutline,
  normalizeHexColor,
} from '@/lib/custom-color'

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()

  const { searchParams } = new URL(req.url)
  const requestedColor = normalizeHexColor(searchParams.get('color'))
  const cookieColor = normalizeHexColor(cookieStore.get('archtime-accent-color')?.value)
  const bg = requestedColor ?? cookieColor ?? '#6366f1'
  const fg = getReadableCustomForeground(bg)
  const outline = getVisibleCustomOutline(bg)
  const size = Math.min(Math.max(Number(searchParams.get('size') ?? '192'), 64), 512)
  const outlineWidth = Math.max(1, Math.round(size * 0.035))

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          background: bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: Math.round(size * 0.22),
          boxShadow: outline === 'transparent' ? 'none' : `inset 0 0 0 ${outlineWidth}px ${outline}`,
        }}
      >
        <svg
          width={size * 0.62}
          height={size * 0.62}
          viewBox="0 0 100 100"
          fill="none"
        >
          <circle cx="50" cy="13" r="6.5" fill={fg} />
          <line
            x1="50" y1="13" x2="13" y2="87"
            stroke={fg} strokeWidth="9.5" strokeLinecap="round"
          />
          <line
            x1="50" y1="13" x2="87" y2="87"
            stroke={fg} strokeWidth="9.5" strokeLinecap="round"
          />
          <line
            x1="27" y1="60" x2="73" y2="60"
            stroke={fg} strokeWidth="6.5" strokeLinecap="round"
          />
          <path
            d="M 13 87 A 82 82 0 0 1 87 87"
            stroke={fg}
            strokeWidth="3.5"
            strokeDasharray="5 4"
            strokeLinecap="round"
            opacity="0.55"
          />
        </svg>
      </div>
    ),
    { width: size, height: size }
  )
}
