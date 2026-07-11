# PRD — piece «amoCRM» (ночной Ralph-цикл)

Атомарный план для автономного цикла. Одна задача = одна итерация (~30–90 мин), самодостаточна.
Цель: piece `@activepieces/piece-amocrm` — паритет CRM-ядра с amoCRM-виджетами (Sensei, Triggeron, F5 BPMN).
Источник спецификаций — amoCRM REST API v4 (реальная цель реализации) + опции форм из референсов.

## Общие правила для КАЖДОЙ задачи (не повторяются в теле)

- **Стиль кода (CLAUDE.md):** no `any` (используй `unknown` + type guards), no `as` type casting, named params (один деструктурируемый объект-параметр), `tryCatch`/`tryCatchSync` из `@activepieces/shared`, exported типы/константы — в конце файла после логики. Комментарии — только «почему».
- **HTTP:** запросы к amoCRM API идут через `httpClient` из `@activepieces/pieces-common` (паттерн kommo). Правило «never PUT/PATCH» из CLAUDE.md относится к НАШИМ эндпоинтам; amoCRM API требует `PATCH` для update-операций — используем `PATCH`, это корректно.
- **i18n:** каждая новая user-facing строка (`displayName`, `description`) добавляется идентичным ключом в `packages/pieces/community/amocrm/src/i18n/translation.json` (identity-mapped English). Zod/refine-сообщения не применимы в piece props.
- **Регистрация:** новый action → импорт+добавление в `src/lib/actions/index.ts` и в массив `actions` в `src/index.ts`. Новый trigger → аналогично в `src/lib/triggers/index.ts` и массив `triggers`.
- **Один файл на action/trigger.**
- **Auth-распаковка (важно, footgun):** следуй рабочему паттерну kommo — в `run`/`onEnable`/`onDisable`/`test` креды берутся как `context.auth.props`, в `options(...)` дропдаунов/DynamicProperties — как `auth.props` (CustomAuth разрешается в объект с полем `.props`, НЕ во flat-объект; airtable-стиль `context.auth` напрямую — это про SecretText, не про нас). `makeRequest`/`fetchAllPages` принимают УЖЕ распакованный объект `{ subdomain, zone, apiToken }` — распаковку `.props` делает вызывающий. Не передавай сам `context.auth` внутрь client-функций.
- **aiMetadata:** piece «AI-first» — каждый action и trigger несёт `aiMetadata: { description: '<одна фраза, что делает и когда>' }` (паттерн kommo `new-lead-created.ts`, airtable `create-record.ts`); для не-идемпотентных create-действий добавляй `idempotent: false`. Это часть спецификации каждой задачи с action/trigger, отдельно не повторяется.
- **Юнит-тест чистых функций:** для чистой логики без сети добавляй колокейт `*.test.ts` рядом с файлом (паттерн `packages/pieces/community/simplyprint/src/lib/common/__tests__/custom-fields.test.ts` — assert-based vitest, без фикстур). Обязателен там, где это указано в `verify` конкретной задачи (T002 пагинация, T005 `buildCustomFieldsValues`, T015 арифметика `complete_till`, T017 слияние тегов). Запуск: `npm run test-unit` (если piece-тесты не подхватываются корневым раннером — это факт репо, тогда достаточно того, что тест написан и проходит локально `npx vitest run <файл>`; отметь в activity.md фактический результат).
- **Verify (обязательно в конце каждой задачи):**
  - `npx turbo run lint --filter=@activepieces/piece-amocrm` — без ошибок.
  - `npm run lint-dev` — без новых ошибок (глобальный прогон перед «done»).
  - Компиляция piece не падает (lint включает tsc через eslint typecheck; если нужно явно — `npx tsc --noEmit -p packages/pieces/community/amocrm/tsconfig.lib.json`).
- Отметка выполнения — чекбокс в заголовке задачи: `- [ ]` → `- [x]`, ТОЛЬКО после прохождения verify.

## Справочник amoCRM API v4 (общий для задач)

- **База:** `https://{subdomain}.{zone}/api/v4`, где `zone ∈ {amocrm.ru, amocrm.com}`. Заголовок `Authorization: Bearer {token}`.
- **Пагинация:** ответы отдают `_embedded.{entity}` + `_page`, `_links.next.href` при наличии следующей страницы. Параметры `page`, `limit` (макс 250, дефолт 50).
- **Кастомные поля:** `custom_fields_values: [{ field_id, values: [{ value }] }]`. Для select/multiselect — `values:[{ enum_id }]` (или `{ value }`). Для multitext (phone/email) — `values:[{ value, enum_code }]` (`WORK`/`MOB`/`HOME`/...).
- **Теги:** amo v4 задаёт теги ТОЛЬКО через `_embedded.tags` полным набором на PATCH сущности (нет delta add/remove endpoint). Add/remove = read-modify-write. Список тегов аккаунта: `GET /{entity}/tags`.
- **Payload вебхука:** `{ "leads": { "add": [{ "id": ... }] } }`, `{ "leads": { "status": [...] } }`, `{ "contacts": { "add": [...] } }`, задачи под ключом `"task"`, примечания — `"note"`. Точные ключи см. в задачах. (Разведка `reference/triggeron/model/Rule/*.js` подтвердила: у Triggeron нет строковых имён вебхуков во фронтенде — только пары `entity`+`action`; имена событий в plan взяты из рабочего kommo (`add_lead` и т.п.) и требуют сверки на живом вебхуке при первом триггере.)
- **List-эндпоинты (для `test()` триггеров):** top-level `GET`-список есть у `leads`, `contacts`, `companies`, `tasks`. У примечаний НЕТ `/notes` — только `GET /{entity}/{id}/notes`; у сообщений/talks top-level списка тоже нет. Значит `test()` в фабрике вебхуков (T004) НЕ универсален для note/message — им нужен свой `testFn` (см. T004).

---

## Чекпоинты валидации (V-задачи)

Каждые ~5 задач в плане стоит V-задача. Это обычная итерация цикла (берётся по порядку, как T-задачи), но роль другая: **независимый валидатор, никаких новых фич**. Спецификация общая для всех V-задач:

