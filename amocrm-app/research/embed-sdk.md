# Embedding-стек Activepieces: что умеет наш форк и что нужно для amoCRM-виджета

Дата: 2026-07-11. Исследован код в `/Users/tihn/Zen-flow` (ветка `feature/amocrm-piece`), сверен с `docs/embedding/*.mdx`. Актуальная версия клиентского SDK в коде — **0.13.0** (`packages/ee/embed-sdk/src/index.ts:200`), документация соответствует этой же версии (не отстаёт).

---

## 1. Архитектура embedding'а

```
amo-виджет (JS, работает в iframe amoCRM внутри карточки/списка)
        │  <script src=".../embed/<version>.js">  → создаёт window.activepieces
        │  activepieces.configure({ instanceUrl, jwtToken, embedding, prefix })
        ▼
window.activepieces (класс ActivepiecesEmbedded, packages/ee/embed-sdk/src/index.ts)
        │  создаёт <iframe src="{instanceUrl}/embed?currentDate=...">
        │  и кладёт его в containerId
        ▼
наш web-фронт в embed-режиме (packages/web/src/app/routes/embed/index.tsx — EmbedPage)
        │  на маунте шлёт CLIENT_INIT родителю → получает VENDOR_INIT (jwtToken + все styling/hide-параметры)
        │  POST /v1/managed-authn/external-token { externalAccessToken: jwtToken }
        ▼
managedAuthnController (packages/server/api/src/app/ee/managed-authn/managed-authn-controller.ts)
        │  верифицирует JWT подписью platform signing key (RS256, kid из заголовка)
        │  провижинит/находит Project (по externalProjectId) и User (по externalUserId)
        │  выдаёт собственный access-token (7 дней) — обычный принципал USER
        ▼
EmbedPage сохраняет токен в authenticationSession, роутит на нужный route,
шлёт родителю CLIENT_AUTHENTICATION_SUCCESS → CLIENT_CONFIGURATION_FINISHED
```

Ключевая идея: **amo-виджет не хранит долгоживущие креды amoCRM-пользователя в Activepieces** — он на своём бэкенде (там, где известен amoCRM `account_id`/`user_id`) подписывает короткоживущий JWT приватным ключом signing-key и передаёт его в SDK. Наш фронт обменивает этот JWT на полноценную сессию через публичный (`securityAccess.public()`) эндпоинт `/v1/managed-authn/external-token`.

Общение iframe ↔ родитель идёт исключительно через `window.postMessage` с проверкой `event.source` (и `event.origin` только для самого первого `CLIENT_INIT`/`VENDOR_INIT` рукопожатия) — см. ниже пробелы/риски (п.7) про origin-проверки на последующих сообщениях.

---

## 2. Полный справочник параметров SDK (`ee-embed-sdk`, версия 0.13.0)

### `activepieces.configure(params)` — `ConfigureParams` (`index.ts:182-187`)

| Параметр | Обязателен | Тип | Что делает |
|---|---|---|---|
| `instanceUrl` | да | string | URL нашего инстанса (напр. `https://flows.dzen.team`). Из него строится src iframe и base для REST-запросов. |
| `jwtToken` | да | string | Короткоживущий JWT, подписанный signing key (см. раздел 3). |
| `prefix` | нет | string | Префикс для фичи "Automatically Sync URL" — не URL-маршрутизация как таковая, а сдвиг при `extractActivepiecesRouteFromUrl`. |
| `embedding` | нет | `EmbeddingParam` | Всё остальное — стилизация, скрытие UI, коллбэки. |

Если передан `embedding.containerId` — SDK сам создаёт iframe внутри контейнера и резолвит промис `configure()` только после `CLIENT_CONFIGURATION_FINISHED` (т.е. после реальной аутентификации, не раньше). Если `containerId` не передан — `configure()` только сохраняет состояние (используется, когда сам host создаёт iframe вручную, напр. для `connect`/`mcpSettings` без основного дашборда).

### `EmbeddingParam` — все под-поля (`index.ts:151-181`)

