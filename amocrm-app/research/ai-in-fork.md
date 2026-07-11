# AI-поверхности в форке Activepieces (Zen-flow)

Исследование по коду репозитория (не по общим знаниям об Activepieces). Все выводы — из фактически прочитанных файлов, пути кликабельны как `file:line`.

Контекст задачи: заказчик хочет, чтобы **нейросеть составляла workflow из естественного языка** — убрать ручной труд по сборке flow. Этот отчёт картографирует всё, что в форке уже есть для этого, и что можно переиспользовать.

---

## 1. Copilot — история и текущее состояние

В репозитории есть **два разных, никак не связанных объекта**, которые называются "copilot":

### 1.1 Старый copilot (удалён)

Миграции `packages/server/api/src/app/database/migration/postgres/1734479886363-AddCopilotSettings.ts` (добавление колонки `copilotSettings` в таблицу `platform`) и `packages/server/api/src/app/database/migration/postgres/1761221158764-DeprecateCopilot.ts:1-19` (удаление той же колонки: `ALTER TABLE "platform" DROP COLUMN "copilotSettings"`) показывают, что раньше существовала настройка copilot на уровне платформы — судя по названию и месту (platform-level settings, а не отдельная фича), это была конфигурация AI-провайдера для какого-то ассистента в билдере (в духе "сгенерировать код для Code-шага"). **Эта колонка и функциональность полностью удалены** в текущей ветке — никакого actionable кода для неё в `src` не осталось, только миграции и её след в промежуточных SQLite-миграциях (`1735262810939-AddExternalIdForFlowSqlite.ts`, `1747824740845-RemoveFeatureFlagsFromSqlite.ts`).

Специально проверил: генерации кода/HTTP-запросов/авто-заполнения пропсов через "copilot" в `packages/web/src` нет ни одного упоминания (`grep -ril copilot packages/web` — пусто, кроме дистрибутивных файлов). Значит, **built-in "AI помощник в шаге" сегодня не существует** в смысле старого copilot.

### 1.2 Platform Copilot — RAG-чат про сам Activepieces (не про flow пользователя!)

`.agents/features/platform-copilot.md` подробно описывает вторую вещь с похожим именем: **RAG-чат-ассистент, который отвечает на вопросы о кодовой базе и документации самого Activepieces** (для разработчиков, расширяющих платформу), а не для конечных пользователей, собирающих flow.

Важная деталь, подтверждённая напрямую:
```
$ find packages/server/api/src -iname "*platform-copilot*"   → пусто
$ grep -rn "platform-copilot|platformCopilot" packages/server/api/src/app/app.ts → пусто
```
То есть исходники этой фичи **есть только в `packages/server/api/dist/src/app/platform-copilot/*.js` (скомпилированный JS), исходного `.ts` в репозитории нет**, и модуль **нигде не зарегистрирован в `app.ts`** — то есть фича либо была вырезана из исходников при сохранении артефакта сборки, либо это осиротевший dist-код от прошлой версии, который сейчас не работает в собранном приложении. Практический вывод: **на этот механизм рассчитывать нельзя** — там нет ни entity-регистрации, ни живого route.

Архитектурно (по dist-коду) это: `copilot_code_chunks` (768-dim embeddings + tsvector), гибридный поиск (70% vector / 30% full-text, RRF-merge), Vercel AI SDK (`streamText`) с двумя tool'ами (`read_file`, `list_directory` — оба **читают GitHub** `raw.githubusercontent.com/activepieces/activepieces`, то есть апстрим-репозиторий, а не этот форк), еженедельный переиндекс по крону. **Никакого отношения к генерации flow пользователя не имеет** — это чисто dev-support ассистент "как устроен Activepieces", и сейчас не подключён к приложению.

**Вывод по п.1**: built-in copilot для генерации/редактирования пользовательских flow из текста **отсутствует полностью**. Ни старого (code-gen), ни целого-flow-генератора нет.