1. **Полные проверки репо:**
   - `npm run lint-dev` — чисто;
   - `npx turbo run build --filter=@activepieces/piece-amocrm` — собирается;
   - `npm run test-unit` — зелёный;
   - `git status` — рабочее дерево чистое (нет забытых незакоммиченных файлов).
2. **Структура piece не нарушена:**
   - каждый файл в `src/lib/actions/` и `src/lib/triggers/` зарегистрирован в соответствующем `index.ts` И в массивах `actions`/`triggers` в `src/index.ts` (и наоборот — нет регистраций без файла);
   - все `displayName`/`description` присутствуют в `src/i18n/translation.json` (identity-mapped);
   - один файл = один action/trigger; нет дублей `name`;
   - в новом коде нет `any` и `as`-кастов (`grep -rnE ': any|as [A-Z]' packages/pieces/community/amocrm/src/`— осмысленно, без ложных срабатываний).
3. **Скоуп не нарушен:** `git diff main --stat` — изменения только в `packages/pieces/community/amocrm/`, `ralph/` и (единожды, T001) `tsconfig.base.json`. Любой файл вне — разбирательство и откат/фикс.
4. **Сверка со спеками (свежий контекст):** запусти верификатор-субагента: он читает спеки задач проверяемого блока из `prd.md` и их коммиты (`git log --oneline` + диффы), сверяет реализацию со спецификацией (props, эндпоинты, паттерны). Плюс скилл `code-review` по накопленному диффу блока.
5. **Исправление:** всё починяемое (падающий lint/test, незарегистрированный файл, недостающий i18n-ключ, расхождение со спекой) — чини прямо в этой итерации. Непочиняемое — пометь исходную T-задачу ` — BLOCKED: <причина>` и опиши в `activity.md`.
6. **Коммит:** если были фиксы — один коммит `chore(amocrm): V00X checkpoint fixes`. Отметь чекбокс V-задачи, запиши в `activity.md` вердикт по каждому пункту (фактические результаты команд, не «всё ок»).

---

## Фаза 0 — Каркас и инфраструктура

### - [x] T001 — Scaffold piece + auth + validate
- **spec:** Создать piece `@activepieces/piece-amocrm` (displayName `amoCRM`, categories `SALES_AND_CRM`, `COMMUNICATION`, logoUrl-заглушка `https://cdn.activepieces.com/pieces/amocrm.png`). Auth = `PieceAuth.CustomAuth` с props: `subdomain` (SecretText, required), `zone` (`Property.StaticDropdown`, опции `amocrm.ru`/`amocrm.com`, default `amocrm.ru`, required), `apiToken` (SecretText long-lived, required). Реализовать `validate` callback: `GET /account` → success если 200, иначе `{ valid: false, error: '...' }`. Зарегистрировать `createCustomApiCallAction` (baseUrl из auth.zone/subdomain, Bearer) как в kommo `index.ts`. Массивы `actions`/`triggers` пока пустые (кроме custom api call).
- **Решение по auth:** long-lived token, НЕ OAuth2. Причина: self-hosting rule (zero setup) — токен вставляется вручную из amo без регистрации интеграции/redirect URI; OAuth2 ломается в embed/cloud (redirect на cloud.activepieces.com). OAuth2 для виджета — вне ночного цикла.
- **files:** `packages/pieces/community/amocrm/`: `package.json` (name `@activepieces/piece-amocrm`, копия структуры kommo `package.json`), `project.json`, `tsconfig.json`, `tsconfig.lib.json`, `src/index.ts`, `src/lib/auth.ts`, `src/i18n/translation.json` (со всеми ключами задачи), `README.md`. Проще всего: `npm run create-piece` (name `amocrm`), затем правка auth. Добавить path в `tsconfig.base.json`: `"@activepieces/piece-amocrm": ["packages/pieces/community/amocrm/src/index.ts"]` (ЕДИНСТВЕННАЯ задача, трогающая `tsconfig.base.json`).
- **pattern:** `packages/pieces/community/kommo/src/{index.ts,lib/auth.ts}` (CustomAuth + custom api call).
- **logoUrl:** `https://cdn.activepieces.com/pieces/amocrm.png` — заглушка; на нашем форке файла на CDN нет, картинка будет 404 в UI. Это НЕ ломает lint/build/загрузку piece (URL не проверяется на этапе сборки). `ponytail:`-коммент в `index.ts`: логотип-заглушка, заменить при заливке ассета. Не пытаться бандлить/data-URI — вне скоупа.
- **markdownDescription auth:** дать инструкцию (как kommo `markdownDescription`) — где взять long-lived токен в amoCRM (Настройки → Интеграции → создать интеграцию → вкладка «Ключи и доступы» → долгоживущий токен) и что `subdomain` — часть до `.amocrm.ru`. Строки — в i18n.
- **verify:** общий + piece появляется в сборке пакетов (`npx turbo run build --filter=@activepieces/piece-amocrm`).

### - [x] T002 — common/client.ts: makeRequest + пагинация
- **spec:** `makeRequest({ auth, method, path, body })` — named params, строит URL из `auth.subdomain`/`auth.zone`, Bearer, `Content-Type: application/json`, оборачивает вызов в `tryCatch`, при не-2xx бросает `ActivepiecesError` с осмысленным сообщением. Плюс `fetchAllPages({ auth, path, embeddedKey, limit })` — идёт по `_links.next.href` (или `page++`) пока есть страницы, собирает `_embedded[embeddedKey]` в единый массив (иммутабельно, через reduce/concat, без мутации входного массива). Экспорт единым объектом `amoClient = { makeRequest, fetchAllPages }` (util-file rule).
- **files:** `src/lib/common/client.ts`, `src/lib/common/index.ts` (реэкспорт).
- **pattern:** `packages/pieces/community/kommo/src/lib/common/index.ts` (makeRequest) — улучшить пагинацией.
- **тонкости:** `httpClient.sendRequest` из `@activepieces/pieces-common` сам бросает на не-2xx — в `tryCatch` перехватывай эту ошибку и перебрасывай `ActivepiecesError` с телом ответа amo (у amo ошибки в `{ "detail": ..., "status": ..., "validation-errors": [...] }`) в сообщении, чтобы юзер видел причину. `makeRequest` принимает распакованный `{ subdomain, zone, apiToken }` (см. правило Auth-распаковки). Пустой ответ (204/пустой `_embedded`) не должен ронять `fetchAllPages` — вернуть накопленное. Защита от бесконечного цикла: жёсткий предел страниц (напр. 100) на случай зациклившегося `_links.next`.
- **verify:** общий + колокейт `client.test.ts`: тест `fetchAllPages` на моке из 2 страниц (`_links.next` на первой, отсутствует на второй) — проверяет склейку и остановку. Мок `httpClient` через `vi.mock` (паттерн `coupa/src/lib/common/client.test.ts`).

