# Activity log — piece amoCRM (Ralph-цикл)

Хронологический лог итераций. Одна запись на итерацию/задачу. Новые записи — сверху вниз в порядке выполнения.

### 2026-07-11 — T008: Триггеры company (4 шт)
- Статус: done
- Изменения: 4 триггера через `createAmoWebhookTrigger` (T004) — `company-added.ts` (`add_company`, `companies.add`), `company-updated.ts` (`update_company`, `companies.update`), `company-responsible-changed.ts` (`responsible_company`, `companies.responsible`), `company-deleted.ts` (`delete_company`, `companies.delete`, `fetchFullRecord: false`, sampleData `{id}`); общий `company-sample.ts` (полный company-объект, переиспользуется 3 триггерами — как lead/contact-sample); регистрация в `triggers/index.ts` (импорт + массив `amocrmTriggers`, +4); i18n +8 ключей (displayName/description). entityType `companies`, у add/update/responsible — дефолтный `test()` фабрики. aiMetadata у каждого. Прямое зеркало T007, без новой логики.
- Команды: `npx turbo run lint --filter=@activepieces/piece-amocrm` — pass (5/5); `npx turbo run build --filter=@activepieces/piece-amocrm` — pass (5/5); `npm run lint-dev` — 0 errors (72 предсуществующих warning в web, вне скоупа).
- Верификация: pass. Дифф — 4 идентичных вызова фабрики + sample + регистрация; ручная сверка (уникальность name, регистрация в index+массиве, i18n identity, payload-пути по справочнику `companies.add/update/responsible/delete`) — находок нет; отдельный code-review излишен для механического зеркала T007 (фабрика T004 провалидирована живым вебхуком в T006). Токен-чек: `git diff | grep -c eyJ0` = 0.
- Блокеры: нет.

## Формат записи

```
### <дата ISO> — <ID задачи>: <название>
- Статус: done | blocked | partial
- Изменения: какие файлы созданы/изменены (кратко)
- Команды: что запускалось (сборка/тесты/lint)
- Верификация: результат verify (pass/fail + вывод по существу)
- Блокеры: что помешало / открытые вопросы / что вынесено дальше
```

## Лог

### 2026-07-11 — T007: Триггеры contact (4 шт)
- Статус: done
- Изменения: 4 триггера через `createAmoWebhookTrigger` (T004) — `contact-added.ts` (`add_contact`, `contacts.add`), `contact-updated.ts` (`update_contact`, `contacts.update`), `contact-responsible-changed.ts` (`responsible_contact`, `contacts.responsible`), `contact-deleted.ts` (`delete_contact`, `contacts.delete`, `fetchFullRecord: false`, sampleData `{id}`); общий `contact-sample.ts` (полный contact-объект, переиспользуется 3 триггерами — как lead-sample в T006); регистрация в `triggers/index.ts` (импорт + массив `amocrmTriggers`); i18n +8 ключей (displayName/description). entityType `contacts`, у add/update/responsible — дефолтный `test()` фабрики. aiMetadata у каждого. Зеркало T006, без новой логики.
- Команды: `npx turbo run lint --filter=@activepieces/piece-amocrm` — pass (5/5); `npx turbo run build --filter=@activepieces/piece-amocrm` — pass (5/5); `npm run lint-dev` — 0 errors (72 предсуществующих warning в web, вне скоупа).
- Верификация: pass. Дифф — 4 идентичных вызова фабрики + sample + регистрация; ручная сверка (уникальность name, регистрация в index+массиве, i18n identity, payload-пути по справочнику) — находок нет; отдельный code-review излишен для механического зеркала T006 (фабрика T004 уже провалидирована живым вебхуком в T006). Токен-чек: `git diff | grep -c eyJ0` = 0.
- Блокеры: нет.

