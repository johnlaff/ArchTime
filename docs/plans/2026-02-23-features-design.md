# Features Design: Toast, Ícone, Accent Color, Breaks

**Data:** 2026-02-23
**Status:** Aprovado

---

## Requisito transversal: performance e fluidez

Todas as features devem ser **instantâneas** do ponto de vista do usuário. Regras:
- Nenhuma ação de UI espera uma resposta de rede para atualizar a tela (optimistic updates)
- Transições e animações: 150–300ms, `cubic-bezier(0.16, 1, 0.3, 1)` (ease out spring)
- Animações adicionadas onde reforçam o feedback (aparecer/desaparecer de botões, troca de cor, estado de pausa)
- Sem layout shifts visíveis

---

## Feature 1: Toast — posição + botão de fechar

**Mudança:** `providers.tsx` — `<Toaster>` recebe `position="bottom-center"` e `closeButton`.

Motivo: atualmente `top-center` tapa a navbar sticky. `bottom-center` é o padrão de mercado para apps mobile-first (iOS, Android, PWA).

---

## Feature 2: Ícone do app dinâmico

### Estratégia

Rota dinâmica Next.js que gera PNG via `ImageResponse` (`@vercel/og`):
- `GET /api/icon?size=192` → PNG 192×192
- `GET /api/icon?size=512` → PNG 512×512

`manifest.json` aponta para essas rotas. O servidor lê o cookie `archtime-accent-color` para determinar a cor de fundo — quem instala o PWA recebe o ícone com a accent color que escolheu. Após instalado, o ícone fica estático (limitação de todos os browsers/PWAs).

### Design do ícone

- Fundo quadrado arredondado na accent color (sem gradiente — flat e limpo)
- Símbolo: **ponteiros analógicos estilizados** na posição 10:10 formando implicitamente a letra "A" (hastes = ponteiros, travessa = barra do A)
- Branco sobre accent color — contraste máximo
- Desenhado em SVG inline no `ImageResponse`, sem fontes externas
- Funciona como maskable icon (símbolo centrado na safe zone de 80%)

### Cookie

`archtime-accent-color` — definido client-side via `document.cookie` junto com o `localStorage` ao trocar cor. Lido pelo route handler para gerar o ícone correto.

---

## Feature 3: Accent Color (12 cores)

### Armazenamento

- `localStorage`: chave `archtime-accent` — valor é o nome do tema (ex: `"teal"`)
- Cookie HTTP: `archtime-accent-color` — valor hex da cor (ex: `"#14b8a6"`) — lido pelo ícone dinâmico

Ambos atualizados simultaneamente ao trocar cor.

### Aplicação CSS

Atributo `data-accent="<nome>"` no elemento `<html>`, gerenciado por um hook `useAccentColor`. O `globals.css` define os CSS vars de cada accent:

```css
[data-accent="teal"] {
  --primary: oklch(0.60 0.15 183);
  --primary-foreground: oklch(0.98 0 0);
  --ring: oklch(0.60 0.15 183);
}
.dark [data-accent="teal"],
[data-accent="teal"].dark {
  --primary: oklch(0.72 0.14 183);
  --primary-foreground: oklch(0.15 0 0);
  --ring: oklch(0.72 0.14 183);
}
```

Isso garante que dark/light mode continuam funcionando corretamente com cada accent.

### As 12 cores (calibradas WCAG AA)

| Key | Nome | Hue |
|---|---|---|
| `indigo` | Índigo | 277° — padrão |
| `violet` | Violeta | 300° |
| `lavender` | Lavanda | 285° |
| `fuchsia` | Fúcsia | 330° |
| `rose` | Rosa | 350° |
| `ruby` | Rubi | 15° |
| `coral` | Coral | 25° |
| `amber` | Âmbar | 70° |
| `emerald` | Esmeralda | 155° |
| `teal` | Verde-água | 183° |
| `cyan` | Ciano | 200° |
| `blue` | Azul | 255° |

### UI do seletor

Ícone de paleta na navbar, abre **Popover** com grade 4×3 de bolinhas de 28px (mesmo padrão de `PRESET_COLORS` da página de Projetos). Clique → cor muda instantaneamente (sem delay de rede). Bolinha ativa tem borda `ring` e `scale-110`.

**Animação:** fade-in do popover (150ms). Transição de cor via `transition-colors 200ms ease` já existente no globals.css.

### Persistência no SSR / hidratação

O `AccentColorProvider` (client component) lê `localStorage` no mount e define o `data-accent` no `<html>`. Para evitar flash, um script inline no `<head>` (antes do React hidratar) lê o localStorage e seta o atributo imediatamente — mesmo padrão que o `next-themes` usa para dark mode.

---

## Feature 4: Intervalos/Pausas

### Schema

