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

OUT="dzenflow-widget.zip"
rm -f "$OUT"
zip -r -X "$OUT" manifest.json script.js i18n images \
  -x '*.DS_Store' -x '__MACOSX*' >/dev/null

echo "built $OUT"
unzip -l "$OUT"