---

## 2. AI Providers / AI Credits — универсальный LLM-прокси

`.agents/features/ai-providers.md` + код в `packages/server/api/src/app/ai/`:
- `packages/server/api/src/app/ai/ai-provider-entity.ts`, `ai-provider-service.ts`, `ai-provider-controller.ts`, `ai-provider.module.ts`
- Провайдеры: `packages/server/api/src/app/ai/providers/{openai,anthropic,google,azure,bedrock,openrouter,cloudflare-gateway,openai-compatible-gateway}-provider.ts`

Это **платформенный прокси к LLM**: админ платформы конфигурирует одного или нескольких вендоров (OpenAI, Anthropic, Google, Azure, OpenRouter, Cloudflare Gateway, произвольный **OpenAI-совместимый custom endpoint** — включая локальные Ollama/LM Studio) с ключами, зашифрованными at rest (AES-256). Любая AI-piece/фича внутри flow получает доступ к LLM через `GET /v1/ai-providers/{provider}/config` (engine получает расшифрованный конфиг по engine-токену) — то есть **piece'ы никогда не хранят свой API-ключ**, они идут через платформенный прокси.

Для RU-контекста это ключевая точка: **custom/OpenAI-compatible провайдер = обход блокировок openai.com** — если поднять свой relay/прокси или использовать OpenRouter/Cloudflare Gateway (которые не заблокированы или доступны через свою инфраструктуру), любая AI-фича платформы (agent-степ, будущий flow-generation) автоматически получает рабочий LLM-доступ без завязки на прямой доступ к api.openai.com из РФ.

Есть также авто-провижининг провайдера `ACTIVEPIECES` (через OpenRouter) при включённом `aiCreditsEnabled` — биллинг по кредитам (1000 = $1), Stripe-топап, это Cloud/EE-фича, для self-hosted CE неприменима (CE вообще не имеет этого модуля — "не зарегистрирован для CE в app.ts", п. Edition Availability в доке).

Отдельно — **AI Tool Configs** (`packages/server/api/src/app/ai/ai-tool-config-*.ts`) — не LLM-провайдеры, а конфиг внешних *капабилити* (`WEB_SEARCH` через Tavily, `WEB_SCRAPING` через Firecrawl, `IMAGE_GENERATION` через Fal) для чат-ассистента — заготовка на будущее агентское расширение с реальным web-доступом.

---

## 3. Agent-степ (шаг flow, ReAct-агент)

`.agents/features/agents.md` — детальнейшее описание. Ключевое:

