# Dzen Flow для amoCRM — виджет + мост

Продукт Dzen.Team: no-code конструктор автоматизаций (форк Activepieces) внутри интерфейса amoCRM.
Состав: **виджет** (`widget/` — тонкий AMD-загрузчик, идёт в zip) + **мост** (`bridge/` — standalone
Fastify-сервис: install-ключи, embed-JWT, провижининг, приём DP/salesbot-вебхуков, статика виджета).

Карта документов: `PRD.md` (план задач + техсправочник), `activity.md` (журнал итераций с живыми
фактами), `INSTALL.md` (ручная установка zip на аккаунт), `RESEARCH.md` + `research/` (исследования).

## Сборка zip виджета

```bash
cd widget && ./build.sh   # → dzenflow-widget.zip (gitignored)
```

`build.sh` сам гоняет `node --check script.js` и grep-линтер загрузчика (`console.*`/`alert`/…),
пакует без macOS-мусора и подставляет реальный `DP_SECRET` (из env или `../bridge/.env`) вместо
placeholder'а `__DP_SECRET__` в manifest.json и script.js — в git секрета нет, в zip он есть
(виден админам аккаунта — приемлемо для managed-модели). Нет `DP_SECRET` → сборка падает.

Перед КАЖДОЙ перезаливкой zip — поднять `version` в `manifest.json` (amo кэширует script.js по
версии). Дальше — по `INSTALL.md` (загрузка через UI amo, API для этого нет).

## Мост: запуск

```bash
cd bridge && npm install && npm start    # node --env-file=.env, порт из PORT
```

Конфиг — `bridge/.env` (вне git; шаблон `env.example`). Отсутствие обязательной переменной —
падение на старте с именем переменной.

| Переменная | Что это |
|---|---|
| `PORT` | Порт моста (path-роутер туннеля шлёт сюда `/bridge/*`; dev: 8083) |
| `FORK_URL` | Публичный https-URL форка (dev: стабильный SSH-туннель `https://amoai-dev.dzen.team`) |
| `BRIDGE_PUBLIC_URL` | Публичный https-URL моста (тот же туннель, префикс `/bridge`) |
| `SIGNING_KEY_ID` | kid embedding signing key (Platform Settings → Security → Embedding) |
| `SIGNING_KEY_PATH` | Путь к приватному PEM (gitignored-файл, НЕ env-строка) |
| `DB_PATH` | Файл SQLite моста (`data/bridge.db`, gitignored) |
| `FORK_API_KEY` | Platform API key форка (sk-…) для SERVICE-эндпоинтов (allowed-embed-origins, теги pieces) |
| `DP_SECRET` | Общий секрет `?k=` для `/dp` и `/salesbot` (у amo-вебхуков нет подписи) |
| `AP_POSTGRES_URL` | Только для `scripts/dev-stand.sh` (подъём EE-стенда форка), мосту не нужен |

Дев-стенд целиком (Postgres + форк API/worker + SSH-туннель + path-роутер + мост) поднимает
идемпотентный `bridge/scripts/dev-stand.sh`. Туннель — только SSH (`ssh -N -R … ai` → Traefik →
`amoai-dev.dzen.team`); cloudflared в этом окружении заблокирован.

Тесты/типы: `npx tsc --noEmit && npx vitest run` (из `bridge/`).

## Онбординг клиента (по шагам)

1. **Выпустить ключ:** `npm run issue-key` — печатает install-ключ (32 байта base64url),
   строка `pending` в БД. Ключ передать клиенту, больше нигде не хранить.
2. **Привязать amo-токен клиента (опционально, для автосоздания connection):**
   `AMO_TOKEN=<long-lived токен> npm run set-amo-token -- --key <install-ключ>`
   (токен только через env/stdin — argv виден в `ps`).
3. **Установка виджета** на аккаунт клиента — по `INSTALL.md` (zip собран с их/нашим `DP_SECRET`).
4. **Клиент вводит ключ** в настройках виджета («Настроить») и сохраняет: `onSave` шлёт
   `POST /install` → мост привязывает ключ ↔ account_id ↔ subdomain (`active`), добавляет
   `https://<subdomain>.amocrm.ru` в allowedEmbedOrigins форка (CSP frame-ancestors) и — при
   наличии токена из п.2 — создаёт connection `amocrm` в проекте клиента.
5. **Проверка:** страница виджета «Автоматизации» открывает конструктор (embed-JWT ~1 час,
   `role: Editor`, каталог pieces = тег `ru-allowed`); connection в проекте зелёный;
   `curl -sI $FORK_URL | grep -i content-security-policy` содержит origin клиента.

Ревок ключа: `UPDATE accounts SET status='revoked' WHERE install_key=…` — мост отвечает 403
на все эндпоинты связки; перевыпуск — заново с п.1.

## Белый бэкдор (дев-цикл без перезаливки zip)

`script.js` в zip — только загрузчик: он берёт базовый URL статики из
`localStorage['dzenflow_public_path']` (если задан), иначе — из зашитого прод-URL
(`<BRIDGE_PUBLIC_URL>/static/widget`), и грузит оттуда `widget-app.js` + `widget-app.css`
(раздаются мостом с `Cache-Control: no-cache`). Итерация кода: правка `bridge/static/widget/*` →
обновление страницы amo — без пересборки zip и bump'а версии. На чужом аккаунте бэкдор
активируется вручную в DevTools-консоли:

```js
localStorage['dzenflow_public_path'] = 'https://amoai-dev.dzen.team/bridge/static/widget'
```

Это легитимная debug-фича (проходит модерацию amo при апгрейде до публичной интеграции).
