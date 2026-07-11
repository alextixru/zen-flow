#!/usr/bin/env bash
# Детектор лимита CLI для loop.sh. Вызывается КАЖДЫЙ тик отдельным процессом
# (`bash amocrm-app/check-limit.sh LOG`) — поэтому правки паттерна/парсинга
# подхватываются на следующем тике БЕЗ перезапуска долгоживущего цикла.
# (Корень бага piece-цикла 2026-07-11: фикс детекции внесли в уже запущенный
#  процесс, а bash парсит функции один раз при старте — правка не подхватилась.)
#
# stdout: число секунд для сна, если распознан лимит; иначе 0. exit 0 всегда.
set -u
log="${1:?usage: check-limit.sh LOGFILE}"
now() { date +%s; }

# Всеядный паттерн: покрывает обе реальные формулировки CLI и их дрейф.
#  - "You've hit your session limit · resets 2:40am (Europe/Moscow)"
#  - "Claude AI usage limit reached|<epoch>"
LIMIT_MSG_RE='hit your (session|usage) limit|usage limit reached|rate.?limit|limit.*reset'

grep -qiE "$LIMIT_MSG_RE" "$log" 2>/dev/null || { echo 0; exit 0; }

# Время сброса: сначала "resets H:MMam" (часы→ближайший будущий epoch, macOS/BSD date),
# затем старый формат "|<epoch>".
epoch=""
timestr=$(grep -oiE 'resets[[:space:]]+[0-9]{1,2}:[0-9]{2}[[:space:]]*(am|pm)' "$log" | head -1 \
  | grep -oiE '[0-9]{1,2}:[0-9]{2}[[:space:]]*(am|pm)')
if [ -n "$timestr" ]; then
  t=$(echo "$timestr" | tr -d '[:space:]' | tr '[:lower:]' '[:upper:]')
  hm=$(date -j -f "%I:%M%p" "$t" "+%H:%M" 2>/dev/null || true)
  if [ -n "${hm:-}" ]; then
    e=$(date -j -f "%Y-%m-%d %H:%M" "$(date +%Y-%m-%d) $hm" "+%s" 2>/dev/null || true)
    if [ -n "${e:-}" ]; then
      [ "$e" -le "$(now)" ] && e=$(( e + 86400 ))  # сброс уже был сегодня → завтра
      epoch="$e"
    fi
  fi
fi
[ -z "$epoch" ] && epoch=$(grep -oE '\|[0-9]{10}' "$log" | tr -d '|' | head -1)

wait=$(( ${epoch:-$(( $(now) + 1800 ))} - $(now) + 120 ))
[ "$wait" -lt 600 ] && wait=600  # минимум 10 мин — не долбить в закрытое окно
echo "$wait"