### - [x] T003 — common/props.ts: дропдауны с query + пагинацией
- **spec:** `Property.Dropdown`-фабрики (named param `{ required }`): `pipelineDropdown`, `statusDropdown` (refreshers `['pipelineId']`, `GET /leads/pipelines/{id}/statuses`), `userDropdown` (`GET /users`), `taskTypeDropdown` (`GET /account?with=task_types` → `_embedded.task_types`), `tagDropdown({ entity })` (`GET /{entity}/tags`), `lossReasonDropdown` (**required: false / optional**). Дропдауны сущностей `leadDropdown`/`contactDropdown`/`companyDropdown` — использовать `fetchAllPages` (или limit=250) вместо одной страницы, label = name + id. Группировать не-React утилиты нельзя (фабрики возвращают Property — оставить именованными экспортами, как в kommo props.ts).
- **files:** `src/lib/common/props.ts`.
- **pattern:** `packages/pieces/community/kommo/src/lib/common/props.ts` (устранить его баги: нет пагинации, loss_reason required).
- **потолок (ponytail):** `Property.Dropdown` не умеет серверный поиск — на аккаунте с десятками тысяч сделок `fetchAllPages` по leads/contacts даст огромный список и медленный refresh. Ограничить `leadDropdown`/`contactDropdown`/`companyDropdown` первой страницей `limit=250` c `order[updated_at]=desc` (свежие сверху), а НЕ `fetchAllPages`. `pipeline`/`status`/`user`/`taskType`/`tag`/`lossReason` — их всегда мало, там `fetchAllPages`/одна страница ок. `ponytail:`-коммент: 250 последних; полнотекстовый выбор по id делается через `find_entity` (T019) + ручной ввод id, upgrade — searchable dropdown, если понадобится.
- **verify:** общий.

### - [x] T004 — Фабрика webhook-триггеров + lifecycle
- **spec:** `createAmoWebhookTrigger({ name, displayName, description, aiMetadata, events, payloadPath, entityType, sampleData, fetchFullRecord?, testFn?, props? })` — возвращает `createTrigger` (`TriggerStrategy.WEBHOOK`). Named-params, все именованные опции.
  - `onEnable`: `POST /webhooks { destination: context.webhookUrl, settings: events }` (`events` — массив имён событий amo).
  - `onDisable`: `DELETE /webhooks { destination: context.webhookUrl }` (НЕ хранить `webhookId` — это мёртвый код в kommo; удаление идёт по destination).
  - `run`: достаёт id/записи по `payloadPath` (напр. `body.leads.add`, взять `[0].id`). **Флаг `fetchFullRecord` (default `true`):** если `true` — `GET /{entityType}/{id}?with=contacts,companies,catalog_elements` и вернуть `[record]`; если `false` (delete-события — сущность уже удалена, GET вернёт 404) — вернуть `[payloadEntry]` как есть (в нём есть `id` + метаданные удаления). Если id/записи нет — `[]`. amo может прислать несколько записей в массиве события — маппить ВСЕ, не только `[0]` (иначе теряем события при батче): вернуть `[]`-массив из всех, для каждой при `fetchFullRecord` — GET.
  - `test`: **параметризуемый.** Дефолт — `GET /{entityType}?limit=5&order[updated_at]=desc` → `_embedded[entityType]`. Если передан `testFn` — использовать его (нужно для notes: нет `/notes`-эндпоинта — тест берёт примечания последней сделки; для message — свой путь/пустой массив). См. справочник list-эндпоинтов в шапке.
  - `props` — опциональные доп. props триггера (нужны T010 note: `entity`-дропдаун).
- **Важно (проверка допущения):** несколько триггеров на один аккаунт = несколько вебхуков с РАЗНЫМ `context.webhookUrl` (у каждого триггера свой) — конфликта нет, каждый flow-триггер получает уникальный destination. amo лимитирует ~100 вебхуков на аккаунт — на практике достаточно. Проверить допущение при первом триггере (T006), результат записать в activity.md.
- **files:** `src/lib/common/webhooks.ts` (или `triggers/create-amo-webhook-trigger.ts`).
- **pattern:** `packages/pieces/community/kommo/src/lib/triggers/new-lead-created.ts` (обобщить в фабрику; выкинуть store('webhookId')).
- **verify:** общий (фабрика без потребителей — проверяется вместе с T006; убедиться, что типы `payloadPath`/`fetchFullRecord`/`testFn` не требуют `any` — использовать `unknown` + гард при разборе payload).

---

## Фаза 1 — Кастомные поля (самое сложное, разблокирующее)