### 2026-07-11 — T006: Триггеры lead (6 шт)
- Статус: done
- Изменения: 6 файлов через фабрику `createAmoWebhookTrigger` (T004) — `src/lib/triggers/lead-added.ts` (`add_lead`, `leads.add`), `lead-updated.ts` (`update_lead`, `leads.update`), `lead-status-changed.ts` (`status_lead`, `leads.status`), `lead-responsible-changed.ts` (`responsible_lead`, `leads.responsible`), `lead-deleted.ts` (`delete_lead`, `leads.delete`, `fetchFullRecord: false` — сущность удалена, sampleData `{id}`), `lead-restored.ts` (`restore_lead`, `leads.restore`); общий `lead-sample.ts` (полный lead-объект, переиспользуется 5 триггерами — ponytail: без 6 копий); `triggers/index.ts` (`amocrmTriggers`); `src/index.ts` (импорт + `triggers: amocrmTriggers`); i18n +12 ключей (displayName/description каждого). entityType `leads`, у всех кроме delete — дефолтный `test()` фабрики (`GET /leads?limit=5&order[updated_at]=desc`). aiMetadata у каждого. Один файл = один триггер, имена уникальны.
- Команды: `npx turbo run lint --filter=@activepieces/piece-amocrm` — pass (5/5); `npx turbo run build --filter=@activepieces/piece-amocrm` — pass (5/5); `npm run lint-dev` — pass (30/30, 0 errors).
- Верификация: pass. Smoke на dev-стенде (первый живой вебхук — снял допущения T004/шапки): `POST /api/v4/webhooks` с `settings:[add_lead,update_lead,status_lead,responsible_lead,delete_lead,restore_lead]` → **201**, ответ эхом вернул все 6 событий как `{<event>:1}` — **все имена событий валидны для amo v4** (спека подтверждена). `DELETE /api/v4/webhooks` по `{destination}` → **204** — lifecycle enable/disable симметричен, удаление по destination работает (webhookId не нужен, как и решено в T004). Допущение о нескольких вебхуках с разным destination: amo хранит settings per-destination (подтверждено формой ответа), конфликта между flow-триггерами нет. code-review: дифф — 6 идентичных вызовов фабрики + данные, ручная сверка (уникальность name, регистрация в index+массиве, i18n identity) — находок нет.
- Блокеры: нет.

### 2026-07-10 — T001: Scaffold piece + auth + validate
- Статус: done
- Изменения: `packages/pieces/community/amocrm/` — `package.json`, `tsconfig.json`, `tsconfig.lib.json`, `.eslintrc.json`, `README.md`, `src/index.ts` (createPiece + createCustomApiCallAction, ponytail-коммент про логотип-заглушку), `src/lib/auth.ts` (CustomAuth: subdomain/zone/apiToken + validate через GET /account), `src/i18n/translation.json`. Плюс path `@activepieces/piece-amocrm` в `tsconfig.base.json` и механический `bun.lock`. Каркас был частично создан оборвавшейся прошлой итерацией (без коммита и записи) — эта итерация доверила, доверификовала и закоммитила. `project.json` не создавался: у kommo его нет, репо на turbo.
- Команды: `npx turbo run lint --filter=@activepieces/piece-amocrm` — pass (5/5 tasks); `npx turbo run build --filter=@activepieces/piece-amocrm` — pass (5/5); `npm run lint-dev` — 0 errors (72 предсуществующих warning в web, вне скоупа); smoke на dev-стенде: `GET /api/v4/account` c валидным токеном → 200, с невалидным → 401 (validate отработает верно).
- Верификация: pass. code-review (low) по диффу — находок нет.
- Блокеры: нет. Замечания: (1) `ralph/ralph.sh` изменён в рабочем дереве (добавлен `--model fable`) — вне разрешённых путей итерации, оставлен незакоммиченным (позже закоммичен параллельно человеком/оркестратором как c34c7e0e); (2) `tryCatch` реэкспортируется из `@activepieces/pieces-framework` — в piece импортируем оттуда, не из `@activepieces/shared` (import boundary); (3) **commitlint запрещает заглавные в subject** — `feat(amocrm): T001 ...` отклоняется, использовать строчное `t001`.

### 2026-07-10 — T002: common/client.ts — makeRequest + пагинация
- Статус: done
- Изменения: `src/lib/common/client.ts` (`amoClient = { makeRequest, fetchAllPages }`: named params, URL из subdomain/zone, Bearer, tryCatch, читаемые ошибки из тела amo; пагинация page++ с остановкой по отсутствию `_links.next`/пустому `_embedded`, жёсткий предел 100 страниц), `src/lib/common/index.ts` (реэкспорт), колокейт `client.test.ts` (4 теста: URL/заголовки, проброс ошибки amo, склейка 2 страниц + остановка, пустой 204-ответ).
- Решение: спека требует `ActivepiecesError`, но он живёт в `@activepieces/shared`, запрещённом для pieces (import boundary), и НЕ реэкспортируется из `pieces-framework` — бросаю обычный `Error` с `amoCRM API error (<status>): <body>` (HttpError из pieces-common даёт status/body). В тесте есть `as HttpRequest` на mock.calls — это принятый паттерн репо (coupa client.test.ts), тип теряется в vi.spyOn.
- Команды: `npx turbo run lint --filter=@activepieces/piece-amocrm` — pass (5/5); `npx vitest run .../client.test.ts` — 4/4 passed; `npx turbo run build --filter=@activepieces/piece-amocrm` — pass; `npm run lint-dev` — 0 errors (те же 72 предсуществующих warning в web). Корневой `npm run test-unit` piece-тесты не подхватывает (script фильтрует engine/shared/web) — по спеке достаточно локального vitest.
- Верификация: pass. code-review (low) — находок нет. Smoke на dev-стенде: `GET /api/v4/leads?page=1&limit=1` → ключи `_embedded.leads`, `_links.next` — форма совпадает с реализацией fetchAllPages.
- Блокеры: нет.

