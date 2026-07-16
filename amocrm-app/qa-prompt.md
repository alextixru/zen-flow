Вип

Ты выполняешь один прогон живой браузерной приёмки виджета amoCRM в проекте `/Users/tihn/Zen-flow`, ветка `feature/amocrm-app`. Пайплайн и стиль — как у итерации `amocrm-app/loop.sh` (только пайплайн/журнал/коммит, сам loop.sh не запускай). Цель: закрыть живьём в браузере те шаги, что ночные итерации пометили «непроверено живьём» (доборы W010/W011/W018/W019).

СНАЧАЛА ПРОЧИТАЙ (обязательно — твой контекст-контракт):

- `amocrm-app/PROMPT.md` — модель прогона, правила журналирования и коммитов.
- `amocrm-app/activity.md` (хвост ~120 строк) — формат записи и список доборов «непроверено живьём».
- `amocrm-app/widget/script.js` и `amocrm-app/bridge/static/widget/widget-app.js` — код виджета, который инжектишь (методы renderEmbed / renderCardBlock / dpSettings / salesbotDesignerSettings).

БРАУЗЕР — как подключиться (делай именно так):

1. Инструменты chrome-devtools MCP подключены в сессии. Загрузи их одним вызовом ToolSearch:
   `select:mcp__plugin_chrome-devtools-mcp_chrome-devtools__navigate_page,mcp__plugin_chrome-devtools-mcp_chrome-devtools__evaluate_script,mcp__plugin_chrome-devtools-mcp_chrome-devtools__take_screenshot,mcp__plugin_chrome-devtools-mcp_chrome-devtools__list_console_messages,mcp__plugin_chrome-devtools-mcp_chrome-devtools__list_pages,mcp__plugin_chrome-devtools-mcp_chrome-devtools__click`
2. Chrome поднимется залогиненным в amo (персистентный профиль cdmcp, аккаунт dzenteamdev). Пользуйся этим инстансом. НЕ запускай свой Chrome руками, НЕ делай `pkill`/`kill -9` по Chrome (оставляет залипший SingletonLock → следующий старт виснет — если надо закрыть, только SIGTERM). НЕ трогай конфиги MCP. Если инструменты не грузятся — запиши это в журнал и заверши.

ДАННЫЕ СТЕНДА:

- account_id 32453394, subdomain dzenteamdev, user {id:2898108, name:"Алексей"}, widget_code `dealguard`.
- Активный install_key возьми сам, в текст/журнал НЕ выводи (максимум первые 6 символов):
  `sqlite3 /Users/tihn/Zen-flow/amocrm-app/bridge/data/bridge.db "SELECT install_key FROM accounts WHERE account_id='32453394' AND status='active' LIMIT 1;"`
- Статика виджета: `https://amoai-dev.dzen.team/bridge/static/widget/{widget-app.js,widget-app.css}`; мост: `https://amoai-dev.dzen.team/bridge`.
- Установлен старый скелет виджета v0.1.1 (пустой) — боевую логику ты ИНЖЕКТИШЬ поверх, она стирается при перезагрузке/навигации → переинжектируй после каждого перехода.

ЭТАЛОННЫЙ ИНЖЕКТ (как evaluate_script; инжект и осмотр делай ОДНИМ и тем же инструментом MCP, не мешай с сырым node-CDP — иначе разъедутся execution-контексты; KEY подставь из sqlite; work-area id = `work-area-<widget_code>`):

```
async () => {
  const BASE='https://amoai-dev.dzen.team/bridge/static/widget';
  const KEY='<из sqlite>';
  if(!document.getElementById('dzenflow-css')){const l=document.createElement('link');l.id='dzenflow-css';l.rel='stylesheet';l.href=BASE+'/widget-app.css';document.head.appendChild(l);}
  const code=await(await fetch(BASE+'/widget-app.js',{cache:'no-store'})).text();
  new Function(code)();
  const self={ get_settings:()=>({widget_code:'dealguard', install_key:KEY}), i18n:()=>undefined, params:{widget_code:'dealguard'},
               render_template:(cfg)=>{ /* для lcard: вставь cfg.render в правую панель .card-widgets, верни $.Deferred().resolve() */ } };
  const app=window.__dzenflow.createApp(self, window.jQuery||window.$);
  /* нужный метод: app.renderEmbed() | app.renderCardBlock() | app.dpSettings() */
  return 'ok';
}
```

