# Activity log — приложение amoCRM (виджет + мост)

Хронологический журнал итераций ночного цикла `loop.sh`. Одна запись на итерацию/задачу, сверху вниз в порядке выполнения. Заполняется автономными итерациями; преемственность между ними — только через этот файл и git (ветка `feature/amocrm-app`).

## Формат записи

```
### <дата ISO> — <ID задачи>: <название>
- Статус: done | partial | blocked
- Изменения: какие файлы созданы/изменены (кратко)
- Команды: что запускалось (tsc/vitest/build/curl) и ФАКТИЧЕСКИЙ результат
- Живые проверки: что снято со стенда/браузера — числами (widget_code, URL, формы payload, CSP)
- Верификация: результат code-review (pass/находки)
- Блокеры: что помешало / открытые вопросы / что вынесено дальше
```

## Лог

### 2026-07-11 — W001: Скелет приватного виджета + установка на стенд
- Статус: done
- Изменения: создан каркас `widget/` — `manifest.json` (widget-скелет по референсу amoai/marketplace: `interface_version:2`, `init_once:false`, `locale:['ru']`, `installation:true`; `locations:['settings','advanced_settings','lcard-0']` — DP/salesbot НЕ включены; `settings.install_key` type text required:false; `advanced.title`), `script.js` (vanilla AMD `define(['jquery'],…)`; коллбеки по проверенной структуре WIDGET_DEV_GUIDE §7: render/init/bind_actions/settings/onSave/advancedSettings + пустой destroy + contacts/leads/todo.selected; ядро — синглтон `window.__dzenflow` с гардом в init(); `advancedSettings()` рендерит заглушку в `#work-area-<widget_code>`, widget_code берётся из `get_settings()` с фолбэком на `params`), `i18n/ru.json`, `build.sh` (zip -r -X + node --check + grep-линтер + JSON-валидация), `.gitignore` (zip/DS_Store — артефакт сборки не коммитится). Логотипы уже лежали в `images/` (размеры проверены sips: logo_main 400×272, logo 130×100, logo_medium 240×84, logo_min 84×84, logo_small 108×108 — все точно по спеке; logo_dp не нужен без DP-блока).
- Команды: `node --check script.js` → OK; grep-линтер `console.*|alert|confirm|prompt` → 0; JSON manifest+ru.json парсятся; сверка i18n-ключей манифеста с ru.json → missing: none; секрет-скан застейдженного диффа (JWT/PEM-паттерны) → 0 совпадений; `git status` без `.env*`/`data/`/`.pem`.
- Живые проверки: дев-инжект бандла (define-шим + фейковый work-area) на ЖИВОЙ странице amo `dzenteamdev.amocrm.ru/leads/pipeline/` через chrome-devtools. Результат: все коллбеки вернули `true` (render/init/settings/onSave/advancedSettings), повторный `init()` прошёл через гард (`__dzenflow.booted=true`), `destroy()` — no-op, синглтон пережил destroy; заглушка отрисована в work-area (135 симв., заголовок «Автоматизации Dzen.Team» + текст «Раздел в разработке» присутствуют); глобалы `$`/`_`/`AMOCRM` не затёрты; консоль без наших ошибок (только штатные 404/401/deprecation amo). Zip НЕ собирался (в этом цикле не нужен — INSTALL.md, сборку/установку делает человек).
- Верификация: code-review (low) по диффу — находок нет.
- Блокеры: нет. Установку виджета в аккаунт делает человек (INSTALL.md); реальный `widget_code` и URL страницы advanced_settings добираются после установки (нужны для W011/W013) — «ожидает установки».

### 2026-07-11 — Виджет установлен на dzenteamdev (человек, вручную)
- Статус: факт зафиксирован (оркестратор, вне итераций)
- **widget_code = `dealguard`**; страница advanced_settings живая: `https://dzenteamdev.amocrm.ru/settings/widgets/dealguard/`.
- Следствия для задач: W002 снимает размеры/стабильность на РЕАЛЬНОЙ странице advanced_settings (шим не нужен); «ожидает установки» из W001 закрыто этой записью; W011/W013 используют widget_code/URL выше. Обновление кода виджета в аккаунте по-прежнему делает человек (INSTALL.md, с bump version) — но для дев-проверок это не нужно: инжект остаётся основным циклом.

