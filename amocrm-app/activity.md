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
