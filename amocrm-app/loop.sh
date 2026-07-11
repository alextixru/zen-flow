#!/usr/bin/env bash
# Ночной цикл amocrm-app (виджет amoCRM + бэкенд-мост). Каждая итерация — свежий
# headless-запуск claude по amocrm-app/PROMPT.md. Запуск:  ./amocrm-app/loop.sh [MAX_ITER]
#
# Отличия от ralph/ralph.sh (piece-цикл):
#  - ветка feature/amocrm-app, план amocrm-app/PRD.md (задачи W###/V###);
#  - ТРЁХуровневый роутинг моделей: sonnet (механика) / opus (интеграция) / fable
#    (security+архитектура+чекпоинты) — см. amocrm-app/ORCHESTRATION.md §1;
#  - детекция лимита вынесена во внешний check-limit.sh (перечитывается каждый тик);
#  - защита от runaway-loop: эвристика длительности/размера + circuit breaker
#    (разбор бага piece-цикла 2026-07-11, ORCHESTRATION.md §2а).
set -u
cd "$(dirname "$0")/.." || exit 1
trap 'echo; echo "[loop] прервано пользователем"; exit 130' INT TERM

MAX="${1:-25}"
BRANCH="feature/amocrm-app"
DIR="amocrm-app"
PRD_FILE="$DIR/PRD.md"
PROMPT_FILE="$DIR/PROMPT.md"
ACTIVITY="$DIR/activity.md"
CHECK_LIMIT="$DIR/check-limit.sh"
LIMITS_FILE="$HOME/.claude/rate-limits.json"
LOGDIR="$DIR/logs"
mkdir -p "$LOGDIR"

# Уже на ветке — не трогаем рабочее дерево; иначе переключаемся.
git rev-parse --abbrev-ref HEAD 2>/dev/null | grep -qx "$BRANCH" \
  || git checkout "$BRANCH" >/dev/null 2>&1 \
  || { echo "нет ветки $BRANCH"; exit 1; }

now() { date +%s; }

# Проактивный гейт по снимку statusLine интерактивной сессии (если он свежий).
gate_on_snapshot() {
  [ -f "$LIMITS_FILE" ] || return 0
  local ts age h5 r5 wait
  ts=$(jq -r '.ts // 0' "$LIMITS_FILE" 2>/dev/null); ts=${ts%.*}
  age=$(( $(now) - ${ts:-0} ))
  [ "$age" -gt 900 ] && return 0
  h5=$(jq -r '.five_hour.used_percentage // 0' "$LIMITS_FILE"); h5=$(printf '%.0f' "$h5")
  r5=$(jq -r '.five_hour.resets_at // 0' "$LIMITS_FILE")
  if [ "$h5" -ge 95 ]; then
    wait=$(( r5 - $(now) + 120 )); [ "$wait" -lt 300 ] && wait=300
    echo "[$(date '+%H:%M')] 5h=${h5}% — сплю ${wait}s до сброса окна"
    sleep "$wait"
  fi
}

# Трёхуровневый роутинг (ORCHESTRATION.md §1). Механика → sonnet, security/арх/чекпоинты
# → fable, остальное → opus. Пусто/нечитаемо → fable (финалить/чекпоинтить безопаснее).
SONNET_TASKS_RE='^(W004|W005|W011|W012|W017|W019)$'
FABLE_TASKS_RE='^(V[0-9]+|W003|W007|W008)$'
pick_model() {
  local task
  task=$(grep -E '^### - \[ \] ' "$PRD_FILE" | grep -v 'BLOCKED' | head -1 \
    | grep -oE '\b[WV][0-9]{3}[a-z]?\b' | head -1)
  if [ -z "$task" ]; then echo "fable"; return; fi
  if echo "$task" | grep -qE "$FABLE_TASKS_RE";  then echo "fable";  return; fi
  if echo "$task" | grep -qE "$SONNET_TASKS_RE"; then echo "sonnet"; return; fi
  echo "opus"
}

fast=0
for i in $(seq 1 "$MAX"); do
  gate_on_snapshot

  MODEL=$(pick_model)
  log="$LOGDIR/iter-$(printf '%02d' "$i")-$(date +%H%M%S).log"
  echo "[$(date '+%H:%M')] итерация $i/$MAX (model=$MODEL) → $log"

  # ponytail: --dangerously-skip-permissions — иначе первый неразрешённый bash молча
  # провалит ночь; ужесточить = allowlist в .claude/settings.json + acceptEdits.
  t0=$SECONDS
  claude -p "$(cat "$PROMPT_FILE")" --model "$MODEL" --dangerously-skip-permissions >"$log" 2>&1
  dt=$(( SECONDS - t0 ))
  size=$(wc -c <"$log")

  # Защита от runaway-loop: тик <30с ИЛИ лог <200б = почти наверняка провал/лимит,
  # не работа (в этом цикле каждая W-задача — реальный код + живые проверки).
  if [ "$dt" -lt 30 ] || [ "$size" -lt 200 ]; then
    wait=$(bash "$CHECK_LIMIT" "$log" 2>/dev/null || echo 0)
    if [ "${wait:-0}" -gt 0 ]; then
      echo "[$(date '+%H:%M')] CLI упёрся в лимит — сплю ${wait}s"
      sleep "$wait"; continue   # лимит: не тратим слот, ждём сброса
    fi
    fast=$(( fast + 1 ))
    echo "[$(date '+%H:%M')] подозрительно быстрый тик (${dt}s, ${size}б), подряд: $fast — бэкофф 900s"
    if [ "$fast" -ge 3 ]; then
      echo "[$(date '+%H:%M')] 3 быстрых тика подряд — стоп, нужен человек"; break
    fi
    sleep 900; continue
  fi
  fast=0

  # Терминальные маркеры — только в хвосте журнала (старые не считаются).
  tail -5 "$ACTIVITY" 2>/dev/null | grep -q '<promise>COMPLETE</promise>' && { echo "COMPLETE"; break; }
  tail -5 "$ACTIVITY" 2>/dev/null | grep -q '<promise>STUCK</promise>'    && { echo "STUCK — нужен человек"; break; }
done

echo "[$(date '+%H:%M')] цикл завершён. Журнал: $ACTIVITY, логи: $LOGDIR/"
