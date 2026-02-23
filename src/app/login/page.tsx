'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function LoginContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  async function handleGoogleLogin() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">PontoArq</CardTitle>
          <CardDescription>Registro de ponto para arquiteta PJ</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error === 'unauthorized' && (
            <p className="text-sm text-destructive text-center">
              Acesso não autorizado. Use o e-mail cadastrado.
            </p>
          )}
          <Button onClick={handleGoogleLogin} className="w-full" size="lg">
            Entrar com Google
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
