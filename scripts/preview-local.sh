#!/usr/bin/env bash
# Preview local do branch atual: builda a imagem de container e sobe em http://localhost:PORT.
# Fiel à produção (mesma imagem do Dockerfile), custo zero. Ver docs/plans/2026-07-09-preview-deploys.md.
#
# Detalhe não-óbvio: NEXT_PUBLIC_* são inlinados no bundle client em BUILD time (build-args);
# os segredos de runtime (DATABASE_URL etc.) entram via --env-file na hora de rodar.
set -euo pipefail

PORT="${PORT:-8080}"
TAG="archtime:preview"
ENV_FILE=".env.local"

cd "$(dirname "$0")/.."

if [ ! -f "$ENV_FILE" ]; then
  echo "erro: $ENV_FILE não encontrado (copie de .env.local.example e preencha)" >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "erro: docker não encontrado (no WSL2, ative a integração no Docker Desktop)" >&2
  exit 1
fi

getenv() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }

APP_URL="http://localhost:${PORT}"

echo "→ Buildando imagem de preview (NEXT_PUBLIC_APP_URL=${APP_URL})..."
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$(getenv NEXT_PUBLIC_SUPABASE_URL)" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$(getenv NEXT_PUBLIC_SUPABASE_ANON_KEY)" \
  --build-arg NEXT_PUBLIC_APP_URL="$APP_URL" \
  -t "$TAG" .

echo "→ Subindo em ${APP_URL} (Ctrl+C para parar)..."
exec docker run --rm -p "${PORT}:8080" \
  --env-file "$ENV_FILE" \
  -e NEXT_PUBLIC_APP_URL="$APP_URL" \
  "$TAG"
