# PRD — «Интеграция приложения в amoCRM» (виджет + embedding форка)

Атомарный план для автономного цикла (модель исполнения — как `ralph/PROMPT.md`: одна итерация = одна задача, преемственность в файлах и git).
Цель: клиент amoCRM открывает наш конструктор автоматизаций (форк Activepieces) прямо из интерфейса amo и запускает flow из автоворонки/salesbot/карточки — managed-путь, без маркетплейса и модерации.
Детализирует этапы 0–3 из `amocrm-app/PLAN.md`. Основание: `amocrm-app/RESEARCH.md` + `research/*`. Этапы 4–5 — вне цикла (см. конец файла).

## Общие правила для КАЖДОЙ задачи (не повторяются в теле)

- **Ветка:** `feature/amocrm-app` (создать от `feature/amocrm-piece` — piece нужен для проверок). Один коммит на задачу: `feat(amo-app): W0XX <название>`. Без push.
- **Журнал:** `amocrm-app/activity.md` (формат — как `ralph/activity.md`): дата, ID задачи, файлы, фактические результаты команд/живых проверок, решения, блокеры. «Проверено» пишется только про то, что реально гонялось в этой итерации.
- **Секретная гигиена (жёстко):** приватный signing key, long-lived токены amo, install-ключи клиентов, `AP_JWT_SECRET` — НИКОГДА не попадают в файлы под git. Секреты живут в `.env.dev` (корень, вне git) и `amocrm-app/bridge/.env` (gitignored; рядом коммитится `.env.example` с пустыми значениями). Перед каждым коммитом: `git diff | grep -cE 'eyJ0|BEGIN (RSA )?PRIVATE KEY'` = 0 и `git status` не содержит `.env*`/`data/`.
- **Verify моста:** `npx tsc --noEmit` (из `amocrm-app/bridge/`), `npx vitest run` (если в задаче есть тесты), curl-smoke эндпоинтов задачи. Verify виджета: `./build.sh` собирает zip без ошибок + живая проверка на dzenteamdev, консоль браузера без ошибок нашего кода. `npm run lint-dev` гоняется ТОЛЬКО если дифф коснулся `packages/**` (в этом плане не должен).
- **Живые проверки:** где в `verify` указан стенд — проверка обязательна. Если стенд/туннель недоступен по внешней причине — реализовать по спеке, записать в activity «непроверено живьём: <причина>», НЕ блокировать; ближайшая V-задача обязана вернуться к проверке.
- **BLOCKED-протокол** — как в `ralph/PROMPT.md`: суффикс ` — BLOCKED: <причина одной строкой>` в заголовке задачи, подробности в activity, взять следующую задачу. Два BLOCKED подряд → `<promise>STUCK</promise>` в activity.
- **Чекбокс `- [x]`** — только после прохождения verify.
- **Не расширять скоуп:** никаких правок форка «по пути», рефакторингов, абстракций сверх спеки. Баг/уродство вне скоупа — запись в activity, не фикс.

## Конвенции кода

**Виджет (`amocrm-app/widget/`)** — окружение amo (загрузчик RequireJS, глобалы amo):
- `script.js` — AMD-модуль `define([...], function (...) { ... return Widget; })`; во всех коллбеках amo (`init`, `render`, `onSave`, `settings`, `advancedSettings`, `dpSettings`, `onSalesbotDesignerSave`, ...) обязателен `return` (частая ловушка — «копипаста из доки не работает без return»).
- Практический ES5 + jQuery amo, без бандлера и полифиллов. Понадобится сборка — esbuild → одиночный IIFE, не раньше.
- Не затирать глобалы amo: `window._` (underscore), `window.$`, `AMOCRM`. Свои глобалы — только один неймспейс `window.__dzenflow`.
- `bind_actions` не использовать (фактически ведёт себя как init) — переинициализация через `render()`.
- Все строки UI — из `i18n/ru.json` виджета; в коде — ключи.
- Zip — тонкий: manifest + загрузчик + i18n + images. Логика живёт на нашей статике за белым бэкдором (W013).

**Мост (`amocrm-app/bridge/`)** — standalone TypeScript-сервис, ВНЕ монорепо-графа (не регистрировать в turbo/`tsconfig.base.json`):
- Стек фиксирован: Node 20+, Fastify, better-sqlite3, jsonwebtoken. Новые зависимости — только при реальной необходимости, с обоснованием в activity.
- `tsconfig` strict; no `any` (unknown + гарды); named params (один деструктурируемый объект) для функций с >1 параметром; vitest-тесты для чистой логики (подпись JWT, маппинги, дедуп).
- Исходящие HTTP — только на форк и `*.amocrm.ru`; базовые URL из env, никогда из пользовательского ввода (фиксированные базы = SSRF-модель моста).
- **CORS обязателен** (`@fastify/cors` — оправданная зависимость): эндпоинты `/install`, `/embed-token`, `/flows`, `/runs`, `/run` зовутся `fetch`'ем со страницы amo. Динамическая проверка origin по regex `^https:\/\/[a-z0-9][a-z0-9-]*\.amocrm\.ru$` (не `*` и не echo произвольного origin).
- **Логи моста никогда не содержат** JWT (embed- и access-), amo-токены, install-ключи, PEM. Для трассировки ключа — только первые 6 символов. Fastify-логгер не логирует тела запросов/ответов и заголовок `Authorization`.
- Приватный signing key — НЕ в env-строке (многострочный PEM ломает dotenv): env `SIGNING_KEY_PATH` указывает на gitignored-файл (например `bridge/data/signing-key.pem`).
- Конвенции `CLAUDE.md` репо обязательны только для файлов внутри `packages/**` (которых в этом плане быть не должно).

## Справочник (общие техфакты)

