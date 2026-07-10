# Бэклог: piece «amoCRM» + виджет amoCRM (по итогам разведки референсов)

Сводка разведки `reference/` (Sensei, Triggeron, F5 BPMN) против текущего `@activepieces/piece-kommo`.
Цель продукта: аналог этих виджетов нативно на платформе — триггеры/экшены через piece,
запуск из amoCRM через собственный виджет (DP/Salesbot/карточки), доступ клиентам через embedding.

Дата разведки: 2026-07-10. Источники: `reference/triggeron/widget/vendor/Triggeron.js`,
`reference/sensei/constructor-js/chunk-FEDDJ7O7.js`, `reference/bpmn/editor-js/CXgT_z6j.js` + локализации.

---

## 1. Текущее состояние: `@activepieces/piece-kommo`

**Auth:** `CustomAuth` (subdomain + long-lived token), API v4 `https://{subdomain}.kommo.com/api/v4`.
Для amoCRM нужен отдельный piece (домен `amocrm.ru`, OAuth2 или long-lived token).

**Триггеры (4, все WEBHOOK):** `new_lead_created`, `lead_status_changed`, `new_contact_added`, `new_task_created` (без test()).
Паттерн: `POST /webhooks {destination, settings:[...]}` на enable, `DELETE /webhooks` на disable + догрузка сущности `GET /{entity}/{id}`.

**Экшены (7):** create_lead, update_lead, create_contact, update_contact, find_lead, find_contact, find_company + generic custom API call.

**Динамические дропдауны:** pipelines, statuses (по pipeline), users, loss_reasons, leads/contacts/companies (без поиска/пагинации).

**Известные пробелы реализации:**
- [ ] Нет `validate` в auth
- [ ] `makeRequest` на raw `httpClient` — ок для piece, но проверить SSRF-политику
- [ ] Дропдауны сущностей без query/пагинации (умрут на больших аккаунтах)
- [ ] Несколько триггеров = несколько вебхуков с одним destination — проверить конфликты
- [ ] `webhookId` в store — мёртвый код

---

## 2. Полные инвентари референсов

### 2.1 Triggeron — 31 событие (`event_types`)

| Группа | События |
|---|---|
| Служебные | CustomRule (ручной/по кнопке/из другого правила) |
| Сделки | LeadsAdd, LeadsUpdate, LeadsStatus, LeadsResponsible |
| Контакты | ContactsAdd, ContactsUpdate, ContactsResponsible |
| Компании | CompanyAdd, CompanyUpdate, CompanyResponsible |
| Задачи | TaskAdd, TaskUpdate (изменена/выполнена), TaskResponsible |
| Примечания | NoteLead, NoteContact, NoteCompany |
| Чаты | MessageAdd (входящее/исходящее сообщение) |
| Партнёрские (Mailer) | MailerEmailSended, MailerEmailOpened, MailerFileOpened, MailerPageCreated, MailerPageOpened, MailerFormSended |
| Партнёрские (Docsgen) | DocsgenDocumentGenerate, DocsgenDocumentRegenerate, DocsgenDocumentDelete |
| Партнёрские (диски) | GoogleDriveFileUploaded, GoogleDriveFolderCreated, YandexDiskFileUploaded, YandexDiskFolderCreated |
| Отдельная механика | Hook — входящий внешний вебхук `{ihooks_host}/in/{hash}` |

### 2.2 Triggeron — 54 действия (`trigger_actions`, 49 у Kommo)

**change:** ChangeLeadFields, LeadStatusChange, ChangeContactFields, ChangeCompanyFields, ChangeTask, ChangeResponsible (+каскад на связанные), ChangeTags, ChangeGvar, Normalizer (телефон/email), LinkCatalogElements, UnlinkCatalogElements.

**create:** CreateLead, CopyLead, CreateContact, CreateCompany, CreateTask (срок со сдвигом мин/час/день), CreateResultTask (с предустановленными результатами), CreateNote, CreateSysNote.

**do:** ExecuteRule, DelayOff (отмена отложенного действия — rule→case→trigger), SendWebhook (метод/headers/body + правило-обработчик ответа), SalesbotRun, SalesbotStop, EntitySubscribe, LinkEntity, UnlinkEntity, SearchEntity (OR/AND-условия + ветвление finded/failed rule).

**widget:** SendByNotifier (modal/toast сотруднику), CreateMailerPage, RemovePageLink, SendByMailerTemplate, EditMessageByTelegram, SendByTelegram, SendFilesByTelegram, RemoveMessageByTelegram, SendBySmser*, GenerateDocument, PullRequisites*, AddToDictDadata*, RemoveFromDictDadata*, CreateCheckList, CreateKassaInvoice*, WidgetSuperButtons, WidgetCopyLead, WidgetRespool, WidgetRespoolChangeUserStatus, ExecuteCalcfield, ExecuteBpmnProcess, StopBpmnProcess, SheetsLite, WidgetVoiceAiTranscribe, SendByChatter, MeetAiCreateMeet, WidgetMaximus. (* — только amoCRM RU, недоступны в Kommo.)