### - [x] T005 — Динамические props кастомных полей
- **spec:** Хелпер `customFieldsProperty({ entity })` на `Property.DynamicProperties` (refreshers: []): при наличии auth делает `GET /{entity}/custom_fields` (через `fetchAllPages`, `embeddedKey: 'custom_fields'`) и генерирует по одному prop на поле, маппинг типа amo → Property:
  - `text`/`textarea`/`url`/`numeric`/`monetary` → ShortText/LongText/Number,
  - `select`/`radiobutton` → StaticDropdown из `field.enums` (label `value`, value `enum_id`),
  - `multiselect` → StaticMultiSelectDropdown,
  - `checkbox` → Checkbox,
  - `date`/`birthday` → DateTime,
  - `multitext` (phone/email) → ShortText (значение уйдёт с `enum_code` по умолчанию первого enum).
  **Ключевание DynamicProperties:** генерируемые props ключуются строкой `String(field.id)` (не именем — имена не уникальны и меняются). В UI `displayName` = `field.name`. Значения приходят в `run()` объектом `{ [fieldId]: value }` (см. airtable: `Object.keys(fields)` + фильтр пустых).
  Плюс `buildCustomFieldsValues({ fieldsMeta, values })` — чистая функция, собирает массив `custom_fields_values` в формате API. `fieldsMeta` — тот же список `GET /{entity}/custom_fields` (нужен, чтобы по `field_id` знать тип и enums); `values` — объект из DynamicProperties. Маппинг по типу поля:
    - text/textarea/url/numeric/monetary → `values:[{ value }]`;
    - select/radiobutton → `values:[{ enum_id: <выбранный> }]` (значение prop = `enum_id`);
    - multiselect → `values: [{enum_id},...]`;
    - date/birthday → `values:[{ value: <unix ts, число> }]` (DateTime prop даёт ISO — конвертировать в секунды);
    - checkbox → `values:[{ value: <bool> }]`;
    - multitext (phone/email) → `values:[{ value, enum_code }]`, где `enum_code` = код первого enum поля (`fieldsMeta.enums[0].value` типа `WORK`/`MOB`), иначе `'WORK'`.
  Пропускать поля с пустым/undefined/`''`/пустым массивом значением. Возвращать НОВЫЙ массив (reduce/map, без мутаций). Пустой итог → не слать ключ `custom_fields_values` вовсе (не слать `[]`).
  **Интеграция с actions (T012–T015):** DynamicProperties отдаёт только значения по id — action в `run()` должен ЗАНОВО получить `fieldsMeta` (`GET /{entity}/custom_fields`, тот же вызов) и передать в `buildCustomFieldsValues`. Экспортировать хелпер `fetchCustomFieldsMeta({ auth, entity })`, чтобы actions не дублировали запрос. Всё группировать `export const customFieldsUtils = { customFieldsProperty, buildCustomFieldsValues, fetchCustomFieldsMeta }` (util-file rule; `customFieldsProperty` возвращает Property, но это фабрика-функция, не React — допустимо в объекте).
- **files:** `src/lib/common/custom-fields.ts` + колокейт `custom-fields.test.ts`.
- **pattern:** `Property.DynamicProperties` — airtable `create-record.ts` (`packages/pieces/community/airtable/src/lib/actions/create-record.ts`, чтение); тест — `packages/pieces/community/simplyprint/src/lib/common/__tests__/custom-fields.test.ts`.
- **verify:** общий + `custom-fields.test.ts`: `buildCustomFieldsValues` на моке `fieldsMeta` со всеми типами (select→enum_id, multitext→{value,enum_code}, date→ts, checkbox→bool, пропуск пустого) — assert-based. Реальное подключение к create-lead — в T012.

---

### - [x] V001 — Чекпоинт-валидация блока T001–T005
- **spec:** общая спецификация V-задач (см. шапку). Проверяемый блок: каркас, client, props, фабрика вебхуков, custom fields. Особое внимание: path в `tsconfig.base.json`, схема auth (subdomain/zone/token + validate), корректность `DynamicProperties` кастомных полей.

## Фаза 2 — Триггеры (пачками по сущностям, через фабрику T004)

### - [x] T006 — Триггеры lead (6 шт)
- **spec:** Через `createAmoWebhookTrigger`: `lead_added` (events `['add_lead']`, path `leads.add`), `lead_updated` (`update_lead`, `leads.update`), `lead_status_changed` (`status_lead`, `leads.status`), `lead_responsible_changed` (`responsible_lead`, `leads.responsible`), `lead_deleted` (`delete_lead`, `leads.delete` — без GET, вернуть payload т.к. сущность удалена), `lead_restored` (`restore_lead`, `leads.restore`). entityType `leads`. sampleData — как в kommo (полный lead-объект). Все с `test()`.
- **files:** `src/lib/triggers/lead-*.ts` (6 файлов) + index.
- **pattern:** T004 фабрика.
- **verify:** общий.

### - [x] T007 — Триггеры contact (4 шт)
- **spec:** `contact_added` (`add_contact`, `contacts.add`), `contact_updated` (`update_contact`, `contacts.update`), `contact_responsible_changed` (`responsible_contact`, `contacts.responsible`), `contact_deleted` (`delete_contact`, `contacts.delete`). entityType `contacts`.
- **files:** `src/lib/triggers/contact-*.ts` (4) + index.
- **verify:** общий.

### - [x] T008 — Триггеры company (4 шт)
- **spec:** `company_added` (`add_company`, `companies.add`), `company_updated` (`update_company`, `companies.update`), `company_responsible_changed` (`responsible_company`, `companies.responsible`), `company_deleted` (`delete_company`, `companies.delete`). entityType `companies`.
- **files:** `src/lib/triggers/company-*.ts` (4) + index.
- **verify:** общий.

### - [x] T009 — Триггеры task (3 шт)
- **spec:** `task_added` (`add_task`, `task.add`), `task_updated_or_completed` (`update_task`, `task.update` — в payload флаг `is_completed`), `task_deleted` (`delete_task`, `task.delete`). entityType `tasks`. Ключ payload — `task` (singular), проверить на реальном вебхуке.
- **files:** `src/lib/triggers/task-*.ts` (3) + index.
- **verify:** общий.

### - [x] T010 — Триггеры note (add на lead/contact/company)
- **spec:** `note_added` — один триггер с prop `entity` (StaticDropdown lead/contact/company) через `props`-опцию фабрики T004. Разведка `Rule/NoteLead|NoteContact|NoteCompany.js` подтвердила: во фронтенде Triggeron это ОДНА пара `entity=note`+`action=add`, отдельных событий по родительской сущности НЕТ — различие чисто контекстное. Значит наиболее вероятная реализация: подписка на общее note-событие и фильтрация по выбранной `entity` в `run`. amo webhook settings кандидаты: `note_lead`/`note_contact`/`note_company` ЛИБО единый `add_note` — **проверить на живом вебхуке в T010** (записать в activity.md фактические имена). Если раздельных нет — `events` формируется как `add_note` и в `run` фильтр по `body.<entity>s.note` / типу.
- **payload/`run`:** `fetchFullRecord: false` НЕ подходит (примечание надо догрузить) — но `/notes` top-level нет, поэтому `run` берёт примечание из payload напрямую (payload вебхука note содержит `note_type`, `element_id`, `element_type`, `params.text`) без доп. GET. `testFn`: `GET /leads?limit=1&order[updated_at]=desc` → взять её id → `GET /leads/{id}/notes?limit=5` → `_embedded.notes` (примечания последней сделки как sample).
- **files:** `src/lib/triggers/note-added.ts` + index.
- **verify:** общий. **Открытый вопрос (в activity.md):** точные имена note-событий в webhook settings amo — если недоступны на тестовом аккаунте, реализовать по best-guess `add_note`, пометить непроверенным, НЕ блокировать (lint/build проходят).