- `containerId?: string` — id HTML-элемента-контейнера для основного iframe (дашборд + билдер).
- `styling.fontUrl?`, `styling.fontFamily?` — кастомный шрифт; **работают только вместе** (если задать одно без другого — используется дефолтный `Roboto`).
- `styling.mode?: 'light' | 'dark'` — форс light/dark темы независимо от системной.
- `locale?: string` — ISO 639-1, поддерживается список включая `ru` (en/nl/de/fr/es/ja/zh/pt/zh-TW/ru — актуальный список из `embed-builder.mdx:87`). Для amoCRM (русскоязычные клиенты) — критично передавать `'ru'`.
- `builder.disableNavigation?: boolean | 'keep_home_button_only'` — прячет имя папки/домашнюю кнопку/удаление флоу в билдере; `'keep_home_button_only'` оставляет только home-кнопку.
- `builder.hideFlowName?: boolean` — прячет имя флоу и дропдаун действий в хедере билдера.
- `builder.homeButtonClickedHandler?: (data: {route: string}) => void` — переопределяет клик по home-кнопке (не уходит на дашборд, а зовёт коллбэк). Внутри шлётся `CLIENT_BUILDER_HOME_BUTTON_CLICKED`.
- `builder.homeButtonIcon?: 'back' | 'logo'` — `'back'` убирает тултип с домашней кнопки (полезно, если она встроена в шапку виджета amo как "назад").
- `dashboard.hideSidebar?: boolean` — прячет боковую панель.
- `dashboard.hideFlowsPageNavbar?: boolean` — прячет навбар (Flows/Issues/Runs) над таблицей флоу.
- `dashboard.hidePageHeader?: boolean` — прячет page header дашборда целиком.
- `hideExportAndImportFlow?: boolean`, `hideDuplicateFlow?: boolean`, `hideFolders?: boolean` — точечные скрытия action'ов.
- `hideTables?: boolean` — прячет весь UI Tables (дерево, фильтр Type, кнопки Create/Import, пустое состояние, глобальный поиск) и **блокирует прямой заход на `/tables/:id`**. Piece Tables внутри флоу не затрагивается.
- `hideActiveUsers?: boolean` — прячет presence-аватарки в хедере билдера и редактора таблиц; сам embedded-юзер перестаёт появляться в списке коллабораторов у других.
- `hideGlobalSearch?: boolean` — прячет кнопку глобального поиска в сайдбаре и отключает `Cmd/Ctrl+K`.
- `navigation.handler?: (data: {route: string}) => void` — вызывается на каждый `CLIENT_ROUTE_CHANGED` из iframe; получает route уже с учётом `prefix`.

Всё это транслируется в `VENDOR_INIT` сообщение (`index.ts:290-317`) с дефолтами `false`/`'logo'`/`'en'`, которое SDK шлёт в ответ на первый `CLIENT_INIT` от iframe.

### Методы объекта `activepieces`

- **`connect({ pieceName, connectionName?, newWindow? })`** (`index.ts:408-439`) — открывает диалог создания коннекшена (оверлей-iframe на весь `document.body` либо popup-окно, если передан `newWindow`). Возвращает Promise `{ connection?: { id, name } }` (`name` = externalId). `connectionName` — externalId коннекшена; если существующий с таким externalId уже есть — переиспользуется/переподключается, а не создаётся новый.
- **`navigate({ route })`** (`index.ts:442-454`) — шлёт `VENDOR_ROUTE_CHANGED` в уже смонтированный дашборд/билдер iframe. Список поддерживаемых route: `/flows`, `/flows/{flowId}`, `/runs`, `/runs/{runId}`, `/connections`, `/tables`, `/tables/{tableId}`, `/todos`, `/todos/{todoId}` (`docs/embedding/navigation.mdx:55-67`).
- **`extractActivepiecesRouteFromUrl({ vendorUrl })`** (`index.ts:602-604`) — утилита для "Automatically Sync URL": вырезает internal-route из текущего URL хоста с учётом `prefix`, используется вместе с `navigate` в обработчике `popstate`.
- **`mcpSettings()`** (`index.ts:461-474`) — оверлей-iframe с настройками MCP (URL подключения, тулы, экспонируемые флоу) для проекта embedded-юзера.
- **`authorizeMcp({ authRequestId })`** (`index.ts:482-497`) — показывает попап согласия на MCP OAuth; резолвится `{ redirectUrl }` (approve) или `{ denied: true }`.
- **`generateMcpToken()`** (`index.ts:506-512`) — без полного OAuth: дергает `POST /projects/{projectId}/mcp-server/token` с обменянным embed-токеном, возвращает `{ mcpServerUrl, mcpToken }`. Токен живёт **15 минут**, скоуплен на конкретный `externalProjectId`.
- **`request({ path, method, body?, queryParams? })`** (`index.ts:748-764`) — прокси на `{instanceUrl}/api/v1/{path}`, сам подставляет `Authorization: Bearer <обменянный токен>` (через внутренний `fetchEmbeddingAuth`, кэшируется в `_embeddingAuth`). Поддерживает GET/POST/PUT/DELETE/OPTIONS/PATCH/HEAD.