**Механики:** Rule → Cases (ветки-условия) → Triggers (действия); отложенные действия + DelayOff; тарифные лимиты (`max_rules_count`, `max_case_conditions_count`, `min_freq_time` — антицикл, `allow_operations`); группы правил; запуск из DP с задержкой (`dp_delay_type/value`).

### 2.3 Sensei — 37 типов блоков (`constructor.elements.*`)

**Запуск процесса (не блоки!):** Digital Pipeline (`dp.webhook_url` → `process_id`, `start/stop`, `close_tasks`), Salesbot handler, кнопки на карточке (+модалка start/stop, restart: start_over/last_element), подпроцесс.

**CRM:** task (ожидание результата, варианты/кнопки), note, tag, status, field, superfield/superfunctions (формулы), responsible, queueuser (распределение: группа/маски/пользователи + расписание + каскад), lead (копирование примечаний, save_id).

**Коммуникации:** mail (корп. ящик амо), mandrill, senseimailer (свой email-маркетинг + ветвление sent/delivered/open/click/reply/unsubscribe), smsc, smsru, sipuni (телефония), telegrambot (+wait), whatsapp (шаблоны header/body/footer/buttons, каталог товаров, события delivered/read/answer), maxbot, b2bfamily, salesbot.

**Логика:** if (2 ветки, датные операторы, день недели, or), multicondition (N веток), splitter (A/B по весам), wait (время/параметр), limiter (allow/disable — троттлинг).

**Интеграции/прочее:** webhook (+wait_time + маппинг ответа в параметр), privatewidget, process (подпроцесс + параметры + main_process), getdoc (PDF), form (поля + workplaces), script, js, hyperscript (свой DSL), css, assistant (AI), robocode (скриптовый движок), end (с результатом), start, fake.

**Механики:** глобальные/локальные параметры процесса; встроенное ожидание почти в каждом «внешнем» блоке; результат процесса на end.

### 2.4 F5 BPMN — 39 типов шагов (реестр `tU`)

**Запуск (не в редакторе):** DP (`bp_id` + `bp_action=start/stop`, пока только lead), Salesbot (`salesbot.start_bp`), карточки/списки (lead/contact/company, массовый запуск), `process/{id}/continue|stop` (резюме после задачи), executeProcess (подпроцесс).

**CRM:** leadCreate, leadField, leadStatus, contactCreate, contactField, companyCreate, companyField, tag (+удалить все), responsible, note (текст/гео/файл), amoEntityLink, amoEntitySearch (found/not_found).

**Задачи/AI/коммуникации:** task (ветка task_result), salesbot, chatAi/chatAiTool (диалоговый AI + function-calling, ветки manager_intercepted/no_response), f5Ai (one-shot AI), webFetcher (скрапер: текст/HTML).

**Логика:** condition, multicondition (+otherwise), wait (сек/timestamp/datetime/переменная), stop (с результатом), changeVars, executeJavaScript, executeCss, executeProcess (синхронный call activity), form (видимость: все/группы/ответственный), webhook + webhook_result (receive-callback).

**Виджеты:** widgetMailer, widgetSmser, widgetTelegron, widgetMax, widgetChatter, widgetSuperButtons, widgetCalcfield, widgetDadata, widgetDocsgen, widgetSheetsLite, widgetRespool, widgetTriggeron.

**Механики:** граф `bp.steps[id] = {type, params, pos, next, entity_types}` + `bp.start[]`; Result*-компонент на каждый шаг (лог выполнения на канвасе); библиотека готовых AI-шаблонов под ~15 отраслей; шаринг процессов (`/shared/bp/`).

---

## 3. Что закрывает платформа нативно (в piece НЕ делать)

| Механика референсов | Аналог в Zen-flow |
|---|---|
| if / multicondition / cases | Router |
| wait (время/дата/переменная) | Delay piece + waitpoints |
| ожидание результата внутри шага | `ctx.run.pause` / waitpoints + resume URL |
| переменные процесса, ChangeGvar | Variables + Storage piece |
| superfunctions / Calcfield / Normalizer | core-formula (~100 функций) |
| SendWebhook + обработчик ответа | HTTP piece + Webhook trigger (`returnsResponse`) |
| js / robocode / executeJavaScript | Code piece (TS + npm) |
| ExecuteRule / executeProcess / process | Subflows |
| assistant / chatAi / f5Ai / промпт-шаблоны | Agent step + AI providers + Knowledge Base |
| form (Sensei/BPMN) | Human Input (forms/chat) |
| SheetsLite | piece google-sheets |
| Hook (входящий вебхук) | Webhook trigger |
| входные лимиты/биллинг клиентов | project limits через embedding JWT |
| шаринг шаблонов процессов | Templates (custom, `manageTemplatesEnabled`) |