### 2026-07-11 — W002: Живая проверка CSP + размеры областей
- Статус: done
- Изменения: `widget/script.js` — `renderStub()` вставляет в work-area внешний https-iframe (`src=https://example.com/`, throwaway-проба, в W003 меняется на embed-SDK форка через `configure()`); высота считается по замеру `work-area.getBoundingClientRect().top` → `Math.max(400, innerHeight - top - 16)`. Создана папка `activity-assets/` со скриншотом-доказательством.
- Команды: `node --check script.js` → OK; grep-линтер `console.*|alert|confirm|prompt` → 0; JSON i18n+manifest парсятся; code-review (low) по диффу → находок нет. Секрет-скан диффа (JWT/PEM) → 0; `git status` без `.env*`/`data/`/`.pem`.
- Живые проверки (chrome-devtools, живая сессия dzenteamdev, страница `/settings/widgets/dealguard/`):
  - **(а) CSP — НЕ блокирует внешний iframe.** Инжект iframe `https://example.com/` в `#work-area-dealguard`: запрос `GET https://example.com/` → **200**, «Example Domain» отрендерилась внутри advanced_settings (скрин `activity-assets/w002-iframe-advanced.png`). Консоль без CSP-нарушений (только штатные amo: form-field id, apple-mobile-web-app deprecation). Боевой факт WIDGET_DEV_GUIDE §9 подтверждён для нашего случая — открытый вопрос №1 снят.
  - **(б) размеры.** viewport 1920×907. work-area advanced_settings: `top=64, left=355, width=1540`; при заполнении iframe высота контента `827px` (расчёт `innerHeight 907 − top 64 − 16 − шапка`), work-area раскрылся до 897px. Правая панель карточки сделки `.card-widgets` (для кнопки W011): **width=265, left=1655, top=0**.
  - **(г) формы констант** (для W003/W006/W007): `AMOCRM.constant('user')` → `{id:2898108, name:"Алексей", uuid:"20154774-…"}` (name — одно слово, без фамилии → W007 split даст firstName='Алексей', lastName-фолбэк). `AMOCRM.constant('account')` → `{id:32453394, subdomain:"dzenteamdev", timezone:"Europe/Moscow", currency:"RUB", date_format:"d.m.Y"}`. Полные списки ключей user/account сняты (см. диалог), личных данных сверх id/имени не фиксировал.
- Верификация: code-review (low) — находок нет.
- Блокеры: нет. **(в) стабильность iframe при переходах** живьём НЕ стресс-тестилась: проба — throwaway-инжект, при навигации по amo страница перезагружается и инжект стирается; персистентный iframe появляется только с embed-SDK в W003 — там и проверяется стабильность на переходах (instance-recreation + синглтон-гард уже подтверждены в W001). Побочно замечено (вне скоупа W002): в установленном манифесте сайдбар показывает сырой ключ `widget.name` как short_description — деталь установленной версии, не трогаю (правит человек при следующей перезаливке).

