import { PageShell } from '@/components/page-shell'
import { ProjetosClient } from './projetos-client'

// Static shell: no SSR auth/data (proxy.ts gates this route). The project list
// loads client-side, BR→BR direct from Supabase (RLS-scoped). Writes still go
// through /api/projects (audit log) and update the list optimistically.
export default function ProjetosPage() {
  return (
    <PageShell>
      <ProjetosClient />
    </PageShell>
  )
}
