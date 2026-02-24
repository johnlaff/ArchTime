import { NextRequest } from 'next/server'
import { ImageResponse } from 'next/og'
import { cookies } from 'next/headers'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const bg = cookieStore.get('archtime-accent-color')?.value ?? '#6366f1'

  const { searchParams } = new URL(req.url)
  const size = Math.min(Math.max(Number(searchParams.get('size') ?? '192'), 64), 512)

  const sw = 8.5

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
        }}
      >
        <svg
          width={size * 0.62}
          height={size * 0.62}
          viewBox="0 0 100 100"
        >
          {/* Hour hand — 10 o'clock position (305° clockwise from 12) */}
          <line
            x1="50" y1="58" x2="20" y2="37"
            stroke="white" strokeWidth={sw} strokeLinecap="round"
          />
          {/* Minute hand — 2 o'clock position (60° clockwise from 12) */}
          <line
            x1="50" y1="58" x2="88" y2="36"
            stroke="white" strokeWidth={sw} strokeLinecap="round"
          />
          {/* Crossbar — horizontal bar of the letter A */}
          <line
            x1="37" y1="49" x2="67" y2="49"
            stroke="white" strokeWidth={sw} strokeLinecap="round"
          />
          {/* Center pivot dot */}
          <circle cx="50" cy="58" r="5" fill="white" />
        </svg>
      </div>
    ),
    { width: size, height: size }
  )
}
