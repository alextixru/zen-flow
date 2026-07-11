# Сводное исследование: интеграция приложения в amoCRM

Дата: 2026-07-11. Детальные отчёты — в `research/` (три файла, ссылки по тексту). Дополнительные первоисточники: выжимка курса разработки виджетов (`~/getcourse/`), каталог UI-хуков Kommo, боевые виджеты Triggeron / F5 calcfield (`reference/`, `~/motoacademy/`), код форка.

## 1. Целевая архитектура

```
Интерфейс amoCRM (аккаунт клиента)
  └─ JS-виджет (наш, приватный на старте)
       ├─ advanced_settings: страница «Автоматизации» → <iframe> нашего конструктора
       ├─ lcard / card_sdk: панель/вкладка в карточке сделки (статус автоматизаций, запуск flow)
       ├─ digital_pipeline: шаг автоворонки «запустить flow» (вебхук на наш бэкенд)
       └─ salesbot_designer: шаг salesbot (handler на наш бэкенд)
            │
            ▼
  Бэкенд-мост виджета (наш) ── выдаёт embed-JWT ──► POST /v1/managed-authn/external-token
            │                                             │
            ▼                                             ▼
  Форк Activepieces (self-hosted, EE): Platform → Project per аккаунт amo,
  piece amoCRM (24 actions / 19 webhook- + 8 events-триггеров), ALLOWED-каталог pieces
```

Порядок исполнения flow, триггеры и данные — целиком на нашей стороне (piece + Events API, фаза 6 prd); виджет — только UI-вход и DP/salesbot-мосты.

## 2. Поверхности встраивания (детали: `research/amo-surfaces.md`)

- **Старт — `advanced_settings`**: своя страница в «Настройках» amo, DOM полностью наш, iframe свободно, доступно приватному виджету без модерации. `widget_page` (полноэкранный пункт левого меню) — визуально лучший, но только для публичной интеграции с модерацией → этап апгрейда.
- **DP-шаг и salesbot-шаг** — подтверждены боевыми виджетами (Triggeron, F5): плашка настроек (`dpSettings`/`onSalesbotDesignerSave`) + вебхук/handler на бэкенд. Точечные триггеры «переход в этап X с фильтром по полю» amo даёт нативно.
- **Карточка сделки**: `lcard` — узкая правая колонка (кнопка/статус), `card_sdk` — полноценная вкладка.
- iframe с внешним src: официального запрета нет, `mobile.frame_url` — официальный iframe-паттерн, боевые виджеты грузят внешнюю статику. Проверка CSP живьём — открытый вопрос №1.
- Дистрибуция: приватный виджет ставится в конкретный аккаунт без маркетплейса (наш managed-путь); публичный требует техаккаунт, модерацию (полный ре-ревью на каждое изменение, тур-картинки обязательны), ожидаемо «одна интеграция на вендора» → стратегия «один виджет со своим каталогом внутри».

## 2а. Как встраиваются БОЕВЫЕ виджеты (разбор `reference/` — прецеденты, а не теория)

Три вендора маркетплейса, чьи бандлы лежат в `reference/` и `~/motoacademy/`, уже решили нашу задачу — встроить внешнее приложение в amo:

- **Sensei (конструктор процессов) — главный прецедент для нас**: открывает свой конструктор как **`<iframe src="https://<их-домен>/constructor/<account_id>/<instance_id>?...">` на 100%×100% в модалке** прямо в интерфейсе amo (`reference/sensei/widget/script.js:594`). Полноценная внешняя SPA (`sensei/constructor/index.html` + чанки, свои тёмная/светлая темы). Это боевое доказательство: **CSP amo пропускает произвольный внешний iframe**, включая полноэкранные приложения. Их альтернативный режим — ленивая подгрузка `constructor.js` и рендер прямо в DOM amo.
- **F5 BPMN (редактор бизнес-процессов)**: `advanced_settings` рендерится в штатную рабочую область `#work-area-<widget_code>` собственными шаблонами (`bpmn/widget/vendor/app.js:177`) — DOM области полностью их; сам редактор — отдельная внешняя SPA (`bpmn/editor/index.html`, Vite-сборка, id=app). Манифест: `card_sdk`, DP-блок с `webhook_url: https://hooks.widgets.comf5.ru/dp/Bpmn` и полями настроек шага, `salesbot_designer`-блок (`start_bp` c manual-полями `bp_action`/`bp_id`).
- **Triggeron**: 12 locations (вкл. `everywhere`, `mobile_card`); DP-блок с `webhook_url: https://hooks.widgets.comf5.ru/dp/Triggeron` + поля `dp_rule`/`dp_delay_*`; **`mobile.frame_url`** — официальный декларативный iframe их внешней страницы в мобильной карточке; `init_once: false`, 6 локалей, свой support-блок.

