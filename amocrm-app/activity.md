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
