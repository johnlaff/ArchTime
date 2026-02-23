'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Archive, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

export default function ProjetosPage() {
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProjectForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  async function loadProjects() {
    setLoading(true)
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      setProjects(data)
    } catch {
      toast.error('Erro ao carregar projetos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadProjects() }, [])

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
    setSaving(true)
    try {
      const payload = {
        ...(editingId ? { id: editingId } : {}),
        name: form.name,
        clientName: form.clientName || null,
        hourlyRate: form.hourlyRate ? parseFloat(form.hourlyRate) : null,
        color: form.color,
      }
      const res = await fetch('/api/projects', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()
      toast.success(editingId ? 'Projeto atualizado' : 'Projeto criado')
      setOpen(false)
      loadProjects()
    } catch {
      toast.error('Erro ao salvar projeto')
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive(project: ProjectOption) {
    try {
      await fetch('/api/projects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: project.id, isActive: !project.isActive }),
      })
      toast.success(project.isActive ? 'Projeto arquivado' : 'Projeto reativado')
      loadProjects()
    } catch {
      toast.error('Erro ao arquivar projeto')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projetos</h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Novo projeto
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : projects.length === 0 ? (
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
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

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
