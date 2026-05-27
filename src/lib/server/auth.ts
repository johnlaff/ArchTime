import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { isAllowedEmail } from '@/lib/auth'

export interface AuthUser {
  id: string
  email: string | undefined
  user_metadata: Record<string, unknown>
}

/**
 * Verifies the caller's JWT locally via getClaims (cached JWKS, no Auth-server
 * round-trip) since the project uses asymmetric signing keys. Trades instant
 * ban/deletion detection (delayed until the JWT expires) for speed.
 */
export async function getAuthenticatedUser(): Promise<AuthUser | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()

  const claims = data?.claims
  if (error || !claims?.sub || !isAllowedEmail(claims.email)) return null

  return {
    id: claims.sub,
    email: claims.email,
    user_metadata: claims.user_metadata ?? {},
  }
}

// Deduplicates auth verification across Server Components in the same render pass.
export const getCachedAuthenticatedUser = cache(getAuthenticatedUser)
