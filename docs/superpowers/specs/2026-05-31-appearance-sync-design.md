# Design — Sincronizar preferências de aparência entre dispositivos (2026-05-31)

## Objetivo

Fazer o **preset arquitetônico**, a **densidade** e a **cor de destaque personalizada (hex)**
sincronizarem entre dispositivos do mesmo usuário, como a cor de destaque (preset) e o
tema claro/escuro já sincronizam hoje. Fazer isso **consolidando** a persistência de aparência
numa fonte única (sem espalhá-la mais), para que incluir novos prefs sincronizados no futuro
seja trivial.

### Critérios de sucesso
- Mudar preset arquitetônico / densidade / cor custom num device reflete em outro device **no próximo load** (com a janela de graça de 10s protegendo uma mudança local recente).
- **Zero regressão** na sincronização já existente de accent e tema (provado por teste de round-trip).
- Arquitetura: lógica pura e testável em `appearance.ts`; o provider só orquestra; callers não persistem em paralelo.

## Estado atual (auditoria)

Três camadas de persistência de aparência: **localStorage** (chaves `archtime-accent`, `theme`,
`archtime-preset`, `archtime-density`, `archtime-accent-custom`, `archtime-preferences-updated-at`),
**DB** (`user_settings`) e o **`AccentColorProvider`** (estado React + atributos `data-*` no `<html>`).

O que **já sincroniza** (DB + hidratação): `accent_preset` (preset), `theme_mode`.
O que **NÃO sincroniza** (só localStorage, por dispositivo):
1. **Preset arquitetônico** (`archtime-preset`) — a queixa do usuário (cor da logo).
2. **Densidade** (`archtime-density`).
3. **Cor custom (hex)** — o DB guarda `accent_preset` mas, ao escolher cor custom, nada é persistido
   (o `accent='custom'` nem o hex), então em outro device vira indigo padrão.

Smell que a feature precisa corrigir (não por estética — a feature **força** isso): a persistência
está **dividida** — os callers (`configuracoes`, `navbar`) chamam `persistAppearanceSettings` para
accent; o provider só grava localStorage para preset/densidade/custom. Como `setAccent` precisa passar
a persistir `preset=null` (acoplamento — senão o preset sincronizado vence na outra tela e a troca de
accent parece ignorada) e `setCustomColor` precisa persistir `accent='custom' + hex`, o provider
inevitavelmente passa a persistir estado acoplado ao accent. Deixar a persistência do *próprio* accent
nos callers seria o split confuso.

## Estado da arte / padrão de mercado 2026 (decisão consciente, sem over-engineering)

Para um conjunto **fixo** de preferências e **2 usuários**, o padrão de mercado é exatamente o que
adotamos aqui — descrito para registro:
- **Schema tipado como fonte única** (colunas tipadas em `user_settings`, não uma tabela genérica key-value).
- **Aplicação local otimista + persist fire-and-forget no servidor** (feedback instantâneo; o servidor é eventual).
- **Last-write-wins** com a **janela de 10s** de "mudança local recente" já existente (`shouldApplyRemotePreferences`) — **reusada**, sem inventar timestamp por campo.
- **Hidratação server-driven** no load.

**Deliberadamente NÃO fazemos (YAGNI):** Supabase Realtime (sync ao vivo entre devices), CRDTs,
tabela genérica de preferências key-value, e **SSR de preferências** (leria prefs no servidor e injetaria
no HTML — reintroduziria layout dinâmico e desfaria o shell estático recém-entregue). Colunas tipadas +
LWW-no-load é o padrão correto; o over-engineering seria o anti-pattern.

## Arquitetura (consolidação delimitada)

**`src/lib/appearance.ts` — funções puras, testáveis (sem React/DOM):**
- (de)serialização do patch de aparência (incl. os novos campos);
- resolução de conflito: `shouldApplyRemotePreferences` (já existe) — reusada;
- `persistAppearanceSettings(patch)` (já existe) — `AppearancePatch` estendido com `architecturalPreset`, `density`, `customAccentColor`.

**`src/components/accent-color-provider.tsx` — orquestração (estado + DOM + localStorage + chamar `appearance.ts`):**
torna-se a **fonte única** de persistência de accent / custom / preset / densidade (local **e** remoto).
Não engordar o provider — a lógica pura mora em `appearance.ts`; o provider chama.

**Callers param de persistir em paralelo:** `configuracoes` (`setAccentPreset` wrapper) e `navbar`
(`handleAccentChange`) deixam de chamar `persistAppearanceSettings` para accent — só chamam os setters
do provider, que persistem. (`configuracoes` continua persistindo `themeMode` — tema é do `next-themes`, **intocado**.)

**Limites (não ultrapassar "deixar excelente"):** não tocar no tema (next-themes); não reescrever a lógica
de acoplamento accent/preset/custom que já funciona; não reescrever o script anti-flash; a consolidação é
apenas: lógica pura em `appearance.ts` + provider orquestra + callers param de persistir em paralelo.

**Extensibilidade (objetivo explícito):** adicionar um novo pref sincronizado depois = 1 campo no schema
tipado + 1 setter no provider; persistência/hidratação fluem automaticamente.

## Mudanças por área

### 1. Schema (`prisma/schema.prisma` + `npx prisma db push`)
Adicionar ao model `UserSettings` (mapeando snake_case):
```prisma
architecturalPreset String?  @map("architectural_preset")
density             String   @default("cozy")
customAccentColor   String?  @map("custom_accent_color")
```
Colunas **aditivas** (nullable / com default) → backward-compatible: o código atual ignora; seguro
aplicar na base antes do código novo. Aplicar com `npx prisma db push` (usa `DIRECT_URL` do `.env.local`),
seguido de `npx prisma generate`. Há um único projeto Supabase (sem staging) — a migração aditiva é segura.

