# Edição Auditada de Registros no Histórico

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permitir editar horário e projeto de um registro no `/historico` de forma rastreável — toda edição grava `oldData`/`newData` no `AuditLog`, recalcula o hash e marca o registro como `source: "edited"`, que aparece visivelmente no histórico.

**Architecture:** Três mudanças independentes e sequenciais. (1) A API `history` passa a retornar o campo `source`. (2) Um novo handler `PATCH /api/clock/[id]` valida, recalcula hash, atualiza `TimeAllocation` e grava no `AuditLog`. (3) O `HistoricoClient` ganha botão de edição, modal com inputs de horário em BRT + seletor de projeto, e badge visual para entradas editadas. A conversão BRT→UTC acontece no servidor usando `fromZonedTime` do `date-fns-tz`.

**Tech Stack:** Next.js 15 App Router · Prisma 7 · date-fns-tz (`fromZonedTime`) · shadcn/ui (`Dialog`, `Input`, `Select`) · sonner (toasts) · lucide-react (`Pencil`)

---

## Task 1: Incluir `source` na resposta do history endpoint

**Files:**
- Modify: `src/app/api/clock/history/route.ts`

**Step 1: Adicionar `source` ao objeto mapeado**

No arquivo `src/app/api/clock/history/route.ts`, localizar o bloco `const mapped = entries.map(...)` e adicionar `source: e.source` ao objeto retornado:

```ts
const mapped = entries.map((e) => ({
  id: e.id,
  clockIn: e.clockIn.toISOString(),
  clockOut: e.clockOut!.toISOString(),
  totalMinutes: e.totalMinutes,
  projectName: e.allocations[0]?.project.name ?? null,
  projectColor: e.allocations[0]?.project.color ?? null,
  entryDate: e.entryDate.toISOString(),
  source: e.source,
}))
```

**Step 2: Rodar os testes**

```bash
npm test
```

Expected: 9 passing.

**Step 3: Commit**

```bash
git add src/app/api/clock/history/route.ts
git commit -m "feat: include source field in history API response"
```

---

## Task 2: PATCH /api/clock/[id] — endpoint de edição auditada

**Files:**
- Modify: `src/app/api/clock/[id]/route.ts`

O arquivo já tem `PUT` (clock-out) e `DELETE`. Adicionar `PATCH` abaixo do `DELETE`.

**Step 1: Adicionar import de `fromZonedTime`**

No topo do arquivo, adicionar à linha dos imports existentes:

```ts
import { fromZonedTime } from 'date-fns-tz'
import { TIMEZONE } from '@/lib/constants'
```

**Step 2: Adicionar o handler PATCH**

Colar ao final do arquivo, após o handler `DELETE`:

```ts
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { clockInTime, clockOutTime, projectId } = body as {
    clockInTime: string       // "HH:MM" em BRT
    clockOutTime: string      // "HH:MM" em BRT
    projectId: string | null
  }

  if (!clockInTime || !clockOutTime) {
    return NextResponse.json({ error: 'Horários são obrigatórios' }, { status: 400 })
  }

  const entry = await prisma.clockEntry.findFirst({
    where: { id, userId: user.id },
    include: { allocations: { take: 1 } },
  })

  if (!entry) {
    return NextResponse.json({ error: 'Entrada não encontrada' }, { status: 404 })
  }

  if (!entry.clockOut) {
    return NextResponse.json(
      { error: 'Não é possível editar uma sessão em andamento' },
      { status: 409 }
    )
  }

  // Reconstruir datas UTC a partir do horário BRT + data do registro
  const brtDate = entry.entryDate.toISOString().slice(0, 10)
  const newClockIn = fromZonedTime(`${brtDate}T${clockInTime}:00`, TIMEZONE)
  const newClockOut = fromZonedTime(`${brtDate}T${clockOutTime}:00`, TIMEZONE)

  if (newClockOut <= newClockIn) {
    return NextResponse.json(
      { error: 'Horário de saída deve ser posterior ao de entrada' },
      { status: 400 }
    )
  }

  const totalMinutes = calcDurationMinutes(newClockIn, newClockOut)
  const hash = await generateEntryHash({
    clockIn: newClockIn.toISOString(),
    clockOut: newClockOut.toISOString(),
    userId: user.id,
    entryDate: entry.entryDate.toISOString(),
  })

  const oldData = {
    clockIn: entry.clockIn.toISOString(),
    clockOut: entry.clockOut.toISOString(),
    totalMinutes: entry.totalMinutes,
    projectId: entry.allocations[0]?.projectId ?? null,
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedEntry = await tx.clockEntry.update({
      where: { id },
      data: { clockIn: newClockIn, clockOut: newClockOut, totalMinutes, hash, source: 'edited' },
    })

    // Atualizar TimeAllocation
    if (projectId) {
      await tx.timeAllocation.upsert({
        where: { id: entry.allocations[0]?.id ?? '' },
        update: { projectId, minutes: totalMinutes },
        create: { clockEntryId: id, projectId, minutes: totalMinutes },
      })
    } else {
      await tx.timeAllocation.deleteMany({ where: { clockEntryId: id } })
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'edit_entry',
        entityId: id,
        oldData,
        newData: {
          clockIn: newClockIn.toISOString(),
          clockOut: newClockOut.toISOString(),
          totalMinutes,
          projectId: projectId ?? null,
        },
        userAgent: req.headers.get('user-agent'),
      },
    })

    return updatedEntry
  })

  return NextResponse.json({
    id: updated.id,
    clockIn: updated.clockIn.toISOString(),
    clockOut: updated.clockOut!.toISOString(),
    totalMinutes: updated.totalMinutes,
    source: updated.source,
    projectId: projectId ?? null,
  })
}
```

