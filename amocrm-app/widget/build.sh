#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

node --check script.js

FORBIDDEN=$(grep -cE 'console[.[(]|\b(confirm|alert|prompt)\(' script.js || true)
if [ "$FORBIDDEN" != "0" ]; then
  echo "FAIL: script.js contains $FORBIDDEN forbidden call(s) (console/alert/confirm/prompt)" >&2
  exit 1
fi

node -e "require('./manifest.json'); require('./i18n/ru.json')"

# Секрет DP-вебхука не хранится в git-манифесте (placeholder __DP_SECRET__),
# подставляется из env или bridge/.env только в собираемый zip — он должен
# совпадать с DP_SECRET моста (config.dpSecret), иначе amo → мост даст 403.
DP_SECRET="${DP_SECRET:-$(grep -s '^DP_SECRET=' ../bridge/.env | cut -d= -f2-)}"
if [ -z "$DP_SECRET" ]; then
  echo "FAIL: DP_SECRET not set (env or amocrm-app/bridge/.env) — webhook_url останется с placeholder" >&2
  exit 1
fi

OUT="dzenflow-widget.zip"
rm -f "$OUT"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
sed "s|__DP_SECRET__|$DP_SECRET|g" manifest.json > "$STAGE/manifest.json"
sed "s|__DP_SECRET__|$DP_SECRET|g" script.js > "$STAGE/script.js"
cp -r i18n images "$STAGE/"
( cd "$STAGE" && zip -r -X "$OUT" manifest.json script.js i18n images \
  -x '*.DS_Store' -x '__MACOSX*' >/dev/null )
mv "$STAGE/$OUT" ./

echo "built $OUT"
unzip -l "$OUT"