### 2026-07-11 — W003: Embed-handshake: JWT → конструктор внутри amo
- Статус: done
- Изменения: `bridge/scripts/dev-stand.sh` переписан с cloudflared (заблокирован) на SSH-туннель по образцу `~/amoai/scripts/dev-tunnel.sh`: API :8080 + worker :8082 (`AP_DEV_PIECES=amocrm`) + новый `bridge/scripts/path-router.mjs` (:8090, `/bridge/*` → :8083 для будущего моста, остальное + WebSocket upgrade → форк :8080, маркер `GET /__router-health`) + `ssh -N -R 172.17.0.1:9090:localhost:8090 ai` → стабильный `https://amoai-dev.dzen.team`. Embed-SDK собирается webpack'ом в `dist/packages/web/embed/0.13.0.js` (вне git), fastify-static раздаёт его по `/embed/0.13.0.js` (задел прерванной итерации, сохранён). `bridge/package.json` + `"type":"module"` (иначе tsc режет `import.meta` в sign-jwt.ts), образец env переименован в `env.example` (pre-commit хук репо режет ЛЮБЫЕ `.env*`, включая `.env.example`) — стабильные FORK_URL/BRIDGE_PUBLIC_URL. `widget/script.js`: `renderStub`→`renderEmbed` — загрузка SDK, `configure({instanceUrl, jwtToken: DEV_EMBED_JWT, embedding:{containerId, locale:'ru', dashboard:{hideSidebar:true}}})`; DEV_EMBED_JWT в git пуст (подставляется перед инжектом), пустой → прежняя заглушка. `widget/i18n/ru.json` + ключ `advanced.error`.
- Команды: `bash dev-stand.sh` → «API жив :8080 / Worker :8082 / Роутер :8090 / Готово»; `npx tsc --noEmit` (bridge) → чисто (после `"type":"module"`); `node --check script.js` → OK; grep-линтер → 0; JSON парсится; vitest не гонялся (тестов в bridge ещё нет — появятся в W005). Секрет-скан диффа (JWT/PEM-паттерны) → 0; `git status` без `.env*`/`data/`/`.pem`.
- Живые проверки (chrome-devtools, dzenteamdev, страница `/settings/widgets/dealguard/`):
  - Провижининг (одноразовый скрипт /tmp, админ-сессия): `embeddingEnabled=true` подтверждён; signing key создан — **kid `e82J9cia50AWhkn5WnNGa`**, приватный ключ → `bridge/data/signing-key.pem` (вне git), kid → `bridge/.env`; `POST /v1/platforms/{id}` добавил origin. **CSP через туннель: `frame-ancestors 'self' https://dzenteamdev.amocrm.ru`** (LRU-кэш форка ≈3 мин — не паниковать сразу после добавления origin).
  - **Конструктор открылся внутри advanced_settings** (скрин `activity-assets/w003-embed-advanced.png`): iframe `https://amoai-dev.dzen.team/embed` 1540×827, дашборд «Build a Flow / Create a Table» отрендерился. JWT подписан `npm run sign-jwt` (claims v3, externalProjectId=32453394, externalUserId=2898108, exp 1ч).
  - **Автопровижининг подтверждён по БД форка:** project `ZjyaVGGWIwHs2IZ7qvNyu` (externalId=32453394, displayName=32453394), user `rgz5wM41rjRjkCPMDHiOo` (externalId=2898108, provider=JWT).
  - Reload страницы + повторный инжект → configure() отработал заново; цикл destroy→advancedSettings (имитация SPA-перехода) → ровно 1 iframe (задвоения нет), синглтон-гард жив, глобалы `$`/`_`/`AMOCRM` целы; консоль — только штатный amo-warning (apple-mobile-web-app deprecation), наших ошибок нет.
- Решения/грабли:
  - **ГЛАВНАЯ ГРАБЛЯ (боевая, не только dev):** embed-SDK — UMD-бандл, а в amo глобально живёт RequireJS → `<script src>` уводит UMD в ветку `define.amd`, фабрика не исполняется («Mismatched anonymous define»), `window.activepieces` не появляется. Фикс в `loadEmbedSdk()`: fetch текста (CORS у форка `*`) + `new Function('define','exports','module', code)(undefined,…)` — UMD падает в ветку присвоения глобалов. Использовать этот паттерн во всех будущих загрузках SDK (W010/W013).
  - SDK НЕ стилизует основной iframe (дефолт 300×150) — обязателен CSS хоста: `<style>#container iframe{width:100%;height:100%}</style>` в разметке контейнера.
  - Идемпотентность туннеля: осиротевший ssh может форвардить мимо роутера (прямо на :8080), а форк-SPA отвечает 200 на любой путь — поэтому живость туннеля проверяется маркером `/__router-health` роутера, не `/api/v1/flags`. Плюс: reconnect-цикл `~/amoai/scripts/dev-tunnel.sh` (жил с прошлых сессий, PID 12224) убит (`kill -9`; конкурирует за remote-порт 9090) — dev-stand.sh теперь глушит и его.
  - Замечено: дашборд отрендерился на английском при `locale:'ru'` («Get started with main») — разбор в W010 (возможно, onboarding-экран не локализован); «main» в заголовке — имя платформы, `projectDisplayName` в PoC-JWT не передавался (добавится в W007).
- Верификация: code-review (low) по диффу — см. ниже.
- Блокеры: нет.
