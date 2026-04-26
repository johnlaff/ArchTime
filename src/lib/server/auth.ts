import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isAllowedEmail } from '@/lib/auth'

export async function getAuthenticatedUser(): Promise<User | null> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user || !isAllowedEmail(user.email)) return null
  return user
}