### Vendor↔Client события (postMessage)

Клиент → SDK (`ActivepiecesClientEventName`, `index.ts:3-18`): `CLIENT_INIT`, `CLIENT_ROUTE_CHANGED`, `CLIENT_NEW_CONNECTION_DIALOG_CLOSED`, `CLIENT_SHOW_CONNECTION_IFRAME`, `CLIENT_CONNECTION_NAME_IS_INVALID`, `CLIENT_AUTHENTICATION_SUCCESS`, `CLIENT_AUTHENTICATION_FAILED`, `CLIENT_CONFIGURATION_FINISHED`, `CLIENT_CONNECTION_PIECE_NOT_FOUND`, `CLIENT_BUILDER_HOME_BUTTON_CLICKED`, `CLIENT_SHOW_MCP_IFRAME`, `CLIENT_MCP_SETTINGS_DIALOG_CLOSED`, `CLIENT_MCP_OAUTH_APPROVED`, `CLIENT_MCP_OAUTH_DENIED`.

SDK → клиент (`ActivepiecesVendorEventName`): `VENDOR_INIT`, `VENDOR_ROUTE_CHANGED`.

Проверка источника: для основного iframe все хендлеры фильтруют `event.source === targetWindow`; **origin строго проверяется только в самом первом `_setupInitialMessageHandler`** (`event.origin === new URL(this._instanceUrl).origin`, `index.ts:289`) — остальные `postMessage` вызовы (в т.ч. исходящие от SDK к iframe) используют wildcard `'*'` как target origin (`index.ts:317, 405, 453`), что нормально, т.к. `source`-проверка достаточна для входящих.

---

## 3. Серверные требования: генерация JWT нашим (amo-виджет-владельца) бэкендом

### 3.1 Signing key

- Создаётся в **Platform Settings → Security → Embedding → Signing Keys** (UI: `packages/web/src/app/routes/platform/security/embed/steps/signing-keys-step.tsx`, API: `packages/server/api/src/app/ee/signing-key/signing-key-controller.ts` + `signing-key-service.ts:9-27`).
- `signingKeyGenerator.generate()` создаёт RSA key-pair; **приватный ключ отдаётся один раз при создании и нигде не хранится на нашей стороне** (`signing-key-service.ts:21-26`) — его нужно сохранить в секретах amo-приложения немедленно.
- `kid` (значение для JWT-заголовка) — это `id` записи в таблице `signing_key`, показывается в UI таблицы.
- Эндпоинт создания/удаления signing key гейтится `platformMustHaveFeatureEnabled((platform) => platform.plan.embeddingEnabled)` (`packages/server/api/src/app/ee/signing-key/signing-key-module.ts:6`) — то есть **без флага плана `embeddingEnabled` ключ вообще не создать**.

### 3.2 Формат и claims JWT (`external-token-extractor.ts:123-151`, схема `ExternalTokenPayload`, union v2/v3)

Заголовок:
```json
{ "alg": "RS256", "typ": "JWT", "kid": "<signingKeyId>" }
```

Обязательные поля (базовые, `v1`):
- `externalUserId: string` — id пользователя amoCRM-аккаунта в нашей системе координат.
- `externalProjectId: string` — id "проекта" (обычно = amoCRM `account_id`/поддомен) — по нему находится/создаётся `Project`.
- `firstName`, `lastName: string`.