**Стенды**
- amo dev: `dzenteamdev.amocrm.ru` (account id **32453394**), тестовый — любые операции разрешены. Long-lived токен: `AMOCRM_ACCESS_TOKEN` в `.env.dev` (корень репо). Там же резервные OAuth-креды `AMO_CLIENT_ID`/`AMO_CLIENT_SECRET`.
- Форк для PoC: embedding — EE-фича → нужен `AP_EDITION=ee` + Postgres (PGLite для ee запрещён). Готовая БД пользователя: `postgresql://postgres:...@37.233.86.154:9876/postgres` (строка целиком — в памяти `local-preview-setup`; там платформа `main`, admin `main@dzen.team`, `platform_plan` со всеми EE-флагами `true`, включая `embeddingEnabled`). Прод-сборка по образцу `scripts/start-ce.sh`: API-процесс (порт 8080, отдаёт и фронт) + отдельный worker-процесс (8082, `AP_DEV_PIECES=amocrm`). HTTPS для iframe из amo (https-страница не грузит http-iframe): `cloudflared tunnel --url http://localhost:8080`; `AP_FRONTEND_URL` = URL туннеля.
- Zip виджета грузится ТОЛЬКО через UI amo (API загрузки нет). Настройки, хранимые amo, стираются при деактивации/реактивации виджета. Обновление виджета = новый zip с увеличенным `version` в манифесте (amo кэширует статику по версии) — правило для каждой перезаливки.
- **UI-операции в amo и превью агент делает сам через браузер** (chrome-devtools MCP или скилл `agent-browser`): загрузка zip, клики, чтение консоли/Network для CSP. Сессия `dzenteamdev.amocrm.ru` должна быть уже залогинена в браузере (оставляет пользователь). Сессии нет → это внешняя причина: НЕ подбирать пароли; для W001 — BLOCKED (предусловие проекта), для остальных — «непроверено живьём» по общему правилу.
- **Стенд НЕ переживает итерацию.** Каждая задача с живой проверкой сначала проверяет живость (`curl -s localhost:8080/api/v1/flags`) и при отказе поднимает форк+worker+туннель заново — процедурой `bridge/scripts/dev-stand.sh` (появляется в W003). Туннели cloudflared quick-режима эфемерны: после каждого подъёма НОВЫЙ URL пишется в `bridge/.env` (`FORK_URL`, `BRIDGE_PUBLIC_URL`) и activity; URL, зашитые в собранный zip/манифест, при смене туннеля обновляются через белый бэкдор или пересборку.
- **Мосту нужен СВОЙ https-туннель** (второй cloudflared, на порт моста): страница amo — https, `fetch`/webhook на `http://localhost` браузер и amo не пропустят (mixed content).
- Память проекта (строка Postgres, пароль админа превью — `local-preview-setup.md`): файлы `~/.claude/projects/-Users-tihn-Zen-flow/memory/*.md`, читать Read'ом при необходимости.

**Embed-провижининг (форк, детали: `research/embed-sdk.md`)**
- JWT RS256: header `{ alg:'RS256', typ:'JWT', kid:<signingKeyId> }`; claims v3: `version:'v3'`, `externalUserId` (amo user_id, строкой), `externalProjectId` (amo account_id, строкой), `firstName`, `lastName`, `exp` (~1 час), опц. `role` (строго `'Admin'|'Editor'|'Viewer'`; несуществующая роль роняет обмен), `piecesFilterType:'ALLOWED'` + `piecesTags:[...]`, `projectDisplayName` (субдомен клиента), `concurrencyPoolKey`/`concurrencyPoolLimit`.
- Обмен JWT → сессия делает сам фронт в iframe (`POST {fork}/v1/managed-authn/external-token`, идемпотентно создаёт User+Project). Наша сторона лишь передаёт JWT в `activepieces.configure({ instanceUrl, jwtToken, embedding: {...} })`.
- Signing key создаётся в Platform Settings → Security → Embedding; приватный ключ отдаётся ОДИН раз — немедленно в `bridge/.env`.
- CSP: форк шлёт `frame-ancestors 'self' <origins>` из `platform.allowedEmbedOrigins` (мержится с env `AP_ALLOWED_EMBED_ORIGINS`); пустой список → `'self'` → iframe из amo заблокирован браузером. Добавление origin: UI платформы или `POST /v1/embed-subdomain/allowed-embed-origins` (принципал SERVICE). Для каждого клиента нужен его `https://<subdomain>.amocrm.ru`.
- SDK: `<script src="{fork}/embed/<версия>.js">` (актуальная 0.13.0) → `window.activepieces`. Полезные embedding-опции: `containerId`, `locale:'ru'`, `styling.mode:'light'|'dark'`, `dashboard.hideSidebar/hideFlowsPageNavbar/hidePageHeader`, `hideFolders`, `hideTables`, `hideGlobalSearch`, `builder.disableNavigation/hideFlowName/homeButtonIcon:'back'`, `navigation.handler`. Внутри iframe memoryRouter: reload страницы-хоста требует повторного `configure()`; F5 внутри iframe не переживается — это норма.

**Формы манифеста (по боевым референсам `reference/triggeron|bpmn/widget/manifest.json`)**
- Скелет: `widget.{name,description,short_description,version,interface_version:2,init_once:false,locale:['ru'],installation:true,support:{link,email}}` + `locations` + `settings` (модалка «Настроить» обязательна всегда, минимум одно поле — у нас `install_key`) + `advanced.title` (для advanced_settings).
- DP-блок: `dp: { settings: { <код_поля>: { name:'i18n-ключ', type:'text', required } }, action_multiple: false, webhook_url: 'https://<мост>/dp' }` + файл `images/logo_dp.png` 174×109. При срабатывании шага amo шлёт POST на `webhook_url`: `{ event: {type,type_code,data,time}, action: { settings: { widget: { settings: {<наши поля>} } } }, subdomain, account_id }` и ждёт быстрый ответ.
- salesbot_designer-блок: `salesbot_designer: { logo, <handler_code>: { name, settings: { <field>: { id?, name, type:'text', manual:true, required, default_value? } } } }` + коллбеки `salesbotDesignerSettings($body, renderRow, params)` (вернуть `{exits:[{code,title}]}`) и `onSalesbotDesignerSave(handler_code, params)` (вернуть JSON логики шага).
- `mobile: { frame_url: 'https://<мост>/mobile/card', color: '#...' }` — официальный декларативный iframe в мобильной карточке.
- В коллбеках доступно: `AMOCRM.constant('user')` (id, name), `AMOCRM.constant('account')` (id, subdomain), `this.get_settings()` (значения settings-полей + `widget_code`), `this.params` (`path`/public_path и пр.).