**Atenção — upsert pelo `id` da allocation:**

O `upsert` acima usa `entry.allocations[0]?.id ?? ''`. Quando o `id` for `''` (allocation não existe), o `where` não vai bater e vai cair no `create`. Mas o Prisma exige que o campo `where` no upsert use um campo único. `TimeAllocation.id` é `@id`, então isso funciona: se o id não existe no banco, cria; se existe, atualiza.

**Step 3: Rodar os testes**

```bash
npm test
```

Expected: 9 passing.

**Step 4: Commit**

```bash
git add src/app/api/clock/[id]/route.ts
git commit -m "feat: add PATCH /api/clock/[id] for audited entry editing"
```

---

## Task 3: Edit dialog + badge visual no HistoricoClient

**Files:**
- Modify: `src/app/historico/historico-client.tsx`

**Step 1: Atualizar a interface `HistoryEntry` para incluir `source`**

Localizar:

```ts
interface HistoryEntry {
  id: string
  clockIn: string
  clockOut: string
  totalMinutes: number | null
  projectName: string | null
  projectColor: string | null
  entryDate: string
}
```

Substituir por:

```ts
interface HistoryEntry {
  id: string
  clockIn: string
  clockOut: string
  totalMinutes: number | null
  projectName: string | null
  projectColor: string | null
  entryDate: string
  source: string
}
```

**Step 2: Adicionar imports necessários**

Localizar a linha de imports do lucide-react:

```ts
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
```

Substituir por:

```ts
import { ChevronLeft, ChevronRight, Trash2, Pencil } from 'lucide-react'
```

Localizar a linha de imports do shadcn/ui que inclui `DialogDescription`:

```ts
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
```

Adicionar logo abaixo dos imports de Dialog os imports de Input e Select:

```ts
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
```

**Step 3: Adicionar interface `EditForm` e estado**

Logo após a interface `HistoryData`, adicionar:

```ts
interface EditForm {
  clockInTime: string   // "HH:MM" BRT
  clockOutTime: string  // "HH:MM" BRT
  projectId: string     // "" = sem projeto
}
```

Dentro de `HistoricoClient`, após a linha `const [deleting, setDeleting] = useState(false)`, adicionar:

```ts
const [editTarget, setEditTarget] = useState<HistoryEntry | null>(null)
const [editForm, setEditForm] = useState<EditForm>({ clockInTime: '', clockOutTime: '', projectId: '' })
const [editSaving, setEditSaving] = useState(false)
const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
```

**Step 4: Carregar projetos junto com o histórico**

Localizar a função `load`:

```ts
const load = useCallback(async (date: Date) => {
  setLoading(true)
  try {
    const res = await fetch(`/api/clock/history?month=${toYYYYMM(date)}`)
    if (!res.ok) throw new Error()
    setData(await res.json())
  } catch {
    toast.error('Erro ao carregar histórico')
  } finally {
    setLoading(false)
  }
}, [])
```

Substituir por:

```ts
const load = useCallback(async (date: Date) => {
  setLoading(true)
  try {
    const [histRes, projRes] = await Promise.all([
      fetch(`/api/clock/history?month=${toYYYYMM(date)}`),
      fetch('/api/projects'),
    ])
    if (!histRes.ok) throw new Error()
    setData(await histRes.json())
    if (projRes.ok) setProjects(await projRes.json())
  } catch {
    toast.error('Erro ao carregar histórico')
  } finally {
    setLoading(false)
  }
}, [])
```

**Step 5: Adicionar função `openEdit` e `handleEdit`**

Logo antes do `return`, adicionar:

