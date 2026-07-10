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

# Отказ CLI по лимиту: "Claude AI usage limit reached|<epoch>" (или без epoch).
sleep_if_limited() {
  local log="$1" epoch wait
  grep -qiE "usage limit reached|rate.?limit" "$log" || return 1
  epoch=$(grep -oE '\|[0-9]{10}' "$log" | tr -d '|' | head -1)
  wait=$(( ${epoch:-$(( $(now) + 1800 ))} - $(now) + 120 ))
  [ "$wait" -lt 600 ] && wait=600
  echo "[$(date '+%H:%M')] CLI упёрся в лимит — сплю ${wait}s"
  sleep "$wait"
  return 0
}

for i in $(seq 1 "$MAX"); do
  gate_on_snapshot

  log="$LOGDIR/iter-$(printf '%02d' "$i")-$(date +%H%M%S).log"
  echo "[$(date '+%H:%M')] итерация $i/$MAX → $log"

  # ponytail: --dangerously-skip-permissions — иначе первый же неразрешённый bash-запрос
  # молча провалит ночь; ужесточить = allowlist в .claude/settings.json и acceptEdits.
  claude -p "$(cat ralph/PROMPT.md)" --model fable --dangerously-skip-permissions >"$log" 2>&1

  if sleep_if_limited "$log"; then
    continue  # итерация сгорела об лимит — повторить после сна
  fi

  # терминальные маркеры смотрим только в хвосте журнала (старые не считаются)
  tail -5 "$ACTIVITY" 2>/dev/null | grep -q '<promise>COMPLETE</promise>' && { echo "COMPLETE"; break; }
  tail -5 "$ACTIVITY" 2>/dev/null | grep -q '<promise>STUCK</promise>'    && { echo "STUCK — нужен человек"; break; }
done

echo "[$(date '+%H:%M')] цикл завершён. Журнал: $ACTIVITY, логи: $LOGDIR/"