**Install-ключ (managed-аутентификация виджет → мост)**
- Онбординг: мы генерим ключ (32 байта, base64url), выдаём клиенту; клиент вводит его в поле настроек виджета. `onSave` шлёт на мост `{install_key, account_id, subdomain, user}` → мост связывает ключ ↔ account_id ↔ project и провижинит (origin, connection).
- Каждый показ конструктора: виджет шлёт `{install_key, account_id, user}` → мост сверяет связку → отдаёт свежий embed-JWT (~1 час). Ключ хранится в настройках виджета (виден админам аккаунта клиента) — скоуплен на аккаунт; компрометация = ревок + перевыпуск, мост обязан уметь ревокать.

**Лимиты и бэкдор**
- amo rate limits: **7 rps на интеграцию, 50 rps на аккаунт суммарно** (общий потолок с чужими виджетами клиента, занятость не замерить). Мост и виджет не создают бурстов.
- **Белый бэкдор:** загрузчик в `script.js` берёт базовый URL статики из `localStorage['dzenflow_public_path']` (если задан), иначе — зашитый прод-URL. Итерации кода без перезаливки zip, отладка на живом аккаунте. Легитимная debug-фича (проходит модерацию при апгрейде до публички).
- Вебхуков на аккаунт amo ~100; `webhook_url` DP-шага — один на виджет (мультиплексирование по settings шага).

## Границы изменений

Разрешено изменять ТОЛЬКО:
- `amocrm-app/widget/**` — виджет (manifest.json, script.js, i18n, images, build.sh, статика приложения виджета);
- `amocrm-app/bridge/**` — бэкенд-мост (standalone TypeScript-сервис);
- `amocrm-app/PRD.md` (чекбоксы/BLOCKED своей задачи) и `amocrm-app/activity.md` (своя запись);
- локально (вне git): `.env.dev`, `bridge/.env`, `bridge/data/`.

**Решение по мосту (зафиксировано):** standalone-сервис в `amocrm-app/bridge/`, НЕ модуль форка — все нужные API форка уже существуют (managed-authn, allowed-embed-origins, app-connections, webhook-запуск flow), а отдельный сервис не создаёт merge-трения с upstream и не тянет миграции/EE-слои/конвенции ядра.

Всё остальное запрещено: `packages/**` (включая piece amocrm — у него свой ночной цикл ralph), `ralph/**`, конфиги репо, CI, `CLAUDE.md`, `.claude/**`, миграции. Если задача упирается в правку форка (баг embed-sdk, недостающий эндпоинт) — это `BLOCKED` + описание в activity: правки форка — отдельная дорожка по конвенциям CLAUDE.md, не этот цикл. Субагентам-кодерам список разрешённых путей вставлять в промпт дословно и проверять их дифф.

## Чекпоинты валидации (V-задачи) — общая спецификация

Каждые ~5 задач. Обычная итерация цикла, но роль — независимый валидатор, никаких новых фич:
1. **Полные проверки:** `npx tsc --noEmit` + `npx vitest run` в bridge — чисто; `./build.sh` виджета собирает zip; `git status` чист; дифф блока (`git log` + `git diff`) — только разрешённые пути.
2. **Секрет-скан блока:** `git diff feature/amocrm-piece --unified=0 | grep -cE 'eyJ0|BEGIN (RSA )?PRIVATE KEY'` = 0; ни один `.env*`/`data/` не закоммичен.
3. **Живой сквозной сценарий блока** на dzenteamdev (что именно — в теле конкретной V-задачи) — включая доборы проверок, помеченных «непроверено живьём» в activity.
4. **Сверка со спеками:** верификатор-субагент со свежим контекстом читает спеки задач блока и их диффы, сверяет реализацию; плюс скилл `code-review` по накопленному диффу.
5. **Исправление:** починяемое — чинить в этой же итерации; непочиняемое — пометить исходную W-задачу ` — BLOCKED: <причина>` + activity.
6. **Коммит** `chore(amo-app): V00X checkpoint` (если были фиксы), вердикт по каждому пункту в activity (фактические выводы, не «всё ок»).

---

## Фаза 0 — PoC-валидация (этап 0 PLAN)

### - [ ] W001 — Скелет приватного виджета + установка на стенд
- **spec:** Каркас `amocrm-app/widget/`: `manifest.json` — widget-скелет по референсу Triggeron, `locale:['ru']`, `locations: ['settings','advanced_settings','lcard-0']` (DP/salesbot-блоки НЕ включать — добавятся в фазе 2, когда появится живой `webhook_url` моста), `settings.install_key` — точная форма: `settings: { install_key: { name: '<i18n-ключ>', type: 'text', required: false } }` (required:false — на PoC ключа ещё нет), `advanced.title`. `script.js` — AMD-модуль с минимальными `init/render/settings/onSave/advancedSettings` (все с `return true`); `advancedSettings()` рендерит заглушку «Автоматизации Dzen.Team» в рабочую область (`#work-area-<widget_code>`). `i18n/ru.json` со всеми ключами манифеста. `images/` — заглушки логотипов (минимум, чтобы zip прошёл валидацию). `build.sh` — упаковка zip без macOS-мусора (`zip -r -X`, исключить `.DS_Store`/`__MACOSX`). Установить на dzenteamdev как приватный виджет через браузер (см. справочник, UI-операции); фактический путь загрузки zip в текущем UI amo зафиксировать в activity.
- **files:** `amocrm-app/widget/{manifest.json,script.js,i18n/ru.json,images/,build.sh}`.
- **pattern:** `reference/triggeron/widget/manifest.json` (скелет + i18n-ключи), `reference/bpmn/widget/manifest.json`; AMD-ловушки — конспект `~/getcourse/`.
- **verify:** zip собран; виджет установлен и активен на dzenteamdev; страница advanced_settings открывается, заглушка рендерится, консоль без наших ошибок. В activity зафиксировать: выданный amo `widget_code` и фактический URL страницы advanced_settings (вида `/settings/widgets/#<code>` или каким он окажется) — нужны W011/W013. Если UI загрузки приватного виджета не найден — ` — BLOCKED` (это предусловие всего проекта), с точным описанием, что искали и где.