Опциональные (`v2`):
- `role?: DefaultProjectRole` — **enum: `'Admin' | 'Editor' | 'Viewer'`** (`packages/core/shared/src/lib/management/project/project-member.ts:1-5`). Если не передан — дефолт `EDITOR` (`external-token-extractor.ts:117-120`).
- `pieces?: { filterType: PiecesFilterType, tags?: string[] }` — устаревший (v2) формат фильтра пиcsов.
- `concurrencyPoolKey?: string` + `concurrencyPoolLimit?: number` — проекты с одинаковым ключом делят один concurrency-пул.
- `exp` — обязательно короткий TTL (документация советует ~1 час, это одноразовый обменный токен, не сессионный).
- `projectDisplayName?: string` — если передан, при каждом обмене обновляет `displayName` проекта (`managed-authn-service.ts:30-35`).
- `tasks`, `aiCredits` — упомянуты в доке (`provision-users.mdx:56-73`) как лимиты, но **в самой `ExternalTokenPayload` схеме (`external-token-extractor.ts`) их нет** — они, судя по всему, обрабатываются в другом (EE billing) слое лимитов проекта, не в managed-authn напрямую. Не полагаться на них как на часть публичного контракта без проверки актуального биллингового кода.

Новый формат (`v3`, предпочтительный):
- `version: 'v3'`
- `piecesFilterType?: PiecesFilterType` — **enum: `'NONE' | 'ALLOWED'`** (`project.ts:19-22`), заменяет вложенный `pieces.filterType`.
- `piecesTags?: string[]` — заменяет `pieces.tags`.

`PiecesFilterType.ALLOWED` + `piecesTags` → в проект синхронизируются только пиcсы с указанными тегами (`managedAuthnService.updateProjectLimits` → `pieceTagService.findByPlatformAndTags`, `managed-authn-service.ts:102-114, 185-201`). `NONE` — фильтр не применяется (пустой массив разрешённых, т.е. фактически "не ограничивать" — проверить семантику `projectLimitsService.upsert` отдельно, если нужен строгий белый список).

### 3.3 Что делает `POST /v1/managed-authn/external-token` при обмене (`managed-authn-service.ts:18-90`)

1. Верифицирует JWT публичным ключом signing key по `kid` (RS256, `issuer: null` — issuer не проверяется).
2. `getOrCreateProject` по `(platformId, externalProjectId)` — если нет, создаёт `Project` с `displayName = externalProjectId`, `ownerId = platform.ownerId`, `type: TEAM`.
3. Если задан `projectDisplayName` — обновляет имя проекта.
4. Если заданы `concurrencyPoolKey/Limit` — upsert пула concurrency и назначение проекту.
5. Обновляет лимиты пиcсов проекта (`updateProjectLimits`) согласно `piecesFilterType`/`piecesTags`.
6. `getOrCreateUser` по `(platformId, externalUserId)` — email identity генерируется детерминированно как `sha256("managed_{platformId}_{externalUserId}")` (`generateEmailHash`, `managed-authn-service.ts:203-206`), провайдер `UserIdentityProvider.JWT`, пароль — случайный (юзер никогда логинится паролем).
7. `projectMemberService.upsert` — привязывает user к project с ролью `projectRole` (из `role` claim или дефолт `EDITOR`).
8. Генерирует собственный `accessTokenManager` токен на **7 дней** (`PrincipalType.USER`), возвращает вместе с `projectId`, `platformId` и профилем.

Важно: `getOrCreateUser`/`getOrCreateProject` **идемпотентны по внешним id** — повторный вызов с тем же `externalUserId`/`externalProjectId` не создаёт дублей, просто логинит существующего юзера. Это и есть авто-провижининг "если юзера/проекта нет — создать, если есть — просто войти", как описано в `provision-users.mdx:13`.

### 3.4 Эндпоинт `/v1/managed-authn/external-token` сам по себе не гейтится `embeddingEnabled`

`managed-authn-module.ts` регистрирует контроллер без `platformMustHaveFeatureEnabled` хука (в отличие от `embed-subdomain.module.ts` и `signing-key-module.ts`, которые явно проверяют `platform.plan.embeddingEnabled`). На практике это не открывает дыру, потому что без включённого флага **нельзя создать сам signing key** (эндпоинт создания ключа гейтится) — а без валидного `kid`/ключа обмен токена всё равно упадёт на `INVALID_BEARER_TOKEN`. Тем не менее стоит иметь в виду при аудите: сам provisioning-эндпоинт формально публичен всегда.

---

## 4. Веб-сторона: как фронт понимает, что он в embed-режиме