ШАГИ ЖИВОГО ПРОГОНА (по приоритету; каждый — со скриншотом в `amocrm-app/activity-assets/qa-<шаг>.png` через take_screenshot filePath, и с числами: размеры, HTTP, тексты):

1) [ГЛАВНОЕ] advanced_settings embed (W010): на `/settings/widgets/dealguard/` инжектни `renderEmbed()`. Убедись: iframe `amoai-dev.dzen.team/embed` поднялся (offsetHeight>50), sidebar скрыт. ОСОБО зафиксируй ЯЗЫК интерфейса билдера (RU или EN) — ночью рендерился EN при `locale:'ru'`, это подозреваемый дефект, подтверди или опровергни живьём. Открой существующий flow «V002 lead_added → create_task» кликом — редактор открывается? F5 → переинжект (логика стирается — ожидаемо, подтверди что повторный инжект поднимает заново). Глянь консоль (list_console_messages) на наши ошибки.
2) lcard-блок + список ранов (W011/W018): перейди на карточку сделки `https://dzenteamdev.amocrm.ru/leads/detail/38763507`, переинжектни, вызови `renderCardBlock()` (передай рабочий render_template, вставляющий блок в правую панель `.card-widgets`). Убедись: блок «Автоматизации Dzen.Team» с кнопкой отрисован; список ранов подтянулся (`GET /bridge/runs` вернул реальные раны); селект flow (`GET /bridge/flows`, вероятно пусто — webhook-совместимых flow нет, это ок); кнопка ведёт на `/settings/widgets/dealguard/`.
3) mobile-страница (W019): открой `https://amoai-dev.dzen.team/bridge/mobile/card?account_id=32453394&lead_id=38763507` — статичный HTML, данные из query в тело НЕ попадают.
4) dp/salesbot-селект (W015/W016): у установленного виджета нет digital_pipeline/salesbot блоков — живьём в amo не воспроизвести. Сделай СИНТЕТИЧЕСКИЙ компонент-прогон: на любой странице amo создай `<div id="widget_settings__fields_wrapper"><input name="flow_id"></div>`, инжектни и вызови `app.dpSettings()` → убедись, что сырой input заменён на `<select class="dzenflow-dp-select">` из `GET /bridge/flows`. Честно пометь как СИНТЕТИЧЕСКИЙ (не реальный контекст amo).

ЖУРНАЛ И КОММИТ (как в PROMPT.md):

- Допиши в `amocrm-app/activity.md` ОДНУ запись в принятом формате: дата ISO, заголовок «Живой браузерный прогон», статус по каждому шагу, ФАКТИЧЕСКИЕ числа/тексты/HTTP, пути скриншотов, найденные дефекты (особенно язык билдера), что осталось не снято и почему. Пиши ровно то, что видел на экране; если шаг не удался — так и напиши, не выдумывай.
- Скриншоты — в `amocrm-app/activity-assets/`.
- Коммить ТОЛЬКО `amocrm-app/**` (activity.md + activity-assets/, при желании удали этот qa-prompt.md). Сообщение lowercase: `chore(amo-app): живой браузерный прогон — доборы w010/w011/w018/w019`. НЕ трогай `packages/**`, `ralph/**`, код виджета/моста.

РАБОТА С КЛЮЧАМИ (жёстко):

- Никогда не печатай/не коммить полный install_key или amo-токен; в журнал — максимум первые 6 символов. Перед коммитом: `git diff --cached | grep -cE 'eyJ0|BEGIN (RSA )?PRIVATE KEY'` = 0; `.env*`/`data/`/`*.pem` не в staged.
- Пароли amo не подбирай. Если сессия разлогинена — запиши и заверши.

Финальным сообщением верни краткую сводку: какие шаги прошли/не прошли/синтетика, ключевые находки (особенно язык билдера), sha коммита.