### - [ ] W002 — Живая проверка CSP + размеры областей (открытые вопросы №1–2)
- **spec:** В `advancedSettings()` вставить `<iframe src="https://<frameable https-URL>" style="width:100%;height:<замер>px">` и снять на живом стенде: (а) режет ли CSP amo произвольный внешний iframe (консоль/Network — главный риск MVP; прецедент Sensei говорит «нет»); (б) фактические размеры work-area advanced_settings (px, скролл, поведение при ресайзе окна) и правой lcard-панели; (в) стабильность iframe при переходах между разделами amo и возврате; (г) фактические формы `AMOCRM.constant('user')` и `AMOCRM.constant('account')` (JSON-снимок без личных данных сверх id/имени) — от них зависят W003/W006/W007. Для src годится любой https-ресурс без anti-framing заголовков (например, страница на GitHub Pages/нашем домене); мост ещё не существует. Результаты — числами и скринами в activity.
- **escape:** если amo вопреки прецеденту режет iframe — зафиксировать точную CSP-строку из консоли, пометить W010 риском, добавить в «Открытые вопросы» fallback «рендер SPA в DOM work-area» (второй режим Sensei); НЕ реализовывать fallback сейчас.
- **files:** `amocrm-app/widget/script.js`, activity.
- **verify:** живьём: внешний iframe отрендерился внутри advanced_settings dzenteamdev; размеры областей записаны в activity.

### - [ ] W003 — Embed-handshake: JWT → конструктор внутри amo
- **spec:** Поднять форк в EE-режиме по справочнику (Postgres пользователя + API 8080 + worker 8082 с `AP_DEV_PIECES=amocrm` + cloudflared-туннель, `AP_FRONTEND_URL`=туннель). Процедуру подъёма зафиксировать исполняемым `bridge/scripts/dev-stand.sh` (идемпотентный: проверил живость → поднял недостающее; без секретов в теле — env из `.env.dev`/`bridge/.env`; свежий URL туннеля печатает и пишет в `bridge/.env`) — все последующие живые задачи поднимают стенд ИМ, а не заново изобретают. В Platform Settings: проверить `embeddingEnabled`, создать signing key (kid → `bridge/.env`, приватный ключ → файл по `SIGNING_KEY_PATH`, вне git), добавить `https://dzenteamdev.amocrm.ru` в allowedEmbedOrigins через UI. Первый файл моста — `bridge/scripts/sign-jwt.ts`: подписывает JWT v3 (`externalProjectId:'32453394'`, `externalUserId` = id юзера amo, `firstName/lastName`, `exp` 1ч) — без сервера, одноразовый запуск. В виджете: `advancedSettings()` подключает `<script src="{туннель}/embed/<версия>.js">`, вызывает `configure({ instanceUrl: туннель, jwtToken: <вставлен руками перед сборкой, НЕ коммитить>, embedding: { containerId, locale:'ru', dashboard:{hideSidebar:true} } })`.
- **files:** `amocrm-app/bridge/{package.json,tsconfig.json,scripts/sign-jwt.ts,scripts/dev-stand.sh,.env.example,.gitignore}` (`.gitignore`: `.env`, `data/`, `*.pem`), `widget/script.js`.
- **pattern:** `research/embed-sdk.md` §3 (claims), §7 (чек-лист виджета).
- **verify:** живьём: `curl -sI {туннель} | grep -i content-security-policy` содержит `https://dzenteamdev.amocrm.ru` (allowedEmbedOrigins применился); конструктор открылся внутри advanced_settings на dzenteamdev; в форке автосоздан Project `32453394` и managed-юзер; reload страницы amo → повторный `configure()` отрабатывает, iframe не задваивается. В activity: точные env-переменные, URL туннеля, все грабли.
- **escape:** cloudflared недоступен → любой https-туннель (ngrok-аналог, `ssh -R` на VPS). Совсем без туннеля handshake не проверить → ` — BLOCKED` (ядро PoC).

### - [ ] W004 — UI-QA piece amoCRM в билдере (этап 0 п.4)
- **spec:** На поднятом превью-стенде прокликать piece amocrm глазами человека (до сих пор он тестировался только API-скриптами): создать connection на long-lived токене dzenteamdev; собрать flow `lead_added → create_task`; проверить: дропдауны (pipeline → status refresher, users, task types), DynamicProperties кастомных полей (все типы: select/multiselect/date/checkbox/multitext), `test()` триггеров отдаёт sample, включение flow регистрирует вебхук, живое срабатывание (создать сделку на стенде → задача создана). Все найденные UI-баги piece — нумерованным списком в activity с шагами воспроизведения. Чинить piece ЗДЕСЬ нельзя (дорожка ralph); критичный для MVP баг — пометить в activity как блокер-кандидат для W010.
- **files:** только `amocrm-app/activity.md`.
- **verify:** чек-лист пройден живьём, каждая находка записана; flow остаётся включённым (нужен V001).

### - [ ] V001 — Чекпоинт PoC (W001–W004)
- **spec:** общая спецификация V-задач. Живой сценарий: открыть dzenteamdev → advanced_settings → конструктор загружается по JWT → flow из W004 виден и включён. Особое внимание: результаты CSP/размеров (W002) и грабли handshake (W003) зафиксированы в activity числами/фактами — от них зависит вся фаза 1.

---

## Фаза 1 — MVP: managed-конструктор внутри amo (этап 1 PLAN)

### - [ ] W005 — Каркас моста
- **spec:** Fastify-приложение: `src/config.ts` (env: `PORT`, `FORK_URL`, `SIGNING_KEY_PATH`, `SIGNING_KEY_ID`, `DB_PATH`, `BRIDGE_PUBLIC_URL`; отсутствие обязательной переменной — падение на старте с внятным сообщением, не в рантайме), `src/db.ts` (better-sqlite3, файл `data/bridge.db`; таблица `accounts`: `install_key` PK, `account_id`, `subdomain`, `amo_token` NULL, `status` pending|active|revoked, `created_at`), `src/jwt.ts` — `signEmbedJwt({ accountId, subdomain, user, piecesTags })` (перенос логики из `scripts/sign-jwt.ts` W003; claims по справочнику), регистрация `@fastify/cors` по конвенции моста (regex amocrm.ru), `GET /health`. Запуск `npm start` (tsx или сборка tsc — выбрать простейшее).
- **files:** `amocrm-app/bridge/src/{index.ts,config.ts,db.ts,jwt.ts,jwt.test.ts}`, `package.json`.
- **pattern:** claims — справочник + `research/embed-sdk.md` §3.2.
- **verify:** tsc + vitest (`jwt.test.ts`: заголовок kid, обязательные claims v3, exp ≈ 1ч); `curl /health` → 200.