### 2. Serialização (`src/lib/user-settings.ts`)
- `SerializedUserSettings` e `SettingsPatch` ganham `architecturalPreset: ArchitecturalPreset | null`,
  `density: DensityPreset`, `customAccentColor: string | null`.
- **Cor custom:** `accentPreset` passa a aceitar o literal `'custom'` (espelha `archtime-accent='custom'`
  do localStorage), com o hex em `customAccentColor`. O tipo `accentPreset` alarga para `AccentPreset | 'custom'`.
- `serialize` aplica defaults seguros (preset → null se inválido; density → 'cozy' se inválido; custom color
  validada por `normalizeHexColor`, senão null).
- `parseSettingsPatch` valida cada campo (`isArchitecturalPreset`, `isDensityPreset`, `normalizeHexColor`,
  e aceita `'custom'` para accent).
- `updateUserSettings` grava os novos campos (mesmo padrão condicional dos atuais).

### 3. Persistência (consolidada no provider)
`persistAppearanceSettings` aceita o patch estendido. Os setters do provider persistem (fire-and-forget):
- `setArchitecturalPreset(p)` → `persist({ architecturalPreset: p })`
- `setDensity(d)` → `persist({ density: d })`
- `setAccent(a)` → `persist({ accentPreset: a, architecturalPreset: null })` (consolida o accent; callers param)
- `setCustomColor(hex)` → `persist({ accentPreset: 'custom', customAccentColor: hex, architecturalPreset: null })`

### 4. Hidratação (`src/components/providers.tsx` `PreferencesHydrator` + provider)
No load, após o `fetch('/api/settings')`, se `shouldApplyRemotePreferences(startedAt, lastLocalChange)`
(janela de graça — não sobrescreve mudança local recente), aplica os campos remotos:
- accent + tema (já existe);
- **novos:** preset, densidade, cor custom → via um `syncAppearanceFromRemote(patch)` no provider
  (análogo ao `syncAccentFromRemote`): atualiza estado + atributos `data-*` + localStorage **sem** marcar
  mudança local. Para `accentPreset === 'custom'`, aplica a cor custom a partir de `customAccentColor`.

**Escopo da graça (explícito):** a graça usa o **único timestamp global** `archtime-preferences-updated-at`
(`getLastLocalPreferenceChange`) — qualquer mudança local de aparência nos últimos 10s bloqueia a aplicação
remota de **todos** os campos (sem timestamp por campo). O guard adicional `hasLocalCustomAccentPreference`
permanece **só para accent** (não overwrite de accent custom local); preset/densidade/cor-custom usam apenas
a janela de graça global.

### 5. Acoplamento accent ↔ preset ↔ custom
Mantido como já é (escolher accent limpa preset+custom; escolher preset sobrepõe a cor; cor custom limpa preset).
A persistência respeita isso (ex.: `setAccent` persiste `architecturalPreset=null`).

## Decisão consciente — flash em device novo
Device novo não tem localStorage → o script anti-flash (inline em `layout.tsx`) pinta o default; a hidratação
troca para o valor sincronizado → **um flash único no primeiro load de um device novo**. Depois disso o device
tem localStorage e não há flash. **Aceitamos esse flash** e documentamos — a alternativa (SSR de prefs)
reintroduziria layout dinâmico e desfaria o shell estático. O script anti-flash **não muda** (já lê preset/
densidade/custom do localStorage).

## Gate inegociável — teste de regressão de accent + tema
Estamos editando a persistência de accent (funciona em produção agora). Como parte desta feature, escrever um
**teste de round-trip (persist → hidratar em 2º contexto) para accent E tema**, provando que continuam
sincronizando após a consolidação. **Se não passar, cai para a abordagem aditiva** (persistência nova só para
os 3 campos, sem mover a do accent). Tangle que funciona > limpeza que regride.

## Entrega incremental
1. **Preset + densidade** — colunas limpas + consolidação da persistência do accent (`setAccent` persiste
   `preset=null`; callers param) + hidratação + **teste de round-trip de accent/tema** + teste de sync de preset/densidade.
2. **Cor custom** — `accentPreset='custom'` (alargamento de tipo) + `customAccentColor` (hex) + hidratação
   custom-aware + teste de sync da cor custom.

"Escopo completo" não significa um commit só — cada incremento é verificável isoladamente.

## Plano de verificação
- `npm test` — testes atuais verdes + novos (round-trip accent/tema; sync de preset/densidade/custom). `npx tsc --noEmit` limpo.
- Build de produção local OK.
- Migração aplicada (colunas existem); `prisma generate` rodado.
- Preview (Deploy Preview da Netlify): simular **2 dispositivos** (duas janelas anônimas / dois contextos):
  setar preset/densidade/cor custom num e confirmar que aparece no outro **após reload** (com o flash único
  documentado no device novo); confirmar que **accent e tema continuam sincronizando** (sem regressão); confirmar
  o acoplamento (setar accent num device limpa o preset no outro).
- Confirmar build do preview sem erro.

## Fora de escopo
- Supabase Realtime / sync ao vivo; CRDTs; tabela genérica key-value; SSR de preferências (desfaria o shell estático).
- Mover a persistência de tema para o provider (tema é do next-themes — intocado).
- Reescrever o script anti-flash ou a lógica de acoplamento existente.

## Rollout
Branch `feat/appearance-sync`. Migração aditiva aplicada com `prisma db push`. Incrementos verificados (testes +
preview). Um PR; merge após aprovação. Sem auto-merge.