### - [x] T011 — Триггер входящего сообщения (chats/talks)
- **spec:** `incoming_message` — подписка на события чатов amoJo/talks. Реализовать по паттерну фабрики; событие `message` (или `add_talk`). **Зависимость:** требует scope Chats API и подключённого канала — задача помечает это в description и, если API недоступно на тестовом аккаунте, оставляет реализацию + отметку `[x]` при успешном lint (без live-проверки вебхука), с пометкой блокера в activity.md.
- **files:** `src/lib/triggers/incoming-message.ts` + index.
- **verify:** общий. **Блокер-кандидат:** scope/канал amoJo.

---

### - [x] V002 — Чекпоинт-валидация блока T006–T011
- **spec:** общая спецификация V-задач. Блок: все webhook-триггеры. Особое внимание: у каждого триггера есть `sampleData` и `test()`; webhook lifecycle (enable/disable) симметричен; payload-пути соответствуют справочнику (`leads.add`, `leads.status`, `task.add`, `note.*`); фабрика T004 используется всеми, нет копипасты.

## Фаза 3 — Экшены CRM-ядра

### - [x] T012 — create/update lead
- **spec:** Два action. `create_lead`: props `name` (required), `price`, `pipelineId`, `statusId`, `responsible_user_id`, `tags` (Array), `contact_id`/`company_id` (dropdown, для привязки), `custom_fields` (`customFieldsProperty({entity:'leads'})` из T005). `POST /leads` body-массив `[{ name, price, status_id, pipeline_id, responsible_user_id, custom_fields_values, _embedded:{ tags:[{name}|{id}], contacts:[{id}], companies:[{id}] } }]`, пустые поля не слать. `update_lead`: prop `lead_id` (dropdown, required) + те же опциональные + custom_fields; `PATCH /leads/{id}` body-объект (не массив).
- **Интеграция custom fields (эталон для T013/T014/T015):** prop `custom_fields = customFieldsUtils.customFieldsProperty({ entity: 'leads' })`. В `run()`: `const fieldsMeta = await customFieldsUtils.fetchCustomFieldsMeta({ auth, entity: 'leads' })`, затем `const cfv = customFieldsUtils.buildCustomFieldsValues({ fieldsMeta, values: propsValue.custom_fields })`; добавить `custom_fields_values: cfv` в body ТОЛЬКО если массив непуст. Пустые скалярные props (`price`, `pipelineId` и т.д.) не слать (`spreadIfDefined`/`spreadIfNotUndefined` из `@activepieces/shared`).
- **tags/связи:** `tags` (Array строк) → `_embedded.tags: [{name}]`; `contact_id`/`company_id` → `_embedded.contacts:[{id}]` / `_embedded.companies:[{id}]`. `create`: `POST /leads` тело — МАССИВ `[{...}]`, ответ `_embedded.leads[0]` вернуть целиком. `update`: `PATCH /leads/{id}` тело — ОБЪЕКТ (не массив); незаполненные props НЕ включать в тело (PATCH иначе затрёт поле).
- **files:** `src/lib/actions/create-lead.ts`, `update-lead.ts` + index.
- **pattern:** kommo `create-new-lead.ts` + custom fields из T005.
- **verify:** общий + lint/tsc (ручной прогон через custom api call не требуется). Это ПЕРВЫЙ потребитель T005 — если пайплайн custom fields не сходится (типы/`.props`/ключевание), чинить здесь. Задача тяжёлая, но механическая: делай ОБА action целиком (update_lead зеркалит create_lead). Не дроби через BLOCKED — BLOCKED в этом цикле означает «пропустить до человека», а не «доделать позже»; помечай BLOCKED только при реальном непреодолимом блокере (см. PROMPT.md), не из-за объёма.

### - [x] T013 — create/update contact
- **spec:** `create_contact`: `name`, `first_name`, `last_name`, `responsible_user_id`, `tags`, `custom_fields` (`entity:'contacts'`) — телефон/email через multitext. `POST /contacts` body-массив. `update_contact`: `contact_id` + опциональные, `PATCH /contacts/{id}`.
- **files:** `src/lib/actions/create-contact.ts`, `update-contact.ts` + index.
- **pattern:** kommo create/update contact + T005.
- **verify:** общий.

### - [x] T014 — create/update company
- **spec:** `create_company`: `name`, `responsible_user_id`, `tags`, `custom_fields` (`entity:'companies'`). `POST /companies` массив. `update_company`: `company_id` + `PATCH /companies/{id}`.
- **files:** `src/lib/actions/create-company.ts`, `update-company.ts` + index.
- **verify:** общий.

### - [ ] T015 — tasks: create / update / complete
- **spec:** `create_task`: props `text` (required), `task_type_id` (`taskTypeDropdown`), `entity_type` (StaticDropdown leads/contacts/companies), `entity_id` (dropdown зависит от entity_type), `responsible_user_id`, и СРОК со сдвигом — `due_offset_value` (Number) + `due_offset_unit` (StaticDropdown minutes/hours/days, ref Triggeron CreateTask), либо `due_at` (DateTime) как альтернатива; вычислить `complete_till` (unix ts = now + offset). `POST /tasks` body-массив `[{ text, complete_till, task_type_id, entity_id, entity_type, responsible_user_id }]`. `complete_task`: `task_id` (required) + `result_text`; `PATCH /tasks/{id}` `{ is_completed: true, result: { text } }`. `update_task`: `task_id` + опциональные text/complete_till/responsible.
- **арифметика `complete_till`:** чистый хелпер `computeCompleteTill({ offsetValue, offsetUnit, dueAt })` → unix секунды. Если задан `dueAt` (DateTime, ISO) — `Math.floor(Date.parse(dueAt)/1000)`. Иначе `now + offsetValue * { minutes:60, hours:3600, days:86400 }[offsetUnit]` (в секундах). amo хранит `complete_till` в секундах. Единицы `minutes/hours/days` ← Triggeron `time_type` (`minut`/`hour`/`day`). Если ни offset, ни dueAt не заданы — дефолт «сегодня, конец дня» или now+1 день (задокументировать выбор в коде).
- **task_types:** `task_type_id` ← `taskTypeDropdown` (T003). entity_type: `leads`/`contacts`/`companies` (amo `entity_type` в API — именно множественное); `entity_id` — dropdown с refresher на `entity_type`.
- **files:** `src/lib/actions/create-task.ts`, `update-task.ts`, `complete-task.ts` + index + колокейт `create-task.test.ts` (или общий common-хелпер + тест).
- **pattern:** kommo (нет task action — писать с нуля по API). Опции срока — Triggeron CreateTask (`task_time`+`time_type`).
- **verify:** общий + тест `computeCompleteTill`: offset в минутах/часах/днях и явный `dueAt` дают ожидаемые секунды (мокнуть `now`).