### - [ ] W006 — Install-flow: выпуск ключей + POST /install
- **spec:** CLI `scripts/issue-key.ts`: генерит ключ (32 байта base64url), пишет строку `pending` в БД, печатает ключ (единственный вывод — в stdout, не в файлы). `POST /install` `{install_key, account_id, subdomain, user}`: валидация входа ДО логики — `subdomain` матчит `^[a-z0-9][a-z0-9-]{0,62}$`, `account_id` — положительное целое, иначе 400 (subdomain дальше уходит в CSP-список форка W008 — порча origin-списка недопустима); ключ существует и (`pending` ИЛИ уже привязан к этому же `account_id`) → привязать/подтвердить (идемпотентно), иначе 403. Виджет: `onSave()` читает `install_key` из `this.get_settings()` + `AMOCRM.constant('account')` → POST на мост; успех/ошибка — уведомление пользователю в модалке настроек; `return true` только при успехе (amo не даст сохранить при false — проверить это поведение живьём). URL моста зашит константой в `script.js` (dev-переопределение придёт с белым бэкдором W013).
- **files:** `bridge/scripts/issue-key.ts`, `bridge/src/{index.ts,install.ts}`, `widget/script.js`, `widget/i18n/ru.json`.
- **verify:** tsc + vitest (валидация связки: pending→bind, повторный install идемпотентен, чужой account_id → 403); живьём: выпустить ключ, ввести в настройках виджета на dzenteamdev (мост локально + туннель), «Сохранить» → строка в БД активирована.

### - [ ] W007 — POST /embed-token
- **spec:** `POST /embed-token` `{install_key, account_id, user:{id,name}}` → сверка активной связки (ключ+account_id) → `signEmbedJwt`: `externalProjectId=String(account_id)`, `externalUserId=String(user.id)`, `firstName/lastName` из `name` (сплит по первому пробелу; пусто → 'amoCRM'/'User'), `exp` 1ч, `role:'Editor'`, `piecesFilterType:'ALLOWED'`, `piecesTags:['ru-allowed']`, `projectDisplayName=subdomain` — subdomain брать из СТРОКИ БД связки, не из тела запроса (клиент может врать). Выданный JWT не логировать. Ответ `{jwtToken, instanceUrl: FORK_URL}`. 403 на неизвестную/`revoked` связку. Примитивный rate-limit in-memory (напр. 30 req/мин на ключ) — от перебора; `ponytail:` in-memory, upgrade — на реверс-прокси.
- **files:** `bridge/src/{index.ts,embed-token.ts}` + тест.
- **verify:** tsc + vitest (успех, 403 unknown/revoked, лимит); curl-smoke: выданный JWT декодируется с ожидаемыми claims (`node -e` разбор, сам токен в файлы не писать).

### - [ ] W008 — Автодобавление origin клиента в allowedEmbedOrigins
- **spec:** При успешном `/install` мост вызывает форк `POST /v1/embed-subdomain/allowed-embed-origins` `{origins:['https://<subdomain>.amocrm.ru']}` — эндпоинт для SERVICE-принципала, мержит без дублей (повторный install безопасен). **Живая проверка обязательна (неснятый вопрос):** чем аутентифицируется SERVICE-принципал на нашем EE-инстансе — разобрать по коду (`securityAccess.publicPlatform([PrincipalType.SERVICE])`, EE-модуль api-keys, выпуск platform API key в UI) и подтвердить живым вызовом. Ключ — в `bridge/.env` (`FORK_API_KEY`). Ошибка вызова форка НЕ валит install: связка сохраняется, факт «origin не добавлен» пишется в лог/строку БД для ручного добора.
- **escape:** если SERVICE-ключ на нашей сборке не выпускается — origin добавляется руками в UI платформы при онбординге (managed-модель позволяет), задача помечается ` — BLOCKED: <причина>` только в части автоматизации, ручная процедура описывается в activity.
- **files:** `bridge/src/{fork-client.ts,install.ts}` + тест.
- **verify:** живьём: `/install` с новым субдоменом → `curl -sI {FORK_URL} | grep -i content-security-policy` содержит новый origin.

### - [ ] W009 — Автосоздание amocrm-connection в проекте клиента
- **spec:** Онбординг клиента включает его long-lived amo-токен (колонка `amo_token` в БД моста; файл БД вне git — приемлемо для MVP, `ponytail:` шифрование колонки — upgrade перед продом). Ввод токена оператором — CLI `scripts/set-amo-token.ts` (`--key <install_key>`, сам токен из env-переменной или stdin, НЕ из argv — argv виден в `ps`; токен не печатать, не логировать). После `/install` (при наличии токена): мост подписывает себе embed-JWT этого аккаунта → обменивает сам через `POST {fork}/v1/managed-authn/external-token` → полученным access-token'ом апсертит connection в проект: `POST /v1/app-connections` с `pieceName:'@activepieces/piece-amocrm'`, тип CUSTOM_AUTH, `value:{subdomain, zone:'amocrm.ru', apiToken:<amo_token>}`, `externalId:'amocrm'`, `displayName:'amoCRM'`. **Точную форму тела сверить** с `docs/embedding/predefined-connection.mdx` и контроллером app-connections (живой вызов — истина). Идемпотентность — по `externalId`.
- **files:** `bridge/scripts/set-amo-token.ts`, `bridge/src/{fork-client.ts,provision-connection.ts}` + тест на сборку тела.
- **pattern:** `docs/embedding/predefined-connection.mdx`; `research/embed-sdk.md` §2 (`connect`, externalId-семантика).
- **verify:** живьём: после install в проекте клиента есть валидный connection (открыть в embedded-UI, статус зелёный); flow с amocrm-триггером активируется без ручного ввода токена.