- **`EmbeddingProvider`** (`packages/web/src/components/providers/embed-provider.tsx:5-26`) — React-контекст с состоянием `EmbeddingState` (default `isEmbedded: false`). Все `hideX`/`disableX` флаги живут здесь, читаются компонентами через `useEmbedding()`.
- Заполняется контекст **только** в `EmbedPage` (`packages/web/src/app/routes/embed/index.tsx:130-165`) при получении `VENDOR_INIT` — синхронно через `flushSync` (чтобы правильный router успел смонтироваться до навигации).
- `useDarkBackground` — спец-логика: `true`, если открыт как popup (`window.opener !== null`, `embed-provider.tsx:37`) либо начальный route — `/embed/connections*` (`embed/index.tsx:146-147`) — визуально даёт затемнённый фон под оверлей-диалогом.
- Реальное сокрытие UI разбросано по компонентам, которые вызывают `useEmbedding()` — из списка находок: `sidebar-header.tsx`, `flow-actions-menu.tsx`, `sidebar/dashboard/index.tsx`, `builder-header.tsx`, `global-search-command.tsx`, `project-dashboard-layout-header.tsx` и др. (полный список — grep `isEmbedded|embedState` по `packages/web/src`, см. вывод выше). Каждый читает нужный флаг (`hideSideNav`, `hideGlobalSearch`, ...) и условно не рендерит элемент — то есть **это не CSS-скрытие, а полное отсутствие в DOM/логике** (например, `hideTables` реально блокирует роут, а не просто прячет пункт меню).
- Шрифты: отдельный компонент `embedding-font-loader.tsx` — динамически подключает `fontUrl`/`fontFamily` из `embedState`.
- Роутинг: `memoryRouter` (in-memory, не history-based) — поэтому navigate/CLIENT_ROUTE_CHANGED не трогают native browser history сами по себе (см. `navigation.mdx` — почему нужен ручной sync через `navigation.handler` + `popstate`).

---

## 5. Флаги планов и precondition'ы

| Флаг/сущность | Где проверяется | Эффект |
|---|---|---|
| `platform.plan.embeddingEnabled` | `embed-subdomain.module.ts:6`, `signing-key-module.ts:6`; на фронте — множество мест (`sidebar/platform/index.tsx:110`, `project-settings/index.tsx:105`, `routes/platform/security/embed/index.tsx:123`, `features-status.tsx:18` и др.) | Без него: нельзя создать signing key, нельзя настроить embed-subdomain (только Cloud), UI раздела "Embedding" в Platform Settings показывает `LockedFeatureGuard`. **`/v1/managed-authn/external-token` сам по себе не проверяет флаг** (см. 3.4). |
| `AP_EDITION` | — | Embedding — EE-фича (`<Snippet file="enterprise-feature.mdx" />` на всех страницах доки). На чистой CE без EE-лицензии Platform Settings → Security → Embedding недоступен в принципе. У нас (см. память `licensing-dzen-fork`) EE открыт без ключей — значит функционально доступно, но плановый флаг `embeddingEnabled` на платформе всё равно должен быть включён отдельно. |
| DNS/Cloudflare embed-subdomain (Cloud only) | `embed-subdomain.controller.ts` + `embed-subdomain.service.ts` (Cloudflare Custom Hostnames) | На **self-hosted** этот шаг не нужен (`configure-embedding.mdx:11` — "self-hosted Enterprise, только шаги 3 и 4"). Для нашего self-hosted форка актуальны только: (3) allowed origins и (4) signing key. |
| `platform.allowedEmbedOrigins` | `platform.entity.ts:68`, читается в `embed-security.ts` | Список origin'ов, которым разрешено фреймить инстанс (см. п.6). |

---

## 6. CORS / frame-ancestors: кто может встроить наш iframe

Реализовано в `packages/server/api/src/app/helper/embed-security.ts` + подключено в `packages/server/api/src/app/server.ts:136-145` (`onSend`-хук, применяется **ко всем ответам**, не только к embed-роуту):

```
Content-Security-Policy: frame-ancestors 'self' <origin1> <origin2> ...
```

Источник списка origin'ов (`embed-security.ts:23-59`):
1. `AP_ALLOWED_EMBED_ORIGINS` — env var, список через запятую, парсится и валидируется как origin (`isValidOrigin` — должен быть ровно `new URL(x).origin`, без пути).
2. Для Cloud: смотрит платформу по hostname через `embed-subdomain` таблицу, потом её `platform.allowedEmbedOrigins`.
3. Для self-hosted: берёт **самую старую платформу** (`getOldestPlatform()`) и её `allowedEmbedOrigins`.
4. Мержит с env-списком, кэширует в LRU на 3 минуты.
5. **Если список пуст → `frame-ancestors 'self'`** — то есть по умолчанию embedding из стороннего origin (например, `*.amocrm.ru`) **заблокирован браузером**, пока явно не добавлен origin.