```ts
function openEdit(entry: HistoryEntry) {
  setEditForm({
    clockInTime: formatBRT(entry.clockIn),
    clockOutTime: formatBRT(entry.clockOut),
    projectId: entry.projectColor ? (projects.find(p => p.name === entry.projectName)?.id ?? '') : '',
  })
  setEditTarget(entry)
}

async function handleEdit() {
  if (!editTarget) return
  setEditSaving(true)
  try {
    const res = await fetch(`/api/clock/${editTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clockInTime: editForm.clockInTime,
        clockOutTime: editForm.clockOutTime,
        projectId: editForm.projectId || null,
      }),
    })
    if (!res.ok) {
      const d = await res.json()
      toast.error(d.error ?? 'Erro ao salvar')
      return
    }
    const updated = await res.json()
    const proj = projects.find(p => p.id === editForm.projectId)
    setData((d) => {
      if (!d) return null
      return {
        ...d,
        entries: d.entries.map((e) =>
          e.id === editTarget.id
            ? {
                ...e,
                clockIn: updated.clockIn,
                clockOut: updated.clockOut,
                totalMinutes: updated.totalMinutes,
                source: updated.source,
                projectName: proj?.name ?? null,
                projectColor: null, // será recarregado no próximo load
              }
            : e
        ),
      }
    })
    toast.success('Registro atualizado')
    setEditTarget(null)
  } catch {
    toast.error('Erro ao salvar')
  } finally {
    setEditSaving(false)
  }
}
```

**Nota sobre `projectColor` no update otimista:** após salvar, o `projectColor` fica `null` temporariamente no estado local (pois o endpoint PATCH não retorna a cor do projeto). Isso não é um bug — na próxima vez que o usuário navegar de mês, o `load` recarrega os dados corretos com cor. Se a cor sumindo incomodar visualmente, simplesmente re-chamar `load(currentMonth)` após salvar em vez do update otimista.

**Step 6: Adicionar botão de edição na linha de cada entrada**

Localizar o botão de lixeira:

```tsx
<Button
  variant="ghost"
  size="icon"
  className="h-7 w-7 text-muted-foreground hover:text-destructive"
  onClick={() => setDeleteTarget(entry.id)}
>
  <Trash2 className="h-3.5 w-3.5" />
</Button>
```

Adicionar o botão de edição **antes** do botão de lixeira:

```tsx
<Button
  variant="ghost"
  size="icon"
  className="h-7 w-7 text-muted-foreground hover:text-foreground"
  onClick={() => openEdit(entry)}
>
  <Pencil className="h-3.5 w-3.5" />
</Button>
<Button
  variant="ghost"
  size="icon"
  className="h-7 w-7 text-muted-foreground hover:text-destructive"
  onClick={() => setDeleteTarget(entry.id)}
>
  <Trash2 className="h-3.5 w-3.5" />
</Button>
```

**Step 7: Adicionar badge "editado" no nome do projeto**

Localizar o bloco que exibe `entry.projectName`:

```tsx
{entry.projectName && (
  <p className="text-xs text-muted-foreground leading-none mb-0.5">
    {entry.projectName}
  </p>
)}
```

Substituir por:

```tsx
<div className="flex items-center gap-1.5">
  {entry.projectName && (
    <p className="text-xs text-muted-foreground leading-none">
      {entry.projectName}
    </p>
  )}
  {entry.source === 'edited' && (
    <span className="text-xs text-muted-foreground/60 leading-none">
      (editado)
    </span>
  )}
</div>
```

**Step 8: Adicionar o dialog de edição**

Logo antes do dialog de delete existente (`<Dialog open={!!deleteTarget}...`), adicionar:

```tsx
{/* Edit dialog */}
<Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Editar registro</DialogTitle>
      <DialogDescription>
        Os horários devem estar no fuso de Brasília (BRT).
        A alteração ficará registrada no histórico de auditoria.
      </DialogDescription>
    </DialogHeader>
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="edit-in">Entrada</Label>
          <Input
            id="edit-in"
            type="time"
            value={editForm.clockInTime}
            onChange={(e) => setEditForm((f) => ({ ...f, clockInTime: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="edit-out">Saída</Label>
          <Input
            id="edit-out"
            type="time"
            value={editForm.clockOutTime}
            onChange={(e) => setEditForm((f) => ({ ...f, clockOutTime: e.target.value }))}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Projeto</Label>
        <Select
          value={editForm.projectId}
          onValueChange={(v) => setEditForm((f) => ({ ...f, projectId: v === 'none' ? '' : v }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Sem projeto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem projeto</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
      <Button onClick={handleEdit} disabled={editSaving}>
        {editSaving ? 'Salvando...' : 'Salvar'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Step 9: Rodar os testes**

```bash
npm test
```

Expected: 9 passing.

**Step 10: Commit**

```bash
git add src/app/historico/historico-client.tsx
git commit -m "feat: add audited entry editing with edit badge in historico"
```

---

## Verification Checklist

Após todas as tasks:

1. `npm test` — 9 passing
2. Abrir `/historico` → cada entrada tem ícone de lápis ao lado da lixeira
3. Clicar no lápis → dialog abre com horários preenchidos corretamente em BRT
4. Alterar horário → salvar → entrada atualizada na tela com `(editado)` ao lado do projeto
5. Tentar salvar com saída antes da entrada → toast de erro
6. No Supabase Studio (ou `npx prisma studio`): verificar `audit_log` com `action: "edit_entry"`, `old_data` e `new_data` preenchidos
7. Verificar que o campo `hash` do `clock_entry` foi recalculado com os novos valores
8. Verificar que o campo `source` do `clock_entry` é `"edited"`