### - [ ] W010 — Виджет v1: страница «Автоматизации» (advanced_settings)
- **spec:** Собрать боевой `advancedSettings()`: (1) `install_key` из настроек отсутствует → плашка «Введите ключ установки в настройках интеграции» со ссылкой на модалку; (2) ключ есть → POST `/embed-token` на мост → `configure({ instanceUrl, jwtToken, embedding: { containerId, locale:'ru', styling:{ mode: <детект тёмной темы amo — подобрать живьём (класс на body/html); дефолт light> }, dashboard:{hideSidebar:true, hideFlowsPageNavbar:false}, hideFolders:true, hideTables:true, hideGlobalSearch:true, builder:{ homeButtonIcon:'back' } } })`; (3) мост вернул 403 → плашка «ключ недействителен, обратитесь в поддержку»; (4) повторный вызов `advancedSettings()` (переходы по amo туда-обратно) → очистить контейнер перед новым `configure()`, iframe не задваивается; (5) сетевая ошибка моста / недоступный форк / не загрузился embed-скрипт → плашка «сервис временно недоступен» (ключ в i18n), без необработанных promise rejection в консоли. Высота iframe — по замерам W002. Версию embed-скрипта зашить (0.13.0), грузить с `FORK_URL`.
- **files:** `widget/script.js`, `widget/i18n/ru.json`.
- **pattern:** W003 (PoC-код), `research/embed-sdk.md` §2 (параметры), §8.5 (reload).
- **verify:** живьём полный путь на dzenteamdev: настройки → ключ → страница → конструктор; создать flow из iframe; F5 страницы amo → конструктор поднялся заново; уход в другой раздел amo и возврат → без задвоения.

### - [ ] W011 — lcard: кнопка «Автоматизации сделки»
- **spec:** `render()` при `lcard-0`: отрисовать блок виджета в правой колонке карточки сделки — кнопка «Автоматизации», клик ведёт на страницу advanced_settings (точный URL страницы снять живьём в W001/W002 — вида `/settings/widgets/#<code>` — и зашить переход через `location.href`; недокументированные router-хаки не использовать). Пока без данных по конкретной сделке (это W018).
- **files:** `widget/script.js`, `widget/i18n/ru.json`.
- **pattern:** механика правой панели — `research/amo-surfaces.md` §1 (lcard).
- **verify:** живьём: карточка сделки dzenteamdev показывает блок, клик открывает конструктор.

### - [ ] W012 — ALLOWED-каталог pieces
- **spec:** Проставить тег `ru-allowed` на платформе всем pieces ALLOWED-списка (`research/pieces-ru-audit.md`, раздел «Черновой ALLOWED-список»: 45 community + 27 core; `openai`/`claude` НЕ тегировать — требуют прокси, конфликт с zero-setup; `deepseek` тегировать). Механика тегирования — **выяснить по коду и живьём**: `pieceTagService` (EE), admin-эндпоинты тегов pieces, UI Platform Admin. Скрипт `bridge/scripts/tag-pieces.ts`: логин под platform-admin (`POST /v1/authentication/sign-in`; креды — `FORK_ADMIN_EMAIL`/`FORK_ADMIN_PASSWORD` из `bridge/.env`, пароль — в памяти `local-preview-setup`, в скрипт/git не зашивать) → идемпотентно проставить тег по массиву имён (массив — в скрипте, это конфиг, не секрет). JWT моста уже шлёт `piecesFilterType:'ALLOWED'` + `['ru-allowed']` (W007).
- **files:** `bridge/scripts/tag-pieces.ts`.
- **verify:** живьём: embedded-клиент в билдере видит `amocrm`/`telegram-bot`/`deepseek`/`google-sheets`, НЕ видит `notion`/`slack`/`stripe`/`openai`; полный размер каталога зафиксировать в activity.
- **escape:** если тегирование доступно только через UI — проставить руками, скрипт свести к проверке (GET-сверка тегов), пометить в activity.

### - [ ] W013 — Белый бэкдор + хостинг статики виджета
- **spec:** Разнести виджет: `script.js` (идёт в zip) — тонкий AMD-загрузчик, который вычисляет `basePath = localStorage['dzenflow_public_path'] || '<BRIDGE_PUBLIC_URL>/static/widget'` и грузит оттуда `widget-app.js` (вся логика W006/W010/W011 переезжает туда) + `widget-app.css`. Мост: `GET /static/widget/*` раздаёт `bridge/static/widget/` (Fastify static или ручной sendFile — простейшее), заголовки `Cache-Control: no-cache` (итерации важнее кэша, `ponytail:` versioned URLs — upgrade). Загрузчик передаёт в app контекст (`widget_code`, settings, callbacks amo).
- **files:** `widget/script.js` (loader), `bridge/static/widget/{widget-app.js,widget-app.css}` (перенос), `bridge/src/index.ts`.
- **pattern:** память `amocrm-widget-knowledge` (белый бэкдор — подмена public_path через localStorage); Sensei — ленивая подгрузка `constructor.js`.
- **verify:** живьём: без localStorage виджет работает с прод-URL статики; с `localStorage['dzenflow_public_path']` на локальный туннель — грузит локальную правку (изменить текст кнопки, увидеть без перезаливки zip).

### - [ ] V002 — Чекпоинт MVP (W005–W013)
- **spec:** общая спецификация V-задач. Живой сценарий «онбординг с нуля»: снести связку в БД моста → `issue-key` → ввод ключа в виджете → install (origin добавлен: CSP-заголовок; connection создан и валиден) → страница «Автоматизации» → каталог = ALLOWED → создать и включить flow `lead_added → create_task` → создать сделку в amo → задача появилась. Особое внимание: секрет-скан (в блоке появились signing key, amo-токены, FORK_API_KEY — ни один не в git); идемпотентность повторного install; поведение при 403/отсутствии ключа.

---

## Фаза 2 — Автоворонка: DP-шаг и salesbot-шаг (этап 2 PLAN)