Управление списком:
- UI: Platform Settings → Security → Embedding → "Add allowed websites" (шаг 3 в `configure-embedding.mdx`).
- API: `POST /v1/embed-subdomain/allowed-embed-origins` (`embed-subdomain.controller.ts:23-32`) — **эндпоинт для service-принципала** (`securityAccess.publicPlatform([PrincipalType.SERVICE])`), мержит переданные origins с существующими (без дублей), не требует пользовательской сессии — удобно дергать из CI/provisioning-скрипта amo-приложения.
- Или через env `AP_ALLOWED_EMBED_ORIGINS` на self-hosted (мержится с UI-списком, не заменяет).

**Для amo-виджета: origin, с которого грузится страница карточки amoCRM (обычно `https://<поддомен>.amocrm.ru`), должен быть в этом списке**, иначе браузер откажется рендерить наш `<iframe>` из-за CSP `frame-ancestors`, независимо от того, что делает сам SDK.

---

## 7. Чек-лист: что должен сделать amo-виджет, чтобы открыть конструктор

1. **Подготовка (один раз, на нашей стороне, в Platform Settings)**
   - Включить `platform.plan.embeddingEnabled` (флаг плана — если он платный, убедиться что включён на нашем self-hosted инстансе, лицензии у нас свои, см. память `licensing-dzen-fork`).
   - Создать signing key (Security → Embedding → Signing Keys), сохранить приватный ключ + `kid` в секретах бэкенда amo-приложения (Activepieces не хранит приватный ключ повторно).
   - Добавить origin страницы amoCRM (`https://<аккаунт>.amocrm.ru` и/или наш собственный embedding-домен, если виджет открывается в собственном iframe amoCRM) в `allowedEmbedOrigins` — через UI или `POST /v1/embed-subdomain/allowed-embed-origins`.
2. **На бэкенде amo-виджета (при каждом открытии конструктора пользователем amoCRM)**
   - Определить `externalUserId` (amoCRM `user_id`) и `externalProjectId` (amoCRM `account_id`/поддомен).
   - Подписать JWT RS256 приватным ключом, `kid` = signing key id, claims минимум: `version: 'v3'`, `externalUserId`, `externalProjectId`, `firstName`, `lastName`, короткий `exp` (~1 час), опционально `role`, `piecesFilterType`/`piecesTags` (если нужно ограничить набор pieces для клиента), `concurrencyPoolKey/Limit` (если нужен общий rate-limit на аккаунт amoCRM).
   - Передать JWT в JS-виджет (например, через данные, которые amo передаёт в iframe виджета, или отдельным AJAX-запросом с бэкенда виджета).
3. **В самом JS-виджете amoCRM (клиентский код внутри iframe карточки/страницы amo)**
   - Подключить `<script src="https://.../sdk/embed/0.13.0.js">` (без `async`/`defer`).
   - Вызвать `activepieces.configure({ instanceUrl, jwtToken, embedding: { containerId, locale: 'ru', styling: {...}, dashboard: {...}, builder: {...}, navigation: { handler } } })`.
   - Дождаться резолва промиса `configure()` (означает: iframe создан, `CLIENT_CONFIGURATION_FINISHED` получен, пользователь аутентифицирован и залогинен).
   - (Опционально) подписаться на `navigation.handler` + `popstate`/`extractActivepiecesRouteFromUrl`, если нужен sync URL amoCRM ↔ внутренний route конструктора.
   - (Опционально) использовать `activepieces.navigate({ route })` для открытия конкретного флоу/раздела сразу.
   - (Опционально) `activepieces.connect(...)`, `mcpSettings()`, `authorizeMcp(...)`, `generateMcpToken()`, `request(...)` — по необходимости фичи.

---

## 8. Пробелы и риски

