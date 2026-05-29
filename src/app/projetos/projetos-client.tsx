'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Pencil, Archive, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSupabaseQuery } from '@/hooks/use-supabase-query'
import { createClient } from '@/lib/supabase/client'
import { fetchProjects } from '@/lib/client-data'
import ProjetosLoading from './loading'
import type { ProjectOption } from '@/types'

const PRESET_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#f43f5e',
  '#3b82f6', '#8b5cf6', '#06b6d4', '#84cc16',
]

interface ProjectForm {
  name: string
  clientName: string
  hourlyRate: string
  color: string
}

const emptyForm: ProjectForm = { name: '', clientName: '', hourlyRate: '', color: '#6366f1' }
const HEX_RE = /^#[0-9a-fA-F]{6}$/

function normalizeProject(project: ProjectOption & { hourlyRate?: unknown }): ProjectOption {
  return {
    id: project.id,
    name: project.name,
    clientName: project.clientName ?? null,
    color: project.color,
    hourlyRate: project.hourlyRate == null ? null : Number(project.hourlyRate),
    isActive: project.isActive,
  }
}

function sortProjects(projects: ProjectOption[]): ProjectOption[] {
  return [...projects].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
    return a.name.localeCompare(b.name, 'pt-BR')
  })
}

function upsertProject(projects: ProjectOption[], project: ProjectOption): ProjectOption[] {
  const exists = projects.some((current) => current.id === project.id)
  const next = exists
    ? projects.map((current) => current.id === project.id ? project : current)
    : [...projects, project]
  return sortProjects(next)
}

export function ProjetosClient() {
  const supabase = useMemo(() => createClient(), [])
  const query = useSupabaseQuery('projetos:all', () => fetchProjects(supabase, { activeOnly: false }))
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const seededRef = useRef(false)

  useEffect(() => {
    if (!seededRef.current && !query.loading) {
      seededRef.current = true
      setProjects(query.data ?? [])
    }
  }, [query.loading, query.data])
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProjectForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProjectOption | null>(null)
  const [deleting, setDeleting] = useState(false)

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setOpen(true)
  }

  function openEdit(project: ProjectOption) {
    setEditingId(project.id)
    setForm({
      name: project.name,
      clientName: project.clientName ?? '',
      hourlyRate: project.hourlyRate?.toString() ?? '',
      color: project.color,
    })
    setOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('Nome é obrigatório')
      return
    }
    if (form.hourlyRate) {
      const rate = Number(form.hourlyRate)
      if (!Number.isFinite(rate) || rate < 0) {
        toast.error('Valor por hora inválido')
        return
      }
    }
    if (!HEX_RE.test(form.color)) {
      toast.error('Cor inválida')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...(editingId ? { id: editingId } : {}),
        name: form.name.trim(),
        clientName: form.clientName.trim() || null,
        hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : null,
        color: form.color,
      }
      const res = await fetch('/api/projects', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Erro ao salvar projeto')
      }
      const saved = normalizeProject(await res.json())
      setProjects((current) => upsertProject(current, saved))
      query.refetch()
      toast.success(editingId ? 'Projeto atualizado' : 'Projeto criado')
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar projeto')
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive(project: ProjectOption) {
    try {
      const res = await fetch('/api/projects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: project.id, isActive: !project.isActive }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Erro ao arquivar projeto')
      }
      const updated = normalizeProject(await res.json())
      setProjects((current) => upsertProject(current, updated))
      query.refetch()
      toast.success(project.isActive ? 'Projeto arquivado' : 'Projeto reativado')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao arquivar projeto')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/projects/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Erro ao apagar projeto')
        return
      }
      const data = res.status === 204 ? null : await res.json().catch(() => null)
      toast.success(data?.archivedInsteadOfDeleted ? 'Projeto arquivado' : 'Projeto apagado')
      setProjects((current) => {
        if (data?.archivedInsteadOfDeleted) {
          return upsertProject(current, normalizeProject(data))
        }
        return current.filter((project) => project.id !== deleteTarget.id)
      })
      query.refetch()
    } catch {
      toast.error('Erro ao apagar projeto')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  if (!seededRef.current) return <ProjetosLoading />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projetos</h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Novo projeto
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhum projeto cadastrado ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {projects.map(project => (
            <Card key={project.id} className={!project.isActive ? 'opacity-60' : ''}>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: project.color }}
                    />
                    <div>
                      <CardTitle className="text-base">{project.name}</CardTitle>
                      {project.clientName && (
                        <p className="text-sm text-muted-foreground">{project.clientName}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {project.hourlyRate && (
                      <Badge variant="outline" className="text-xs">
                        R$ {Number(project.hourlyRate).toFixed(2)}/h
                      </Badge>
                    )}
                    {!project.isActive && (
                      <Badge variant="secondary" className="text-xs">Arquivado</Badge>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => openEdit(project)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleArchive(project)}>
                      {project.isActive ? (
                        <Archive className="h-4 w-4" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(project)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar projeto?</DialogTitle>
            <DialogDescription>
              O projeto <strong>{deleteTarget?.name}</strong> será apagado se não tiver registros.
              Se já tiver horas lançadas, ele será arquivado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Apagando...' : 'Apagar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar projeto' : 'Novo projeto'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="name">Nome do projeto *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Residência Silva"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="client">Cliente</Label>
              <Input
                id="client"
                value={form.clientName}
                onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
                placeholder="Ex: Família Silva"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rate">Valor por hora (R$)</Label>
              <Input
                id="rate"
                type="number"
                step="0.01"
                value={form.hourlyRate}
                onChange={e => setForm(f => ({ ...f, hourlyRate: e.target.value }))}
                placeholder="Ex: 150.00"
              />
            </div>
            <div className="space-y-1">
              <Label>Cor</Label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${
                      form.color === c ? 'border-foreground scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setForm(f => ({ ...f, color: c }))}
                    type="button"
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