### - [ ] W014 — Мост: список flow + приёмник DP-вебхука → запуск flow
- **spec:** (а) `GET /flows?install_key&account_id` — мост обменивает свой embed-JWT на access-token форка (реюз W009), дергает `GET {fork}/v1/flows` проекта (точную форму листинга и фильтр status=ENABLED сверить с контроллером flows), отдаёт `[{id, displayName}]` для flow с webhook-совместимым триггером (`catch_webhook`; если фильтрация по типу триггера из листинга нетривиальна — отдать все включённые, пометить `ponytail:`). (б) `POST /dp?k=<static-секрет из env>` — приёмник DP-вебхука amo: payload по справочнику (`event`, `action.settings.widget.settings.{flow_id}`, `subdomain`, `account_id`); валидация: `k` совпал И `account_id` есть в активных связках (подписи у amo-вебхука нет — `k` в query это наш максимум, зафиксировать); ответ amo — 200 СРАЗУ (быстрый ответ обязателен), затем асинхронно: проверить, что `flow_id` принадлежит проекту ЭТОГО `account_id` (по листингу flow проекта из (а); чужой flow_id → событие отброшено с логом — иначе подмена settings запускает flow чужого клиента), и `POST {fork}/api/v1/webhooks/{flowId}` с телом `{source:'amocrm_dp', event, account_id, subdomain}` → flow стартует. Access-token форка на аккаунт кэшировать в памяти (живёт 7 дней; сброс кэша на 401) — не обменивать JWT на каждый запрос.
- **files:** `bridge/src/{flows.ts,dp.ts,fork-client.ts}` + тесты (валидация payload, отказы).
- **pattern:** формы payload — справочник (DP-блок); webhook-запуск flow — `/api/v1/webhooks/{flowId}` (публичный эндпоинт webhook-триггеров форка).
- **verify:** tsc + vitest; живьём на превью: curl-эмуляция DP-payload → flow-run появился в проекте (запуск через webhook-URL подтверждён).

### - [ ] W015 — Manifest DP-блок + dpSettings-плашка выбора flow
- **spec:** manifest: добавить `digital_pipeline` в locations + `dp`-блок: `settings: { flow_id: {type:'text', required:true} }`, `action_multiple:false`, `webhook_url:'https://<мост>/dp?k=...'`; `images/logo_dp.png` 174×109. `widget-app.js`: `dpSettings($el)` — рендер селекта flow (данные из `GET /flows` моста), выбор пишется в поле `flow_id` формы шага. **Механику записи значения в поле шага снять с боевого кода** (`reference/triggeron/widget/script.js`, как Triggeron заполняет `dp_rule`) — это главный неочевидный момент задачи. Собрать на dzenteamdev автоворонку: этап → наш шаг → выбран flow.
- **files:** `widget/manifest.json`, `widget/i18n/ru.json`, `widget/images/logo_dp.png`, `bridge/static/widget/widget-app.js`.
- **pattern:** `reference/triggeron/widget/manifest.json` (dp-блок), `reference/triggeron/widget/script.js` (dpSettings).
- **verify:** живьём (снимает вопрос формы payload): сделка переходит в этап на dzenteamdev → amo шлёт POST на мост (туннель) → flow запустился; фактический payload DP записать в activity (сверить со справочником, расхождения — поправить W014).

### - [ ] W016 — Salesbot-шаг
- **spec:** manifest: добавить `salesbot_designer` в locations + блок `salesbot_designer: { logo, start_flow: { name, settings: { flow_id: {name, type:'text', manual:true, required:true} } } }` (по образцу BPMN `start_bp`). `widget-app.js`: `salesbotDesignerSettings` — рендер выбора flow (реюз селекта W015), return `{exits:[{code:'success',title:'…'},{code:'fail',title:'…'}]}`; `onSalesbotDesignerSave` — вернуть JSON логики шага: вызов нашего handler-URL (`https://<мост>/salesbot?k=...`) с `{flow_id}` + маппинг exits. **Точный формат JSON (widget_request-шаг salesbot) и формат ответа handler — открытый вопрос:** восстановить из разобранной копии BPMN (`reference/bpmn/`) и подтвердить живьём. Мост: `POST /salesbot` — как `/dp` (валидация + запуск flow), ответ в формате, который salesbot ожидает для выбора exit (fire-and-forget → сразу exit `success`).
- **escape:** если формат ответа handler не восстановится из референса/живых проб — оставить «выстрелил и забыл» (мгновенный success), пометить в activity, ветвление по результату flow — upgrade.
- **files:** `widget/manifest.json`, `widget/i18n/ru.json`, `bridge/static/widget/widget-app.js`, `bridge/src/salesbot.ts` + тест.
- **pattern:** `reference/bpmn/widget/manifest.json` (`salesbot_designer.start_bp` c manual-полями), `research/amo-surfaces.md` §1 (salesbot_designer).
- **verify:** живьём: сценарий salesbot на dzenteamdev с нашим шагом → запуск бота на сделке → flow запустился; фактические формы JSON записаны в activity.

### - [ ] W017 — Надёжность DP-пути: дедуп + очередь при недоступном форке
- **spec:** (а) выяснить живьём поведение ретраев amo DP-вебхука (таймаут ответа, повторы при не-200) — записать в activity; (б) дедуп на мосту: таблица `processed_events` (ключ: hash от `account_id+flow_id+event.time+entity_id`, TTL сутки, чистка при вставке) — повторный вебхук не даёт второго запуска; (в) недоступный форк: мост всё равно отвечает amo 200, событие ложится в таблицу `pending_launches`, фоновый цикл (`setInterval`, каждые 30с, до 20 попыток) дожимает запуск — сделки клиента не теряют автоматизацию при рестарте форка. `ponytail:` очередь = таблица SQLite + interval; BullMQ/красивый шедулер — когда упрёмся.
- **files:** `bridge/src/{dp.ts,queue.ts}` + тесты (дедуп, ретрай-цикл на моке fork-client).
- **verify:** tsc + vitest; живьём: два быстрых перехода этапа подряд → ровно два запуска (разные события не слиплись); повтор одного события → один запуск; форк погашен → событие дожато после его старта (насколько стенд позволит; результат в activity).

### - [ ] V003 — Чекпоинт автоворонки (W014–W017)
- **spec:** общая спецификация V-задач. Живой сценарий: воронка dzenteamdev с DP-шагом + salesbot-сценарий; сделка проходит этап и бота → оба запуска отработали, дублей нет. Особое внимание: фактические payload'ы DP/salesbot зафиксированы в activity (не «по справочнику»); `k`-секрет не в git (webhook_url в манифесте содержит его — проверить, что в манифест зашит placeholder/прод-значение обдуманно: секрет в манифесте виден админам аккаунта — приемлемо, зафиксировать решение).

