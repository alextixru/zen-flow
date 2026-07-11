#!/usr/bin/env bash
# Ночной Ralph-цикл: каждая итерация — свежий headless-запуск claude по ralph/PROMPT.md.
# Запуск из корня репо или откуда угодно:  ./ralph/ralph.sh [MAX_ITER]
#
# Лимиты подписки:
#  1) если ~/.claude/rate-limits.json свежий (его пишет statusline интерактивной сессии,
#     см. ~/.claude/statusline-command.sh) — гейтимся по нему ДО запуска итерации;
#  2) в чистом headless снимка нет — тогда ловим отказ CLI ("usage limit reached")
#     в выводе итерации и спим до сброса 5-часового окна.
set -u
cd "$(dirname "$0")/.." || exit 1
trap 'echo; echo "[ralph] прервано пользователем"; exit 130' INT TERM

MAX="${1:-25}"
BRANCH="feature/amocrm-piece"
ACTIVITY="ralph/activity.md"
LIMITS_FILE="$HOME/.claude/rate-limits.json"
LOGDIR="ralph/logs"
mkdir -p "$LOGDIR"

git checkout "$BRANCH" >/dev/null 2>&1 || { echo "нет ветки $BRANCH"; exit 1; }

now() { date +%s; }

# Гейт по снимку statusLine (работает, только пока открыта интерактивная сессия).
gate_on_snapshot() {
  [ -f "$LIMITS_FILE" ] || return 0
  local ts age h5 r5 wait
  ts=$(jq -r '.ts // 0' "$LIMITS_FILE" 2>/dev/null); ts=${ts%.*}
  age=$(( $(now) - ${ts:-0} ))
  [ "$age" -gt 900 ] && return 0  # протух — не источник истины
  h5=$(jq -r '.five_hour.used_percentage // 0' "$LIMITS_FILE"); h5=$(printf '%.0f' "$h5")
  r5=$(jq -r '.five_hour.resets_at // 0' "$LIMITS_FILE")
  if [ "$h5" -ge 95 ]; then
    wait=$(( r5 - $(now) + 120 )); [ "$wait" -lt 300 ] && wait=300
    echo "[$(date '+%H:%M')] 5h=${h5}% — сплю ${wait}s до сброса окна"
    sleep "$wait"
  fi
}

# Отказ CLI по лимиту. Реальные форматы CLI, оба должны матчиться:
#  - "You've hit your session limit · resets 2:40am (Europe/Moscow)"  (нет epoch, только часы:минуты)
#  - "Claude AI usage limit reached|<epoch>"                          (старый формат, с epoch)
LIMIT_MSG_RE='hit your (session|usage) limit|usage limit reached|rate.?limit'

# Извлекает ближайший будущий epoch времени "H:MMam/pm" из "resets H:MMam" (macOS/BSD date).
parse_reset_epoch() {
  local log="$1" timestr hm today_epoch now_ts
  timestr=$(grep -oiE 'resets[[:space:]]+[0-9]{1,2}:[0-9]{2}[[:space:]]*(am|pm)' "$log" | head -1 \
    | grep -oiE '[0-9]{1,2}:[0-9]{2}[[:space:]]*(am|pm)')
  [ -z "$timestr" ] && return 1
  timestr=$(echo "$timestr" | tr -d '[:space:]' | tr '[:lower:]' '[:upper:]')
  hm=$(date -j -f "%I:%M%p" "$timestr" "+%H:%M" 2>/dev/null) || return 1
  now_ts=$(now)
  today_epoch=$(date -j -f "%Y-%m-%d %H:%M" "$(date +%Y-%m-%d) $hm" "+%s" 2>/dev/null) || return 1
  # сброс уже был сегодня (или ровно сейчас) — время относится к завтрашнему дню
  [ "$today_epoch" -le "$now_ts" ] && today_epoch=$(( today_epoch + 86400 ))
  echo "$today_epoch"
}

sleep_if_limited() {
  local log="$1" epoch wait
  grep -qiE "$LIMIT_MSG_RE" "$log" || return 1
  epoch=$(parse_reset_epoch "$log")
  [ -z "$epoch" ] && epoch=$(grep -oE '\|[0-9]{10}' "$log" | tr -d '|' | head -1)
  wait=$(( ${epoch:-$(( $(now) + 1800 ))} - $(now) + 120 ))
  [ "$wait" -lt 600 ] && wait=600
  echo "[$(date '+%H:%M')] CLI упёрся в лимит (\"$(grep -oiE "$LIMIT_MSG_RE" "$log" | head -1)\") — сплю ${wait}s"
  sleep "$wait"
  return 0
}

# Гибрид моделей: V-чекпоинты и помеченные тяжёлые задачи ведёт fable, рутину — opus.
FABLE_TASKS_RE='^(V[0-9]+|T005|T012|T023)$'
pick_model() {
  local task
  task=$(grep -E '^### - \[ \] ' ralph/prd.md | grep -v 'BLOCKED' | head -1 \
    | grep -oE '\b[TV][0-9]{3}[a-z]?\b' | head -1)
  if [ -z "$task" ]; then echo "fable"; return; fi   # план пуст/нечитаем — финалить пусть fable
  if echo "$task" | grep -qE "$FABLE_TASKS_RE"; then echo "fable"; else echo "opus"; fi
}

for i in $(seq 1 "$MAX"); do
  gate_on_snapshot

  MODEL=$(pick_model)
  log="$LOGDIR/iter-$(printf '%02d' "$i")-$(date +%H%M%S).log"
  echo "[$(date '+%H:%M')] итерация $i/$MAX (model=$MODEL) → $log"

  # ponytail: --dangerously-skip-permissions — иначе первый же неразрешённый bash-запрос
  # молча провалит ночь; ужесточить = allowlist в .claude/settings.json и acceptEdits.
  claude -p "$(cat ralph/PROMPT.md)" --model "$MODEL" --dangerously-skip-permissions >"$log" 2>&1

  if sleep_if_limited "$log"; then
    continue  # итерация сгорела об лимит — повторить после сна
  fi

  # терминальные маркеры смотрим только в хвосте журнала (старые не считаются)
  tail -5 "$ACTIVITY" 2>/dev/null | grep -q '<promise>COMPLETE</promise>' && { echo "COMPLETE"; break; }
  tail -5 "$ACTIVITY" 2>/dev/null | grep -q '<promise>STUCK</promise>'    && { echo "STUCK — нужен человек"; break; }
done

echo "[$(date '+%H:%M')] цикл завершён. Журнал: $ACTIVITY, логи: $LOGDIR/"