### - [ ] T016 — notes: create common / system / с файлом
- **spec:** `create_note`: props `entity_type` (leads/contacts/companies), `entity_id`, `note_type` (StaticDropdown: `common`, `service_message`(системное), `call_in`, `call_out`), `text` (required для common/service). `POST /{entity_type}/{id}/notes` body-массив `[{ note_type, params: { text } }]`. Отдельный `create_note_with_file`: prop `file` (`Property.File`), сначала загрузка через amo Files API (`POST /api/v4/files` — session upload), затем note типа `attachment` с `file_uuid`. Если Files API сложен/недоступен — реализовать common/system сейчас, файл вынести подпунктом с `ponytail:`-комментарием и блокером.
- **files:** `src/lib/actions/create-note.ts` (+ `create-note-with-file.ts`) + index.
- **verify:** общий.

### - [ ] V003 — Чекпоинт-валидация блока T012–T016
- **spec:** общая спецификация V-задач. Блок: create/update lead/contact/company, tasks, notes. Особое внимание: custom_fields_values во всех create/update идут через общий `buildCustomFieldsValues` (T005), PATCH-семантика частичного обновления (незаполненные props не затирают поля), notes-типы соответствуют API.

### - [ ] T017 — tags: add / remove / remove-all
- **spec:** amo не имеет delta-endpoint — read-modify-write. `add_tags`: props `entity_type`, `entity_id`, `tags` (Array строк/`tagDropdown`). `GET /{entity}/{id}` → взять `_embedded.tags`, объединить с новыми (`unique`), `PATCH /{entity}/{id}` `{ _embedded: { tags: [{name}|{id}] } }`. `remove_tags`: убрать указанные из текущих + PATCH. `remove_all_tags`: `PATCH` с `_embedded:{ tags: [] }`.
- **Гонка (ponytail — задокументировать, НЕ пытаться победить):** read-modify-write не атомарен — два параллельных запуска flow (или flow + ручное редактирование в amo) между GET и PATCH затрут теги друг друга. У piece-действий нет distributedLock через границы аккаунта, а у amo нет delta-endpoint. `ponytail:`-коммент над PATCH: `read-modify-write, возможна потеря тегов при конкурентных обновлениях одной сущности; delta-endpoint у amo v4 отсутствует, upgrade — только на стороне amo API`. V004 сверит, что ограничение задокументировано.
- **слияние:** теги сущности берутся из `_embedded.tags` (объекты `{id, name}`). add: объединить существующие `name` с новыми, дедуп по `name` (`unique` из `@activepieces/shared`), PATCH `_embedded.tags: [{name}]`. remove: отфильтровать по `name`/`id`. Чистый хелпер `mergeTags`/`removeTags` — тестируемый. `tags`-prop принимает и строки (новые), и значения `tagDropdown` (существующие id) — нормализовать к `{name}`|`{id}`.
- **files:** `src/lib/actions/add-tags.ts`, `remove-tags.ts`, `remove-all-tags.ts` + index + колокейт тест на хелпер слияния.
- **pattern:** Triggeron ChangeTags (`action_type` только `add`/`delete`, режима replace нет — наш `remove_all_tags` это наше расширение через PATCH `tags:[]`). `unique` из `@activepieces/shared`.
- **verify:** общий + тест слияния: add дедуплицирует, remove убирает только указанные, чужие теги сохраняются.

### - [ ] T018 — link / unlink entities
- **spec:** `link_entities`: props `entity_type` (leads/contacts/companies), `entity_id`, `to_entity_type`, `to_entity_id`. `POST /{entity_type}/{id}/link` body-массив `[{ to_entity_id, to_entity_type }]`. `unlink_entities`: `POST /{entity_type}/{id}/unlink` тем же телом.
- **files:** `src/lib/actions/link-entities.ts`, `unlink-entities.ts` + index.
- **pattern:** Triggeron LinkEntity/UnlinkEntity, F5 amoEntityLink.
- **verify:** общий.

### - [ ] T019 — search / find entity
- **spec:** `find_entity`: props `entity_type` (leads/contacts/companies), `query` (ShortText, полнотекст amo `query=`), опциональные `filter_field`/`filter_value` (один `filter[<field>]=<value>`), `sort` (StaticDropdown: `updated_at`/`created_at`, опц. `order` asc/desc → amo `order[<field>]=<dir>`), `limit` (default 50, max 250). `GET /{entity_type}?query=...&filter[<field>]=...&order[...]=...&limit=&with=contacts,companies` → вернуть массив `_embedded[entity_type]` (Router добьёт ветвление finded/not-found; amo отдаёт 204/пустой `_embedded` при отсутствии — вернуть `[]`, не падать). Отдельные тонкие `find_lead`/`find_contact`/`find_company` не нужны — один action с dropdown сущности (ponytail: не плодить 3 копии).
- **Потолок (осознанное упрощение vs Triggeron SearchEntity):** референс поддерживает N фильтров + AND/OR-комбинацию + выбор поля сортировки из полного списка. Мы даём ОДИН фильтр без AND/OR. Причина: сложные условия на платформе добираются несколькими шагами find + Router/фильтрами; полноценный конструктор условий — over-engineering для ночного цикла. `ponytail:`-коммент: один filter-пара; мульти-условия — через несколько шагов + Router, upgrade при спросе. **Синтаксис amo filter не тривиален** (кастомные поля — `filter[custom_fields_values][<field_id>][]=`, статусы — `filter[statuses][0][pipeline_id]=`): в MVP поддержать простые верхнеуровневые поля (`filter[name]`, `filter[responsible_user_id]`, `filter[id]`), в description честно указать, что фильтр по кастом-полям — вне этого action (использовать `query`).
- **files:** `src/lib/actions/find-entity.ts` + index.
- **pattern:** kommo find-lead/find-contact + Triggeron SearchEntity (`search_entity`/`search_fields[]`/`search_type` and|or/`search_sort`).
- **verify:** общий.

