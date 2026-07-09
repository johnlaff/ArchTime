# syntax=docker/dockerfile:1
#
# Imagem de deploy do ArchTime para Azure App Service (container, região Brazil South).
# A Netlify NÃO usa este arquivo — o build de produção lá segue inalterado. O output
# `standalone` só é ligado aqui via BUILD_STANDALONE=true (o build da Netlify não seta
# essa var), então a produção atual não sofre regressão.

FROM node:22-bookworm-slim AS base
# NODE_ENV NÃO é setado aqui de propósito: `deps` herda de `base`, e `npm ci` com
# NODE_ENV=production omite devDependencies (prisma CLI, typescript, tailwind) — o
# builder precisa delas. NODE_ENV=production fica só no `runner`, como no Dockerfile
# de referência do Next.js.
ENV NEXT_TELEMETRY_DISABLED=1

# --- deps: instala dependências com o lockfile ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- builder: gera o Prisma client e faz o build standalone ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* são valores PÚBLICOS inlinados no bundle client em build time.
# Os segredos de runtime (DATABASE_URL, ENTRY_HASH_SECRET, SERVICE_ROLE_KEY) NÃO
# entram na imagem — são injetados como env no App Service.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    BUILD_STANDALONE=true
RUN npx prisma generate && npm run build

# --- runner: imagem mínima que só roda o server standalone ---
FROM base AS runner
WORKDIR /app
# App Service for Containers roteia para a porta em WEBSITES_PORT (setamos 8080).
ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
# `output: standalone` NÃO copia public/ nem .next/static automaticamente — copiamos à mão.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