### 2026-07-10 — T004: Фабрика webhook-триггеров + lifecycle
- Статус: done
- Изменения: `src/lib/common/webhooks.ts` (`createAmoWebhookTrigger` — named-params фабрика, `TriggerStrategy.WEBHOOK`: `onEnable` POST /webhooks `{destination, settings: events}`, `onDisable` DELETE /webhooks `{destination}` без хранения webhookId, `run` идёт по `payloadPath` (split '.'), маппит ВСЕ записи события, при `fetchFullRecord`(default true) GET `/{entityType}/{id}?with=contacts,companies,catalog_elements` иначе возвращает payload как есть, `test` параметризуем через `testFn` иначе дефолт GET `/{entityType}?limit=5&order[updated_at]=desc`, опциональные `props`); `src/lib/common/index.ts` (+реэкспорт webhooks). Разбор payload через `unknown` + гварды (`isRecord`/`resolveEventEntries`/`readId`), без any/as; типы в конце файла.
- Команды: `npx turbo run lint --filter=@activepieces/piece-amocrm` — pass (5/5); `npx turbo run build --filter=@activepieces/piece-amocrm` — pass (5/5); `npm run lint-dev` — 0 errors (те же 72 предсуществующих warning в web, вне скоупа).
- Верификация: pass. code-review (low) по файлу — находок нет. Типизация `context.auth.props` в trigger-контексте прошла tsc — auth-распаковка через `.props` корректна и для триггеров (как в props.ts). Фабрика без потребителей — живой вебхук проверится в T006.
- Блокеры: нет. Заметки: (1) `onDisable` шлёт DELETE без guard — если вебхук уже удалён, amo может вернуть 404 и makeRequest бросит; поведение предписано спекой (удаление по destination), проверить на живом вебхуке в T006. (2) `run` использует `Promise.all` GET'ов — для не-delete событий сущность существует; delete-события идут с `fetchFullRecord: false`, GET не выполняется.

### 2026-07-10 — T005: динамические props кастомных полей
- Статус: done
- Изменения: `src/lib/common/custom-fields.ts` (`customFieldsUtils = { customFieldsProperty, fetchCustomFieldsMeta, buildCustomFieldsValues }`: DynamicProperties с ключеванием `String(field.id)`, маппинг amo-типов → Property (textarea→LongText, numeric/monetary→Number, select/radiobutton→StaticDropdown enum_id, multiselect→StaticMultiSelectDropdown, checkbox→Checkbox, date/date_time/birthday→DateTime, text/url/multitext/неизвестные→ShortText); `buildCustomFieldsValues` — чистая, скип пустых/неизвестных id, NaN-даты и NaN-enum_id отбрасываются, multitext берёт `enum_code` из `enums[0].value` c фолбэком `'WORK'`), колокейт `custom-fields.test.ts` (9 тестов), реэкспорт в `common/index.ts`, ключ `Custom Fields` в i18n.
- Решения сверх спеки (подтверждены живым API): (1) на dev-стенде есть тип `date_time` (не упомянут в спеке) — добавлен в date-группу (unix-секунды); (2) тип `tracking_data` (19 utm-полей на leads) — падает в ShortText-фолбэк, как и любые будущие неизвестные типы; (3) числовое значение date-поля трактуется как уже готовые unix-секунды (ISO — из DateTime prop). Живые формы: `/leads/custom_fields` и `/contacts/custom_fields` → `_embedded.custom_fields`, у multitext коды лежат в `enums[].value` (`WORK`/`MOB`/...) — спека подтверждена.
- Команды: `npx vitest run .../custom-fields.test.ts` — 9/9 passed; `npx turbo run lint --filter=@activepieces/piece-amocrm` — pass (5/5); `npx turbo run build --filter=@activepieces/piece-amocrm` — pass (5/5); `npm run lint-dev` — 0 errors (те же 72 предсуществующих warning в web).
- Верификация: pass. code-review (low) — находок нет. Коммит 1f760572.
- Блокеры: нет. Заметка для T012: в `run()` экшена — `fetchCustomFieldsMeta({ auth: context.auth.props, entity })` → `buildCustomFieldsValues({ fieldsMeta, values: propsValue.custom_fields ?? {} })`, ключ `custom_fields_values` добавлять только при непустом массиве.