```prisma
model Break {
  id           String     @id @default(uuid())
  clockEntryId String     @map("clock_entry_id")
  startTime    DateTime   @map("start_time") @db.Timestamptz
  endTime      DateTime?  @map("end_time") @db.Timestamptz
  clockEntry   ClockEntry @relation(fields: [clockEntryId], references: [id], onDelete: Cascade)

  @@map("breaks")
}
```

Adicionar `breaks Break[]` em `ClockEntry`.

### Cálculo de totalMinutes

No clock-out:
```
totalMinutes = floor((clockOut − clockIn) / 60000) − Σ floor((b.endTime − b.startTime) / 60000)
```
Breaks sem `endTime` (pausa ativa) são ignorados no cálculo — nunca se encerra um dia em pausa.

### API

| Método | Rota | Ação |
|---|---|---|
| `POST` | `/api/clock/[id]/break` | Inicia pausa → cria Break com `startTime = now()` |
| `PUT` | `/api/clock/[id]/break/[breakId]` | Encerra pausa → define `endTime = now()` |

Ambos: autenticação, validação (não pode pausar se já pausado, não pode retomar se não pausado), AuditLog.

### Máquina de estados

```
STOPPED → clockIn → ACTIVE → pausar → PAUSED → retomar → ACTIVE (repetível)
                                                              ↓ clockOut
                                                           STOPPED
```

Regra: clock-out bloqueado enquanto `PAUSED` (deve retomar primeiro).

### Tipos TypeScript

```typescript
interface ActiveSession {
  id: string
  clockIn: string
  projectId: string | null
  projectName: string | null
  projectColor: string | null
  isPaused: boolean          // novo
  activeBreakId: string | null  // novo
  totalBreakMinutes: number  // novo — acumulado de pausas já encerradas
}
```

### UI — Dashboard

**Estado ACTIVE:** Abaixo do `CurrentSession`, aparece um botão secundário "Pausar" (ícone `PauseIcon`, `variant="outline"`, tamanho menor). Animação: `animate-fade-in-up` ao aparecer.

**Estado PAUSED:**
- `CurrentSession` exibe "Em pausa" com `animate-pulse` discreto (opacidade, não movimento)
- Badge accent: "⏸ 12 min em pausa" (tempo acumulado da pausa atual + anteriores)
- Botão principal "Bater Ponto" fica `disabled`
- Botão "Pausar" vira "Retomar" (ícone `PlayIcon`, cor accent)

**Transição ACTIVE↔PAUSED:** 150ms fade nos elementos que mudam.

### Histórico

Entradas com breaks mostram ícone `PauseCircle` discreto. O `totalMinutes` exibido já é líquido (descontadas pausas). Sem necessidade de expandir detalhes por ora — simplicidade primeiro.

### Offline

Dois novos tipos na fila IndexedDB:
- `clock_break_start` — `{ entryId, timestamp }`
- `clock_break_end` — `{ entryId, breakId, timestamp }`

`SyncProvider` processa esses tipos ao reconectar, em ordem cronológica (já garantido pela lógica existente).

---

## Resumo de arquivos afetados

| Arquivo | Mudança |
|---|---|
| `src/components/providers.tsx` | Toast: `bottom-center` + `closeButton` |
| `src/app/api/icon/route.ts` | **novo** — gera PNG dinâmico com ImageResponse |
| `public/manifest.json` | Aponta icons para `/api/icon?size=N` |
| `src/app/globals.css` | Adiciona 12 blocos `[data-accent]` com CSS vars |
| `src/hooks/use-accent-color.ts` | **novo** — hook que lê/escreve localStorage + cookie + data-accent |
| `src/components/accent-color-provider.tsx` | **novo** — script inline anti-flash + provider |
| `src/components/navbar.tsx` | Adiciona ícone paleta + Popover com grade de cores |
| `src/app/layout.tsx` | Adiciona AccentColorProvider + script inline |
| `prisma/schema.prisma` | Adiciona model `Break` + relação em `ClockEntry` |
| `src/app/api/clock/[id]/break/route.ts` | **novo** — POST iniciar + (futuro) PUT encerrar |
| `src/app/api/clock/[id]/break/[breakId]/route.ts` | **novo** — PUT encerrar pausa |
| `src/types/index.ts` | Atualiza `ActiveSession` com campos de break |
| `src/hooks/use-clock.ts` | Adiciona `pauseBreak()` / `resumeBreak()` |
| `src/components/current-session.tsx` | Estado "Em pausa" + badge acumulado |
| `src/app/dashboard/dashboard-client.tsx` | Botão "Pausar"/"Retomar" |
| `src/lib/offline-queue.ts` | Adiciona tipos `clock_break_start/end` |
| `src/app/api/sync/route.ts` | Processa breaks na sincronização offline |
