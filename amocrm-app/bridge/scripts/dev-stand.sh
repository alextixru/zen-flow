#!/usr/bin/env bash
# Идемпотентный подъём EE-дев-стенда форка для amoCRM-embedding.
# Состав: внешний Postgres (AP_POSTGRES_URL из bridge/.env) + API :8080 (prod-режим,
# отдаёт фронт из dist/packages/web) + worker :8082 (AP_DEV_PIECES=amocrm)
# + path-роутер :8090 (/bridge/* -> мост :8083, остальное -> форк :8080)
# + SSH-туннель `ssh -N -R 172.17.0.1:9090:localhost:8090 ai` -> Traefik ->
# стабильный https://amoai-dev.dzen.team (TLS готов, URL постоянный).
# cloudflared в этом окружении ЗАБЛОКИРОВАН — только ssh.
# Живо всё -> exit 0. Иначе поднимается только недостающее.
# Секретов в теле нет: env приходит из bridge/.env и scripts/ce-preview.env.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$BRIDGE_DIR/../.." && pwd)"
ENV_FILE="$BRIDGE_DIR/.env"
API_LOG=/tmp/dzenflow-api.log
WORKER_LOG=/tmp/dzenflow-worker.log
ROUTER_LOG=/tmp/dzenflow-router.log
TUNNEL_LOG=/tmp/dzenflow-tunnel.log
EMBED_JS="$REPO_ROOT/dist/packages/web/embed/0.13.0.js"

FORK_URL="https://amoai-dev.dzen.team"
ROUTER_PORT=8090
REMOTE_BIND="172.17.0.1:9090"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ОШИБКА: $ENV_FILE не найден (нужен AP_POSTGRES_URL; образец — env.example)" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${AP_POSTGRES_URL:-}" ]]; then
  echo "ОШИБКА: AP_POSTGRES_URL пуст в bridge/.env" >&2
  exit 1
fi

api_alive() { curl -sf -m 5 http://localhost:8080/api/v1/flags >/dev/null 2>&1; }
router_alive() { curl -sf -m 5 "http://localhost:$ROUTER_PORT/api/v1/flags" >/dev/null 2>&1; }
# Маркер роутера, не /api/v1/flags: осиротевший ssh, форвардящий прямо на форк,
# тоже отдаёт 200 на любой путь (SPA) — туннель обязан идти через роутер.
tunnel_alive() { [[ "$(curl -sf -m 20 "$FORK_URL/__router-health" 2>/dev/null)" == "router-ok" ]]; }

if api_alive && router_alive && tunnel_alive; then
  echo "Стенд жив: $FORK_URL"
  exit 0
fi

# Embed-SDK как статика фронта: официальный файл живёт на cdn.activepieces.com,
# self-hosted API его не раздаёт — кладём собранный UMD-бандл в dist/packages/web
# (папка вне git), fastify-static отдаст его по /embed/0.13.0.js.
if [[ ! -f "$EMBED_JS" ]]; then
  echo "Собираю embed-sdk..."
  (cd "$REPO_ROOT/packages/ee/embed-sdk" && NODE_ENV=production npx webpack --config webpack.config.js >/dev/null)
  mkdir -p "$(dirname "$EMBED_JS")"
  cp "$REPO_ROOT/dist/packages/ee/embed-sdk/bundled.js" "$EMBED_JS"
fi

if ! api_alive; then
  echo "Поднимаю API + worker..."
  pkill -f 'server/api/dist/src/bootstrap.js' 2>/dev/null || true
  pkill -f 'server/worker/dist/src/bootstrap.js' 2>/dev/null || true
  sleep 2

  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/scripts/ce-preview.env"
  set +a
  export AP_EDITION=ee
  # ee+prod отвергает UNSANDBOXED из ce-preview.env; CODE_ONLY не требует isolate/докера
  export AP_EXECUTION_MODE=SANDBOX_CODE_ONLY
  export AP_DB_TYPE=POSTGRES
  export AP_POSTGRES_URL
  export AP_DEV_PIECES=amocrm
  export AP_FRONTEND_URL="$FORK_URL"
  AP_WORKER_TOKEN="$(cd "$REPO_ROOT" && node -e "
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
console.log(jwt.sign({ id: randomUUID(), type: 'WORKER' }, process.env.AP_JWT_SECRET,
  { expiresIn: '100y', keyid: '1', algorithm: 'HS256', issuer: 'activepieces' }));
")"
  export AP_WORKER_TOKEN

  (cd "$REPO_ROOT" && nohup node --enable-source-maps packages/server/api/dist/src/bootstrap.js >"$API_LOG" 2>&1 &)
  for _ in $(seq 1 90); do
    api_alive && break
    sleep 1
  done
  if ! api_alive; then
    echo "ОШИБКА: API не поднялся за 90с (лог: $API_LOG)" >&2
    exit 1
  fi
  echo "API жив на :8080"

  (cd "$REPO_ROOT" && AP_CONTAINER_TYPE=WORKER AP_PORT=8082 AP_FRONTEND_URL=http://localhost:8080 \
    nohup node --enable-source-maps packages/server/worker/dist/src/bootstrap.js >"$WORKER_LOG" 2>&1 &)
  sleep 5
  if ! pgrep -f 'server/worker/dist/src/bootstrap.js' >/dev/null; then
    echo "ОШИБКА: worker умер сразу после старта (лог: $WORKER_LOG)" >&2
    exit 1
  fi
  echo "Worker жив на :8082"
fi

if ! router_alive; then
  echo "Поднимаю path-роутер..."
  pkill -f 'scripts/path-router.mjs' 2>/dev/null || true
  sleep 1
  (cd "$BRIDGE_DIR" && ROUTER_PORT=$ROUTER_PORT nohup node scripts/path-router.mjs >"$ROUTER_LOG" 2>&1 &)
  sleep 1
  if ! router_alive; then
    echo "ОШИБКА: path-роутер не поднялся (лог: $ROUTER_LOG)" >&2
    exit 1
  fi
  echo "Роутер жив на :$ROUTER_PORT"
fi

if ! tunnel_alive; then
  echo "Поднимаю SSH-туннель..."
  # Осиротевший ssh с прошлой сессии держит удалённый порт 9090 — новый форвард
  # падает с "remote port forwarding failed" (паттерн ~/amoai/scripts/dev-up.sh).
  # Reconnect-цикл dev-tunnel.sh (~/amoai) респавнит свой ssh каждые 3с и может
  # перехватить порт при обрыве нашего — глушим и родителя.
  STALE="$(pgrep -f 'dev-tunnel\.sh' || true)"
  STALE="$STALE $(pgrep -f "ssh -N -R $REMOTE_BIND" || true)"
  if [[ -n "$STALE" ]]; then
    # shellcheck disable=SC2086
    kill $STALE 2>/dev/null || true
    sleep 1
  fi
  nohup ssh -N -R "$REMOTE_BIND:localhost:$ROUTER_PORT" \
    -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes \
    ai >"$TUNNEL_LOG" 2>&1 &
  for _ in $(seq 1 30); do
    tunnel_alive && break
    sleep 1
  done
  if ! tunnel_alive; then
    echo "ОШИБКА: туннель не проксирует API за 30с (лог: $TUNNEL_LOG)" >&2
    exit 1
  fi
fi

echo "Готово: $FORK_URL (роутер :$ROUTER_PORT, мост ожидается на :8083 под /bridge/*)"