- Agent — это **шаг внутри существующего flow** (`type: PIECE`, `pieceName: '@activepieces/piece-agent'`), а **не отдельная сущность и не генератор целого flow**. Конфиг агента (`prompt`, `agentTools[]`, `maxSteps`, `aiProviderModel`, `structuredOutput`) хранится прямо в `settings.input` шага — своего backend-entity у Agent нет.
- **Важная находка**: пакета `@activepieces/piece-agent` **нет в `packages/pieces` этого репозитория** (`find packages/pieces -iname "*agent*"` находит только сторонние community-pieces `free-agent` и `agentx`, никакого core/`piece-agent`). Значит исходный код самого агентского движка (ReAct-цикл, вызов tools) в этом форке **не присутствует как открытый пакет** — либо тянется из закрытого пакета/registry, либо динамически публикуется. Для расширения "агент строит flow" эта часть — чёрный ящик в текущем снапшоте кода.
- Инструменты агента (`AgentTool` union в `packages/core/shared/src/lib/automation/agents/tools.ts`): `PIECE` (конкретный экшен piece'а), `FLOW` (вызов другого flow как саб-раннер), `MCP` (внешний MCP-сервер — SSE/StreamableHTTP/SimpleHTTP + auth), `KNOWLEDGE_BASE` (семантический поиск по файлу/таблице, 768-dim косинусное сходство).
- Backend-эндпоинт агентского домена — только один: `POST /v1/projects/:projectId/agent-tools/mcp/validate` (`packages/server/api/src/app/agents/agent-tools-controller.ts:10-27`, `agents-module.ts:1-7`) — это **проба доступности внешнего MCP-сервера**, который пользователь хочет подключить как tool к агенту (JSON-RPC handshake `initialize → tools/list`), через SSRF-safe `apAxios`. Больше никакого backend-кода в этом модуле нет — вся остальная логика (сам ReAct-луп, вызов tools, structured output) исполняется движком (в закрытом `piece-agent`).
- Gated по `platform.plan.agentsEnabled`.

**Вывод**: Agent-степ — мощный строительный блок ("LLM с tools, запускаемый как шаг flow"), но он **исполняет один шаг**, не проектирует граф flow целиком. Это разный уровень абстракции от "нейросеть составляет весь workflow".

---

## 4. MCP — Activepieces как MCP-сервер (и обратное направление)

`.agents/features/mcp.md` + `packages/server/api/src/app/mcp/`.

### 4.1 Activepieces → MCP-сервер (уже есть, и это САМАЯ близкая к задаче вещь в репозитории)

Каждый проект имеет один `McpServer` (`packages/server/api/src/app/mcp/mcp-entity.ts`) с bearer-токеном. Внешний AI-клиент (Claude Desktop, Cursor, Windsurf — то есть **произвольный агент, например сам Claude**) подключается по StreamableHTTP (`POST /v1/mcp/:projectId/http`) и получает набор из ~30 tools.

Прямо в наборе tools уже реализована сборка **целого нового flow одним вызовом** — это фактически прототип "NL→flow", только вызывающая сторона — внешний LLM-клиент, а не встроенный UI:

- **`ap_build_flow`** (`packages/server/api/src/app/mcp/tools/ap-build-flow.ts:41-221`) — принимает `{ flowName, trigger: {pieceName, triggerName, input, auth}, steps: [...] }` и одним проходом: создаёт flow (`flowService.create`), резолвит версию trigger-piece'а, применяет `FlowOperationType.UPDATE_TRIGGER`, затем последовательно применяет `FlowOperationType.ADD_ACTION` для каждого шага (поддерживает вложенность внутрь LOOP через `parentStepName`/`stepLocationRelativeToParent`), детектирует неизвестные input-пропы (`mcpUtils.detectUnknownInputProps`) и **явно запрещает роутеры** в одном вызове ("build the rest of the flow first, then add the router with ap_add_step / ap_add_branch" — `ap-build-flow.ts:45`). Возвращает `flowUrl`, `validCount`, `invalidSteps`, `unknownProps` — то есть уже реализована обратная связь "что не получилось" для LLM, чтобы он мог доисправить через `ap_update_step`/`ap_update_trigger`.
- `ap_create_flow`, `ap_add_step`, `ap_update_step`, `ap_delete_step`, `ap_update_trigger`, `ap_add_branch`/`ap_update_branch`/`ap_delete_branch`, `ap_duplicate_flow`, `ap_lock_and_publish`, `ap_test_flow`/`ap_test_step` — гранулярные операции для итеративного редактирования уже существующего flow (рекомендуемый путь для правок, согласно описанию самого `ap_build_flow`).
- **`ap_research_pieces`** (`packages/server/api/src/app/mcp/tools/ap-research-pieces.ts:22-60`) — ключевой tool для "разобраться в паттернах/экшенах/триггерах за пользователя": принимает `searchQuery` или точные `pieceNames`, и, что важно, **`forIntent`** ("what you are trying to do") — возвращает `recommendedActions`, ранжированные по AI-guidance-подсказкам, зашитым в метаданные piece'ов, чтобы LLM с одной попытки выбрал правильный экшен. Есть также `ap_search_actions`, `ap_search_triggers`, `ap_get_piece_props` (схема инпутов экшена/триггера + curated expert-notes через `piece-expertise.ts` + пример инпута + output-схема).
- `ap_validate_flow`, `ap_validate_step_config` — валидация до применения, полезно как "самопроверка" LLM-агента.

Иными словами: **вся низкоуровневая механика "LLM собирает flow" уже построена и используется — но только для внешних MCP-клиентов**, а не как встроенная в UI Activepieces функция "напиши промпт → получи flow". Разница между текущим состоянием и требованием заказчика — это **UI/UX слой** (чат внутри builder'а) и, возможно, встроенный вызов LLM вместо необходимости во внешнем клиенте типа Claude Desktop.

Атрибуция: `ap_create_flow`/`ap_build_flow`/`ap_duplicate_flow` проставляют `createdBy: { type: 'MCP', id: mcpServerId }` и `ownerId` — то есть в модели данных уже поддерживается "flow создан AI-агентом", а не только человеком (`FlowCreatorType.MCP`, см. `ap-build-flow.ts:78`).

### 4.2 Внешние MCP-серверы, вызываемые изнутри flow (обратное направление)

Agent-tool типа `MCP` (см. п.3) — агент внутри flow может сам стучаться на внешний MCP-сервер. Валидируется через `POST /v1/projects/:projectId/agent-tools/mcp/validate`.

---

## 5. Модель Flow как цель генерации (насколько это редактируемый декларативный JSON)

Расположение **важно и не то, что можно было бы предположить**: основная модель flow **не в `@activepieces/shared`**, а в `packages/core/execution/src/lib/flows/` (согласно `.claude/rules/core-packages.md`: пакеты `packages/core/*`, engine не должен импортировать `@activepieces/shared`). `@activepieces/shared` (`packages/core/shared`) переэкспортирует/расширяет это на уровне управления (templates, EE и т.д.).

### 5.1 Структура — полностью декларативный JSON, дерево + связный список

- `FlowVersion` (`packages/core/execution/src/lib/flows/flow-version.ts:14-27`): `{ trigger: FlowTrigger, agentIds: string[], connectionIds: string[], notes: Note[], state: DRAFT|LOCKED, valid, schemaVersion, ... }`. `LATEST_FLOW_SCHEMA_VERSION = '22'` — версия схемы явно отслеживается (важно для миграции старых LLM-сгенерированных flow при апдейте схемы).
- `FlowAction` (`packages/core/execution/src/lib/flows/actions/action.ts:341-345`) — рекурсивный union из 4 типов: `CODE`, `PIECE`, `LOOP_ON_ITEMS`, `ROUTER`. Связность — **linked list** через `nextAction` (а не массив шагов), `ROUTER` дополнительно имеет `children: (FlowAction|null)[]` (по одному на branch), `LOOP_ON_ITEMS` — `firstLoopAction`. Это значит, что LLM, генерирующий flow напрямую как JSON, должен понимать эту linked-list/tree структуру, а не плоский массив — не тривиально для few-shot без примеров.
- `RouterActionSettings` (`action.ts:273-284`) — ветки (`branchType: CONDITION|FALLBACK`) с условиями (`BranchOperator`, 24 оператора: TEXT/NUMBER/DATE/LIST/EXISTS-варианты) — сложная часть модели, которую `ap_build_flow` явно не пытается генерировать одним вызовом (см. п.4.1) — признание, что роутер сложнее для one-shot generation.

### 5.2 Diff-операции — да, есть готовый механизм "LLM выдаёт операции редактирования, не весь flow"

`packages/core/execution/src/lib/flows/operations/index.ts:28-55` — `FlowOperationType`, 26 типов операций (`ADD_ACTION`, `UPDATE_ACTION`, `DELETE_ACTION`, `MOVE_ACTION`, `UPDATE_TRIGGER`, `ADD_BRANCH`/`DELETE_BRANCH`/`MOVE_BRANCH`, `DUPLICATE_ACTION`/`DUPLICATE_BRANCH`, `SET_SKIP_ACTION`, `IMPORT_FLOW`, `LOCK_AND_PUBLISH`, заметки и т.д.).

`FlowOperationRequest` (`index.ts:217-326`) — размеченный zod-union `{ type, request }` для каждой операции — **это готовый, строго типизированный "патч"-формат**, который LLM может генерировать вместо целого flow JSON (именно это уже и происходит внутри MCP tools — каждый `ap_add_step`/`ap_update_step` под капотом строит один `FlowOperationRequest` и прогоняет через `flowOperations.apply()`).

`flowOperations.apply(flowVersion, operation)` (`index.ts:331-433`) — чистая функция: клонирует версию (`JSON.parse(JSON.stringify)`), применяет один оператор, пересчитывает `valid` по всем шагам через `flowStructureUtil.getAllSteps` — это **безопасная точка интеграции**: LLM может предлагать список операций, backend их валидирует и применяет по одной, откатываясь при ошибке (как и делает `ap-build-flow.ts` — при ошибке удаляет уже созданный `flowId`).

### 5.3 Импорт целого flow

`FlowOperationType.IMPORT_FLOW` + `ImportFlowRequest` (`index.ts:123-130`, реализация `_importFlow` в `operations/import-flow.ts`) — принимает `{ displayName, trigger: FlowTrigger, schemaVersion, notes }`, то есть **целое дерево** сразу (используется, например, при импорте template). Это альтернативный, более "дорогой" путь генерации — LLM должен выдать валидный `FlowTrigger`-JSON целиком, без пошаговой обратной связи по каждому шагу (в отличие от `ap_build_flow`, который резолвит версии pieces и unknown-пропы для каждого шага отдельно).

---

## 6. Templates — инфраструктура для few-shot/RAG

Есть полноценная фича templates (не связана с AI, но пригодна как источник примеров):

- `packages/core/shared/src/lib/management/template/template.ts:1-33` — `FlowVersionTemplate = FlowVersion.omit({...}).extend({ description })` — то есть **шаблон — это FlowVersion с описанием**, типы `OFFICIAL | SHARED | CUSTOM`, статусы `PUBLISHED | ARCHIVED`, теги (`TemplateTag`), плюс `TableTemplate`/`TableDataState` (шаблоны с сид-данными таблиц).
- Backend: `packages/server/api/src/app/template/`, EE-часть `packages/server/api/src/app/ee/template/` и `packages/server/api/src/app/ee/platform/admin/templates/` (админ CRUD шаблонов платформы).
- Frontend: `packages/web/src/features/templates/` (`templates-api.ts`, `templates-hook.ts`, `templates-browse-dialog.tsx`, `use-template-dialog.tsx`, `share-template.tsx`) + `packages/web/src/app/routes/templates/` (галерея) + `packages/web/src/app/routes/platform/setup/templates/` (админка).

**Вывод**: готовый корпус реальных, валидных `FlowVersion`-примеров с описанием и тегами — это прямо готовая база для few-shot промптинга или RAG-подсказок LLM (по сути "вот 5 похожих по описанию шаблонов — построй по аналогии"), не нужно собирать датасет с нуля.

---

## Точки интеграции NL → flow: варианты реализации (от дешёвого к дорогому)

### Вариант A — Внешний агент + существующий MCP-сервер платформы (дёшево, уже работает сегодня)
Ничего не разрабатывать: пользователь подключает Claude (Desktop/Code) или другого MCP-клиента к `POST /v1/mcp/:projectId/http` своего проекта и просит "собери мне flow, который...". `ap_build_flow` + `ap_research_pieces` + `ap_add_branch` уже дают LLM всё нужное. **Сложность: 0**. Минус: требует внешнего инструмента, не "фича внутри Activepieces", не самообслуживаемо для обычного пользователя, требует своего доступа к LLM у пользователя.

### Вариант B — In-app чат в билдере, который вызывает те же MCP-tools через платформенный AI Provider (дёшево-средне, максимальное переиспользование)
Добавить в веб-приложение (`packages/web/src/app/builder/`) чат-панель, которая на бэкенде вызывает LLM через уже существующий `AI Providers` прокси (`packages/server/api/src/app/ai/`) в agentic-цикле (Vercel AI SDK `streamText` + `tool()`, как уже сделано в platform-copilot dist-коде, просто нужно написать заново/восстановить) — и даёт LLM те же самые MCP tools (`ap_build_flow`, `ap_add_step`, `ap_research_pieces`, ...), вызывая их напрямую как internal function calls (без реального MCP HTTP-раунтрипа, т.к. и сервис, и клиент — один процесс). **Переиспользуется**: весь `mcp/tools/*`, `FlowOperationRequest`/`flowOperations.apply`, AI Providers-прокси (в т.ч. custom/OpenRouter — решает проблему блокировок в РФ). **Нужно написать**: сам чат UI + системный промпт + streaming-обвязка. Средняя сложность (это, по сути, то, чем должен был стать platform-copilot, но развёрнутый на flow пользователя, а не на кодовую базу Activepieces).

### Вариант C — Расширить agent-степ до "агента-архитектора flow" через FLOW/MCP-tool
Настроить существующий Agent-степ (п.3) с tool-типом `MCP`, указав его на **собственный** MCP-сервер проекта (тот самый из варианта A/B) — тогда обычный пользовательский flow-агент сможет как один из инструментов "построить дочерний flow". Работает уже сегодня без единой строчки кода на бэкенде (агент — это runtime-фича, MCP-tool — это просто конфиг), но по смыслу это "flow строит flow", а не "чат → flow", решает более узкий кейс (мета-автоматизация), а не основной запрос заказчика.

### Вариант D — Few-shot/RAG поверх templates + прямая генерация через IMPORT_FLOW
Использовать корпус `FlowVersionTemplate` (п.6) как few-shot базу (эмбеддинги описаний шаблонов → similarity search → топ-N примеров в промпт), затем просить LLM сгенерировать **целый** `FlowTrigger`-JSON и применить через `FlowOperationType.IMPORT_FLOW`. Дороже в разработке (нужен собственный vector store для шаблонов, доп. валидация целого дерева) и рискованнее в runtime (нет пошаговой обратной связи по каждому шагу, как у `ap_build_flow`) — **не рекомендуется как основной путь**, разве что как ускоритель первого черновика перед доводкой через diff-операции (вариант B).

### Вариант E — Полноценный "flow copilot": chat + diff-tools + валидация + preview (дорого, целевое состояние)
Комбинация B + D: чат в билдере, который сначала предлагает black-box черновик (вариант D, через шаблоны) для скорости первого результата, а затем весь дальнейший диалог правок идёт через `FlowOperationRequest`-диффы (вариант B/секция 5.2) с live-preview в канвасе и explicit undo (версии flow уже поддерживают black/draft state). Требует наибольшей работы: UI для показа "предложенных изменений" перед применением (diff review, как в Cursor), стриминг частичных операций, обработка ошибок валидации в реальном времени. Максимально переиспользует существующую модель (`FlowOperationType`, `flowOperations.apply`, AI Providers, MCP tools, templates), но добавочная UI/UX-работа велика.

**Рекомендация**: начинать с **варианта B** — это наименьшая работа с максимальным переиспользованием (весь MCP-tools слой уже реализован и протестирован через внешние агенты в варианте A; нужно только "снять" HTTP-протокол MCP и вызвать те же функции напрямую из in-app чата, подключённого к уже существующему AI Providers прокси). Вариант E — естественное развитие B, когда потребуется UX выше базового.
