#!/bin/zsh
# Локальное CE-превью: грузит переменные из ce-preview.env (рядом со скриптом)
# и запускает собранный API (dist), который сам отдаёт UI на AP_PORT.
#
# Использование:
#   ./scripts/start-ce.sh                 # запуск в текущем терминале
#   ./scripts/start-ce.sh > ce.log 2>&1 & # в фоне с логом
#
# Переопределить переменную разово можно из шелла (перебьёт значение из файла,
# т.к. экспортированный process.env имеет приоритет):
#   AP_EDITION=ee ./scripts/start-ce.sh
set -eu

SCRIPT_DIR="${0:A:h}"
REPO_ROOT="${SCRIPT_DIR:h}"
cd "$REPO_ROOT"

set -a
source "$SCRIPT_DIR/ce-preview.env"
set +a

exec node --enable-source-maps packages/server/api/dist/src/bootstrap.js