1. **`v1/managed-authn/external-token` не гейтится `embeddingEnabled` на уровне модуля** (только косвенно через невозможность создать signing key) — не критично, но стоит держать в уме при security-ревью: если когда-то появится способ получить валидный `kid`/ключ в обход UI, endpoint не остановит запрос сам.
2. **`role` в JWT не валидируется по списку — а резолвится через `projectRoleService.getOneOrThrow({ name: payload.role, platformId })`** (`external-token-extractor.ts:110-116`): если такой роли на платформе нет, обмен упадёт с ошибкой (не тихим фолбэком на `EDITOR`), это будет только когда `role` явно передан и не найден — стоит на стороне amo-виджета всегда передавать одно из `Admin/Editor/Viewer` либо не передавать вовсе.
3. **`tasks`/`aiCredits` claims упомянуты в `provision-users.mdx`, но отсутствуют в актуальной Zod-схеме `ExternalTokenPayload`** (`external-token-extractor.ts`) — документация здесь может быть про billing-надстройку, которая не входит в исследованный managed-authn слой; перед тем как полагаться на них для лимитов amo-клиентов, нужно отдельно проверить EE billing/limits код (`project-plan`/`projectLimitsService`), не покрытый этим отчётом.
4. **CSP `frame-ancestors` по умолчанию — `'self'`** (см. п.6): пока origin amoCRM явно не добавлен в `allowedEmbedOrigins`, виджет физически не встроится (браузер заблокирует iframe) — это первое, что нужно проверить, если "конструктор не открывается" в интеграции.
5. **`EmbeddingProvider`/`EmbedPage` работают только внутри маршрута `/embed`** — сам конструктор при этом рендерится в `memoryRouter` (не в history API), поэтому deep-link/refresh страницы **внутри iframe** не переживёт reload без повторного `configure()`/`VENDOR_INIT` от родителя; это ожидаемо для embedding-моделей такого типа, но important для UX виджета (не полагаться на `F5` внутри iframe).
6. **Дизайн-токены/канвас билдера не настраиваются через SDK** — из параметров стилизации есть только `fontUrl`/`fontFamily` и light/dark `mode`; кастомизация цветовой схемы, брендинга кнопок и т.п. **не предусмотрена** embed SDK (в отличие от appearance-настроек платформы, которые видны только самому владельцу инстанса, не embedded-пользователю). Если нужен полноценный whitelabel внутри iframe под amoCRM — это отдельная (не покрытая SDK) задача.
7. **Origin-проверка на исходящих `postMessage` использует `'*'`** (не строгий target origin) — стандартная практика для SDK, которым нужно работать с произвольным `instanceUrl`, но при ревью безопасности стоит перепроверить, что все *входящие* обработчики (в обе стороны — и в SDK, и в `EmbedPage`) действительно фильтруют по `event.source`, а не полагаются только на `type` сообщения (в коде фильтрация по `source` присутствует почти везде, но не всегда дублируется origin-проверкой после первого рукопожатия).

---

## Файлы, задействованные в исследовании

- Клиентский SDK: `packages/ee/embed-sdk/src/index.ts`
- Провижининг/JWT: `packages/server/api/src/app/ee/managed-authn/managed-authn-service.ts`, `managed-authn-controller.ts`, `managed-authn-module.ts`, `lib/external-token-extractor.ts`
- Signing keys: `packages/server/api/src/app/ee/signing-key/signing-key-service.ts`, `signing-key-module.ts`
- CORS/CSP: `packages/server/api/src/app/helper/embed-security.ts`, `packages/server/api/src/app/server.ts:136-145`
- Allowed origins API: `packages/server/api/src/app/ee/embed-subdomain/embed-subdomain.controller.ts`, `embed-subdomain.service.ts`
- Веб embed-режим: `packages/web/src/components/providers/embed-provider.tsx`, `packages/web/src/app/routes/embed/index.tsx`
- Shared-схемы: `packages/core/shared/src/lib/ee/managed-authn/managed-authn-requests.ts`, `packages/core/shared/src/lib/management/project/project.ts`, `packages/core/shared/src/lib/management/project/project-member.ts`
- Документация: `docs/embedding/overview.mdx`, `configure-embedding.mdx`, `provision-users.mdx`, `embed-builder.mdx`, `embed-connections.mdx`, `embeddable-mcp.mdx`, `customize-pieces.mdx`, `sdk-server-requests.mdx`, `predefined-connection.mdx`, `navigation.mdx`, `sdk-changelog.mdx`, `docs/endpoints/embedding/add-allowed-embed-origins.mdx`
