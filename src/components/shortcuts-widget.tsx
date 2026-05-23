'use client'

import { useIsMac } from '@/hooks/use-is-mac'

export function ShortcutsWidget() {
  const isMac = useIsMac()
  const items = [
    { desc: 'Ponto',         key: 'P' },
    { desc: 'Histórico',     key: 'H' },
    { desc: 'Projetos',      key: 'J' },
    { desc: 'Configurações', key: 'C' },
    { desc: 'Alternar Tema', key: isMac ? '⌘⇧T' : 'T' },
  ]
  return (
    <div className="flex flex-col gap-1.5">
      {items.map(({ desc, key }) => (
        <div key={desc} className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{desc}</span>
          <kbd className="font-mono bg-muted border border-border rounded px-1.5 py-px text-[10px]">
            {key}
          </kbd>
        </div>
      ))}
    </div>
  )
}