---

## Фаза 3 — Карточка сделки и мобильная (этап 3 PLAN)

### - [ ] W018 — card_sdk-вкладка: статус автоматизаций сделки
- **spec:** manifest: добавить `card_sdk` (требует объявленного `lcard-0` — уже есть). Вкладка в карточке сделки: (1) список последних ранов flow проекта — мост `GET /runs?install_key&account_id` → `GET {fork}/v1/flow-runs` (форму листинга сверить с контроллером); честное ограничение MVP: раны не фильтруются по конкретной сделке (ран не знает lead_id) — показываем последние раны проекта с пометкой в UI, `ponytail:` фильтр по сделке — upgrade (нужна конвенция передачи lead_id в flow); (2) кнопка «Запустить» у webhook-flow (список из `GET /flows` W014) → `POST /run {install_key, account_id, flow_id, lead_id}` на мосту → сверка связки + принадлежности flow проекту аккаунта (реюз проверки W014) → webhook-запуск с `{source:'amocrm_card', lead_id, manual:true}`. UI — vanilla JS/CSS в `widget-app.js`, размеры вкладки снять живьём.
- **escape:** если card_sdk-вкладка окажется жёстко заточенной под товарные Promise-коллбеки (`loadElements` и др.) и произвольный контент туда не встаёт — fallback: тот же UI обычным блоком в `lcard`-панели, пометить в activity.
- **files:** `widget/manifest.json`, `bridge/static/widget/widget-app.js`, `bridge/src/{runs.ts,run.ts}` + тест.
- **pattern:** `research/amo-surfaces.md` §1 (card_sdk: коллбеки, требование lcard-0), §2(б).
- **verify:** живьём: вкладка в карточке сделки dzenteamdev показывает раны; ручной запуск flow с карточки создаёт ран с `lead_id` в payload.

### - [ ] W019 — mobile.frame_url: мобильная страница
- **spec:** manifest: `mobile: { frame_url: 'https://<мост>/mobile/card', color }`. Мост: `GET /mobile/card` — простая серверная HTML-страница (без SPA). **Контракт не задокументирован (открытый вопрос №4 RESEARCH):** первым делом залогировать на мосту ВСЕ query-параметры и заголовки, которые amo передаёт в frame_url (какие id аккаунта/сделки/юзера доступны), зафиксировать в activity. **Безопасность (жёстко):** URL публичный, query-параметры без подписи подделываемы — страница по умолчанию показывает ТОЛЬКО статическую справку («полный конструктор — в веб-версии»), данные ранов выводить ЗАПРЕЩЕНО, пока контракт не даст верифицируемый признак аккаунта (подпись/секрет); если даст — сверять с активной связкой, как в `/dp`.
- **escape:** мобильного стенда нет / параметры не содержат account_id — отдать статическую справочную страницу, контракт пометить неснятым; задача считается выполненной по коду, живая часть добирается в V004.
- **files:** `widget/manifest.json`, `bridge/src/mobile.ts`.
- **pattern:** `reference/triggeron/widget/manifest.json` (`mobile.frame_url` + `color`).
- **verify:** страница открывается браузером; живьём в мобильном приложении amo — если доступно (результат/недоступность — в activity).

### - [ ] V004 — Финальный чекпоинт этапов 0–3 (W018–W019 + полный регресс)
- **spec:** общая спецификация V-задач, плюс: (1) полный регресс V002-сценария (онбординг с нуля) + DP + salesbot + card_sdk + мобильная страница; (2) секрет-скан ВСЕЙ ветки (`git log -p feature/amocrm-piece.. | grep -cE 'eyJ0|BEGIN (RSA )?PRIVATE KEY'` = 0); (3) написать `amocrm-app/README.md`: как собрать zip, поднять мост (env-таблица), процедура онбординга клиента по шагам (issue-key → установка → проверка), белый бэкдор; (4) сводка неснятых вопросов из activity — перенести в «Открытые вопросы» этого файла.

---

## Вне цикла (сознательно НЕ входит)

- **Этап 4 — публичная интеграция:** техаккаунт, OAuth2 вместо install-ключа, amo user-session JWT (самообслуживание), тур-картинки, модерация (полный ре-ревью на каждое изменение), `widget_page` как главный вход, «свой каталог внутри одного виджета». Отдельная дорожка после отладки managed-потока.
- **Этап 5 — RU-pieces** (MAX/VK, телефония, платежи, Яндекс, 1С/МойСклад…): ночной цикл ralph, отдельный PRD.
- **Баги piece amoCRM** (находки W004): дорожка ralph (`ralph/prd.md`), здесь только фиксация.
- **Правки ядра форка** (embed-sdk, дизайн-токены/whitelabel внутри iframe, недостающие эндпоинты): отдельная дорожка по конвенциям CLAUDE.md; из этого цикла — только BLOCKED-фиксация потребности.
- **Прод-эксплуатация:** деплой моста на хостинг РФ, биллинг, мониторинг, шифрование amo-токенов в БД моста — после MVP, по `PLAN.md` («Инфраструктура и эксплуатация»).

## Открытые вопросы

- Формат amo user-session JWT и его внешняя валидация (нужен для этапа 4 самообслуживания; RESEARCH §7.3).
- «Публичная, но не в каталоге» интеграция — существует ли статус published-unlisted (§7.5).
- Лимит размера widget.zip (спросить поддержку при подготовке публички; для тонкого загрузчика неактуально).
- Ретраи/таймауты DP-вебхука amo — снимается в W017.
- Формат JSON salesbot-шага (`onSalesbotDesignerSave`) и ответа handler — снимается в W016.
- Контракт `mobile.frame_url` (передаваемые параметры) — снимается в W019.
- Конвенция передачи `lead_id` в flow для фильтрации ранов по сделке (upgrade W018).
- Ре-пауза движка (spike T038 ночного цикла) — влияет на wait-механики DP-сценариев; следить за вердиктом в `ralph/activity.md`.
- Детект тёмной темы amo для `styling.mode` — подбирается живьём в W010.