### - [ ] T020 — salesbot: run / stop
- **spec:** `run_salesbot`: props `bot_id` (Number/dropdown если есть `GET /salesbot`), `entity_type`, `entity_id`. `POST /salesbot/run` body-массив `[{ bot_id, entity_id, entity_type }]`. `stop_salesbot`: `POST /salesbot/stop` аналогично (проверить точный endpoint amo; если стоп идёт иначе — реализовать доступное, блокер в activity).
- **files:** `src/lib/actions/run-salesbot.ts`, `stop-salesbot.ts` + index.
- **pattern:** Triggeron SalesbotRun/SalesbotStop, F5 salesbot.start_bp.
- **verify:** общий.

### - [ ] T021 — subscribe / unsubscribe user
- **spec:** `subscribe_user` / `unsubscribe_user`: props `entity_type`, `entity_id`, `user_id`. Endpoint амо для подписчиков — уточнить (`POST /{entity}/{id}/subscribers`?). **Открытый вопрос:** если публичного endpoint нет, реализовать через доступный механизм или пометить задачу `BLOCKED` (см. PROMPT.md) и перейти дальше.
- **files:** `src/lib/actions/subscribe-user.ts`, `unsubscribe-user.ts` + index.
- **pattern:** Triggeron EntitySubscribe.
- **verify:** общий.

### - [ ] V004 — Чекпоинт-валидация блока T017–T021
- **spec:** общая спецификация V-задач. Блок: tags (read-modify-write!), links, search, salesbot, subscribers. Особое внимание: read-modify-write тегов не теряет чужие теги при конкурентных обновлениях (задокументировано ли ограничение), BLOCKED-пометки открытых вопросов (T020/T021) оформлены по PROMPT.md.

### - [ ] T022 — catalogs: list / link element / unlink element
- **spec:** `find_catalog_elements`: props `catalog_id` (dropdown из `GET /catalogs`), `query`, вернуть `GET /catalogs/{id}/elements?query=` → `_embedded.elements`. `link_catalog_element`: props `lead_id`, `catalog_id`, `element_id`, `quantity`. `POST /leads/{id}/link` `[{ to_entity_id: element_id, to_entity_type: 'catalog_elements', metadata: { quantity, catalog_id } }]`. `unlink_catalog_element`: `POST /leads/{id}/unlink`.
- **files:** `src/lib/actions/find-catalog-elements.ts`, `link-catalog-element.ts`, `unlink-catalog-element.ts` + `catalogDropdown` в props.ts + index.
- **pattern:** Triggeron LinkCatalogElements/UnlinkCatalogElements.
- **verify:** общий.

---

## Фаза 4 — Каскадные / сложные

### - [ ] T023 — change responsible с каскадом
- **spec:** `change_responsible`: props `entity_type` (leads/contacts/companies), `entity_id`, `responsible_user_id` (`userDropdown`, required), и 6 булевых чекбоксов каскада (ТОЧНЫЙ набор подтверждён разведкой `Trigger/ChangeResponsible.js`): `change_in_linked_company`, `change_in_linked_contacts`, `change_in_linked_open_leads`, `change_in_linked_closed_leads`, `change_in_linked_open_tasks`, `change_in_parent_entity`.
- **Спецрежим `rand` (из Triggeron `resp_id='rand'`):** добавить в `userDropdown`-выбор опцию «Случайный активный пользователь» (значение-маркер, напр. `'rand'`); в `run` при `'rand'` — `GET /users` → выбрать случайного НЕ-заблокированного (`rights.is_active`/не `is_free`). Иначе — конкретный id. Реализовать через доп. StaticDropdown-режим или отдельный чекбокс `random_user` (проще: чекбокс «случайный», тогда `responsible_user_id` опционален).
- **каскад (эндпоинты):** PATCH основной сущности `{ responsible_user_id }`. Затем по включённым флагам:
  - связанные компания/контакты: `GET /{entity}/{id}?with=contacts,companies` → `_embedded.contacts`/`_embedded.companies` → PATCH каждой;
  - связанные сделки (когда основная — контакт/компания): `GET /{entity}/{id}?with=leads` → `_embedded.leads`; открытые/закрытые фильтровать по `closed_at`/статусу (закрытые = статус 142/143 «успех/провал»);
  - задачи: `GET /tasks?filter[entity_type]=<...>&filter[entity_id]=<id>&filter[is_completed]=0` (открытые) → PATCH каждой `{ responsible_user_id }`;
  - `change_in_parent_entity`: «родитель» = сущность, из которой создан текущий контакт/задача (напр. для задачи — её `entity_id`/`entity_type`; для контакта основной lead). Уточнить в коде и задокументировать трактовку.
- **Потолок N+1 (ponytail):** каскад делает по одному PATCH на связанную сущность/задачу — на сущности с сотнями связей это N+1. amo поддерживает batch-PATCH массивом (`PATCH /leads` телом-массивом до 250) — по возможности батчить обновления однотипных сущностей одним запросом; для задач — тоже. `ponytail:`-коммент, если батч не осилить: последовательные PATCH, upgrade — батч-эндпоинт. Иммутабельная сборка списка обновлений (map/reduce, без push).
- **files:** `src/lib/actions/change-responsible.ts` + index.
- **pattern:** Triggeron ChangeResponsible (6 чекбоксов + `rand`), Sensei responsible.
- **verify:** общий. Тяжёлая, но механическая задача — реализуй все ветви каскада в одной итерации (делегируй однотипные ветви Sonnet-агенту по этой спеке). Не дроби через BLOCKED из-за объёма: BLOCKED = «пропустить до человека». Если конкретная ветвь упирается в недоступный эндпоинт/скоуп — реализуй остальные, а недоступную помечай в activity.md как непроверенную (не блокируя всю задачу).