Нет из коробки (кандидаты в отдельные мелкие pieces/фичи): A/B-сплиттер по весам, limiter (троттлинг ветки), точечный DelayOff (отмена отложенного шага).

---

## 4. Бэклог

### P0 — piece «amoCRM»: паритет CRM-ядра

Триггеры (webhook, паттерн из kommo готов; settings из API амо):
- [ ] lead: add, update, status_changed, responsible_changed, deleted, restored
- [ ] contact: add, update, responsible_changed, deleted
- [ ] company: add, update, responsible_changed, deleted
- [ ] task: add, update/completed, deleted
- [ ] note: add (lead/contact/company)
- [ ] incoming message (talks/chats API — проверить доступность по scope)
- [ ] test() для всех триггеров (в kommo new_task_created без test)

Экшены:
- [ ] **Custom fields: динамический дропдаун (`GET /{entity}/custom_fields`) + установка значения по field_id/enum_id** — разблокирует половину сценариев, самый важный пункт
- [ ] tasks: create (тип, срок со сдвигом, результат), update, complete
- [ ] notes: create common/system/с файлом (lead/contact/company)
- [ ] companies: create, update
- [ ] leads: copy/clone; привязка контакта/компании при создании
- [ ] tags: add/remove/remove-all как отдельные экшены (все сущности)
- [ ] link/unlink entities (`POST /{entity}/{id}/link`, `/unlink`)
- [ ] search entity по условиям (leads/contacts/companies, фильтры API + `query`) — Router добьёт ветвление
- [ ] change responsible с каскадом (связанные компания/контакты/сделки/задачи)
- [ ] catalogs: list, link/unlink elements (товары)
- [ ] salesbot: run/stop (`POST /salesbot/run`)
- [ ] subscribe/unsubscribe пользователей на сущность
- [ ] улучшить дропдауны: query + пагинация; loss_reasons сделать optional

Инфраструктура piece:
- [ ] auth: amoCRM-домен, `validate` callback; решить OAuth2 vs long-lived token (self-hosting rule: zero setup)
- [ ] аккуратный webhook lifecycle: один вебхук на destination с объединёнными settings, либо проверка конфликтов

### P1 — виджет amoCRM (канал запуска и дистрибуции)

- [ ] manifest.json: locations `digital_pipeline`, `salesbot_designer`, `ccard/lcard/comcard`, `clist/llist`, `advanced_settings`
- [ ] DP-шаг: наш вебхук-приёмник (`flow_id` + `start/stop` + задержка) → запуск/останов flow; выбор flow в DP-настройках (как `DpSettings.js` у референсов)
- [ ] Salesbot handler: запуск flow из сценария бота
- [ ] Кнопки на карточке: ручной запуск flow с `entity_id` в payload (+массовый из списков)
- [ ] Embedding: JWT (`externalProjectId` = id аккаунта амо), iframe с билдером, `piecesFilterType: ALLOWED`
- [ ] i18n ru для билдера в embed (`locale: 'ru'`)

### P2 — механики удержания сценария

- [ ] «Ожидание выполнения задачи» — резюм waitpoint по вебхуку task completed
- [ ] «Ожидание ответа клиента» (сообщение в чате) — резюм по MessageAdd
- [ ] A/B-сплиттер piece (ветки по весам)
- [ ] Троттлинг/лимитер и антицикл (`min_freq_time`-аналог) — хотя бы через piece + Storage

### P3 — RU-коммуникации и экосистема (дифференциаторы Sensei/Triggeron)

- [ ] SMS: smsc.ru, sms.ru pieces
- [ ] WhatsApp с амо-контекстом (шаблоны, кнопки, ожидание ответа)
- [ ] Письмо от корп. ящика амо (mail API)
- [ ] Dadata piece (реквизиты, нормализация адресов)
- [ ] Генерация документов по шаблону (аналог Docsgen; есть pieces pdf/google-docs — оценить)
- [ ] Телефония (sipuni и др.) + транскрибация звонков через Agent
- [ ] Уведомления сотрудникам в интерфейсе амо (аналог SendByNotifier — через виджет)

---

## 5. Открытые вопросы

- OAuth2 амо в embed: redirect должен идти на наш инстанс (см. CLAUDE.md про `--mode=cloud`) — спроектировать до P1.
- Чаты/Talks API амо: какие scope/тарифы амо нужны для MessageAdd-триггера и отправки сообщений.
- Один piece «amocrm» или «amocrm» + «kommo» с общим common-пакетом (домены и RU-фичи различаются).
- Модель тарифов клиентам: лимиты через embedding JWT (tasks/aiCredits) vs свои счётчики (у Triggeron — операции по тарифу).