Выводы из прецедентов: (1) наш паттерн «iframe внешнего конструктора» подтверждён Sensei буквально; (2) advanced_settings-область отдаёт DOM целиком — туда встаёт наш iframe без модалок; (3) DP/salesbot-блоки манифеста с `webhook_url` на свой домен — стандартная механика «шаг воронки → наш бэкенд», оба вендора так живут; (4) `mobile.frame_url` закрывает мобильный кейс декларативно.

## 3. Наш embedding-стек (детали: `research/embed-sdk.md`)

- Клиентский SDK (`packages/ee/embed-sdk`): iframe + postMessage; скрытие всего хрома (sidebar, navbar, header, папки, таблицы, поиск, экспорт), шрифт (`fontUrl`/`fontFamily`), `light`/`dark`, локаль, перехват навигации. Дизайн-токены/канвас через SDK не меняются — только правкой форка (HSL-токены `styles.css` + 43 shadcn-компонента централизованно).
- Провижининг: JWT RS256 (platform signing key, `kid` в заголовке), claims `externalUserId`/`externalProjectId`/имя (+ `role`, `piecesFilterType`+`piecesTags` v3, `concurrencyPoolKey/Limit`), короткий `exp`. Обмен на `POST /v1/managed-authn/external-token` идемпотентно создаёт юзера и проект. `externalProjectId` = id аккаунта amo.
- Предусловия: `platform.plan.embeddingEnabled` (наш EE — включаем сами) и **origin `https://<аккаунт>.amocrm.ru` в `platform.allowedEmbedOrigins`** — иначе CSP `frame-ancestors` режет iframe. Онбординг клиента обязан автоматически добавлять его поддомен.
- Грабли: reload внутри iframe требует повторного `configure()` (memoryRouter); эндпоинт external-token не гейтится embeddingEnabled напрямую (защита косвенная — через недоступность signing key).

## 4. Аутентификация виджет → наш бэкенд

Виджету нужен способ доказать нашему бэкенду «я аккаунт amo N, юзер M», чтобы получить embed-JWT:
- **Managed-старт (просто):** при онбординге мы выдаём клиенту install-ключ; он вводится в настройках виджета (`onSave` → наш бэкенд связывает ключ ↔ account_id ↔ project). Дальше виджет шлёт account_id+user из `AMOCRM.constant('user')` + ключ.
- **Позже (самообслуживание):** amo user-session JWT (курс, урок 3.4): виджет получает подписанный amo токен юзера, наш бэкенд валидирует подпись. Требует проверки формата на стенде.

## 5. Каталог pieces для RU (детали: `research/pieces-ru-audit.md`)

Из 749 pieces: **A-ядро ~72** (27 core + 45 прикладных), B-нишевых ~535, **C-неработающих в РФ ~100–130** (8 кластеров: Notion/Slack/HubSpot/…, Microsoft/Azure, AWS, Meta/LinkedIn, зарубежные платежи, бухучёт, e-подпись, VoIP), D-проверить ~12. Черновой ALLOWED — 45 pieces.
Нюанс: openai/claude из РФ требуют прокси (конфликт с zero-setup) — deepseek без этой проблемы; для managed-клиентов решается нашим AI-прокси.
Топ недостающих RU-интеграций: **MAX (VK), телефония (Mango/UIS/Sipuni/Zadarma), платежи (ЮKassa/Robokassa/CloudPayments), Яндекс (Метрика/Директ/Диск), 1С/МойСклад**; далее SMS (smsc/sms.ru), Ozon/WB, GetCourse, Tilda, Unisender.

## 6. Смежные установленные факты (из предыдущих исследований сессии)

- Лимиты amo: 7 rps на интеграцию, 50 rps на аккаунт суммарно по всем интеграциям (общий с чужими).
- «Белый бэкдор» — подмена `public_path` статики виджета через localStorage: итерации без перезаливки zip, отладка на живом клиенте; закладывать с первого дня, чтобы реже проходить модерацию.
- События: Events API (`/api/v4/events`, история бессрочна) — реализовано в piece фазой 6 (poll + doorbell фабрики); лента индексируется за 2–6 с.
- Мощности: 50–100 клиентов ≈ один сервер 8 vCPU/16 GB + managed PG (~15 тыс ₽/мес), хостинг РФ (152-ФЗ).
- Недокументированные UI-хуки (Backbone-модель карточки, router monkey-patch, MutationObserver на `#card_holder`) — проверены боевыми виджетами; использовать только для UX-сахара, не для критичной логики.

## 7. Сводные открытые вопросы (проверять на dzenteamdev)

1. CSP amo: произвольный iframe src в `advanced_settings`/карточке (главный риск MVP).
2. Размеры рабочих областей (advanced_settings, card_sdk-вкладка), лимит zip.
3. Формат amo user-session JWT и его валидация извне (этап самообслуживания).
4. Контракты `mobile_card`/`ai_agent`/`website_chat_button` (низкий приоритет).
5. «Публичная, но не в каталоге» интеграция — существует ли такой статус.
6. Ре-пауза движка (spike T038 ночного цикла) — влияет на wait-механики DP-сценариев.