### 2026-07-11 — V001: чекпоинт-валидация блока T001–T005
- Статус: done (фиксов кода не потребовалось)
- Изменения: только `ralph/prd.md` (чекбокс V001) и эта запись.
- Команды: `npx turbo run build --filter=@activepieces/piece-amocrm` — pass (5/5); `npm run lint-dev` — 0 errors (72 предсуществующих warning в web); `npm run test-unit` — engine/shared зелёные, **web#test падает: 8 тестов** в `output-table-view.test.ts` (3) и `utils-schema.test.ts` (5) — предсуществующий фейл, `git diff main -- packages/web` пуст (ветка web не трогает), чинить нельзя (вне разрешённых путей); `git status` — чисто.
- Структура: в `src/lib/` только `auth.ts` + `common/` (actions/triggers ещё нет — регистрация тривиально консистентна); grep `: any|as [A-Z]` вне тестов — 0 совпадений; все displayName/description/placeholder из исходников присутствуют в `i18n/translation.json` (сверено списками).
- Скоуп: piece-коммиты (t001–t005) чистые; файлы вне разрешённого списка в диффе против main (`.agents/designs/`, `.claude/settings.json`, `.claude/scheduled_tasks.lock`, `.gitignore`) — из chore(ralph)-коммитов оркестратора 792b25c3/c34c7e0e, не из итераций; `bun.lock` — механический результат t001.
- Сверка со спеками: sonnet-верификатор (свежий контекст) прошёл T001–T005 попунктно — **все пять соответствуют**, расхождений нет; отдельно подтвердил, что flat `auth.subdomain` в `validate` (без `.props`) корректен для validate-callback (сверено с framework и coupa). code-review (low) по диффу блока: runtime-багов нет; 1 заметка — `extractEmbedded`/`isRecord` продублированы в webhooks.ts/props.ts/custom-fields.ts/client.ts; осознанно оставлено (не баг, вынос в общий модуль — рефакторинг вне чекпоинта, кандидат при росте piece).
- Блокеры: нет. Наблюдение вне скоупа: предсуществующие 8 красных web-тестов (см. выше) — репо-долг, не связан с amocrm.

### 2026-07-10 — T003: common/props.ts — дропдауны с пагинацией
- Статус: done
- Изменения: `src/lib/common/props.ts` (фабрики `pipelineDropdown`/`statusDropdown` (refresher pipelineId)/`userDropdown`/`taskTypeDropdown` (GET /account?with=task_types)/`tagDropdown({entity})`/`lossReasonDropdown` (required: false, без параметров)/`leadDropdown`/`contactDropdown`/`companyDropdown` — последние три через общий `entityDropdown`, одна страница `limit=250&order[updated_at]=desc`, label `name (id)`, ponytail-коммент про потолок 250; справочники — через `fetchAllPages`; разбор ответов через unknown + гварды `toOptions`/`extractEmbedded`, без any/as), `src/lib/common/index.ts` (реэкспорт props), `src/i18n/translation.json` (+11 ключей: displayName'ы и плейсхолдеры).
- Команды: `npx turbo run lint --filter=@activepieces/piece-amocrm` — pass (5/5); `npx turbo run build --filter=@activepieces/piece-amocrm` — pass (5/5); `npm run lint-dev` — 0 errors (72 предсуществующих warning в web). Smoke на dev-стенде: `/account?with=task_types` → `_embedded.task_types` массив (форма подтверждена); `/leads/tags` пагинирован (`_links.next`); `/leads/pipelines?page&limit`, `/leads/pipelines/{id}/statuses?page&limit`, `/users?page&limit`, `/leads?limit=250&order[updated_at]=desc` — все 200 (эндпоинты терпят параметры fetchAllPages/entity-дропдаунов).
- Верификация: pass. code-review (low) по диффу — находок нет.
- Блокеры: нет. Заметка: тип значения всех дропдаунов — number (id amo); `tagDropdown` — одиночный Dropdown, T017 при необходимости обернёт/расширит под множественный выбор.

