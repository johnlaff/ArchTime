import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { isAllowedEmail } from '@/lib/auth'

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user || !isAllowedEmail(user.email)) return null
  return user
}

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  })

  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, clientName, hourlyRate, color } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
  }

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      name: name.trim(),
      clientName: clientName?.trim() || null,
      hourlyRate: hourlyRate || null,
      color: color || '#6366f1',
    },
  })

  return NextResponse.json(project, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, name, clientName, hourlyRate, color, isActive } = body

  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
  })
  if (!project) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const updated = await prisma.project.update({
    where: { id },
    data: {
      name: name?.trim() ?? project.name,
      clientName: clientName?.trim() ?? project.clientName,
      hourlyRate: hourlyRate ?? project.hourlyRate,
      color: color ?? project.color,
      isActive: isActive ?? project.isActive,
    },
  })

  return NextResponse.json(updated)
}