### - [ ] T024 — copy / clone lead
- **spec:** `copy_lead`: props `source_lead_id` (required), `copy_notes` (Checkbox), `copy_tasks` (Checkbox), `new_name` (optional override), `target_pipeline_id`/`target_status_id` (optional). `GET /leads/{id}?with=contacts,companies,catalog_elements` → сформировать новый POST /leads с теми же name/price/custom_fields/tags/связями; при `copy_notes` — `GET /leads/{id}/notes` и создать их на новой сделке; при `copy_tasks` — аналогично. Вернуть новый lead (save_id).
- **тонкости:** копировать `custom_fields_values` из источника напрямую (они уже в формате API — переиспользовать, не пересобирать). `target_status_id` по умолчанию — статус источника, НО не копировать в системный статус «Неразобранное»/unsorted (в Triggeron CopyLead он явно скипается): если целевой статус не задан и источник в unsorted — класть в первый нормальный статус целевой воронки. Связи (`_embedded.contacts/companies`) переносить по id. `copy_notes`/`copy_tasks` — доп. GET+POST на новую сделку (это N доп. запросов, ок для одиночного копирования).
- **files:** `src/lib/actions/copy-lead.ts` + index.
- **pattern:** Triggeron CopyLead (`lead_name`/`tags`/`resp_id`/`pipeline_id`/`status_id`/скип unsorted)/WidgetCopyLead, Sensei lead (copy notes, save_id).
- **verify:** общий.

---

## Фаза 5 — Дропдауны-полировка + P2-механики

### - [ ] T025 — Полировка дропдаунов и generic webhook действие
- **spec:** Пройтись по всем дропдаунам: добавить `refreshers` где нужно (statusDropdown зависит от pipelineId; entity_id зависит от entity_type в action'ах — через `Property.Dropdown` с refresher на выбранный тип). Убедиться, что `entity_id`-дропдауны в T015/T017/T018/T023 корректно рефрешатся по `entity_type`. Добавить action `send_webhook` (метод/URL/headers/body) — тонкая обёртка, если custom api call не покрывает нужный кейс (иначе пропустить с пометкой: HTTP piece + custom api call покрывают; `ponytail:`).
- **files:** правки `src/lib/common/props.ts`, опц. `src/lib/actions/send-webhook.ts`.
- **verify:** общий.

### - [ ] T026 — P2: ожидание выполнения задачи (waitpoint)
- **spec:** action `wait_for_task_completed`: создаёт задачу (как T015) с `complete_till`, затем `context.run.pause({ pauseMetadata: { type: WEBHOOK, response: {} } })` и генерирует resume URL; резюм происходит при вебхуке `update_task` c `is_completed=true`. Реализовать через `context.generateResumeUrl()` + подписку: при enable подписать вебхук task_completed на resume URL. Если полный резюм-цикл в одном action недостижим (нужен trigger-side) — реализовать пару: action создаёт задачу + помечает store, trigger `task_completed` резюмит. Спроектировать минимально; при сложности — `ponytail:` и блокер.
- **files:** `src/lib/actions/wait-for-task-completed.ts`.
- **pattern:** платформенные waitpoints (`ctx.run.pause`, `generateResumeUrl`).
- **verify:** общий.

### - [ ] T027 — P2: ожидание ответа клиента
- **spec:** По аналогии с T026, но резюм по входящему сообщению (T011 incoming_message). Зависит от доступности Chats API. Если недоступно — реализовать каркас + блокер.
- **files:** `src/lib/actions/wait-for-customer-reply.ts`.
- **verify:** общий. **Зависимость:** T011, Chats API scope.

### - [ ] V005 — Чекпоинт-валидация блока T022–T027
- **spec:** общая спецификация V-задач. Блок: catalogs, каскад responsible, copy lead, полировка, waitpoint-механики. Особое внимание: waitpoint-экшены (T026/T027) корректно используют `ctx.run.pause`/resume и не ломают сборку при недоступном Chats API; каскад responsible не делает N+1 по связанным сущностям без нужды.

### - [ ] T028 — Финальный прогон: i18n, локали, lint-sweep, sampleData
- **spec:** Проверить, что все `displayName`/`description` присутствуют в `src/i18n/translation.json` (identity). Заполнить недостающие `sampleData` у триггеров. Прогнать `npm run lint-dev` по всему репо и устранить остатки. Проверить, что piece корректно грузится (нет дублей `name` у actions/triggers, все зарегистрированы в index). Обновить `README.md` piece.
- **files:** `src/i18n/translation.json`, точечные правки.
- **verify:** `npm run lint-dev` чисто + сборка piece.

---

## Вне ночного цикла (НЕ задачи цикла)

Виджет amoCRM (внешний проект): `manifest.json` (locations digital_pipeline / salesbot_designer / *card / *list / advanced_settings), DP-шаг-приёмник вебхука → запуск/останов flow, Salesbot handler, кнопки на карточке (+массовый запуск из списков), embedding через JWT (`externalProjectId` = id аккаунта amo, `piecesFilterType: ALLOWED`, `locale: 'ru'`), OAuth2 для marketplace-дистрибуции. Требует дизайна redirect-flow под cloud/self-hosted (см. открытый вопрос бэклога). Делается отдельно после стабилизации piece.

P3 RU-экосистема (отдельные pieces, не в этом цикле): smsc.ru, sms.ru, WhatsApp с amo-контекстом, Dadata, документы по шаблону, телефония sipuni, уведомления сотрудникам через виджет.

P2 общие (отдельные generic pieces, не amocrm): A/B-сплиттер по весам, limiter/throttle+антицикл. Кандидаты в мелкие pieces — вне piece amocrm.

## Открытые вопросы (перенесены в тело задач где применимо)
- Точные имена note-событий в webhook settings amo (T010).
- Endpoint подписчиков сущности (T021).
- Endpoint stop salesbot (T020).
- Chats/Talks API scope для сообщений (T011, T027).
- Files API для примечаний-вложений (T016).
