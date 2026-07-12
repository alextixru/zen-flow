// Логика виджета Dzen.Team — живёт на статике за белым бэкдором (W013):
// тонкий загрузчик в zip тянет этот файл, поэтому правку выкатываем без нового
// zip и bump version. Файл НЕ использует define() (в requirejs amo это дало бы
// «Mismatched anonymous define») — регистрирует фабрику в window.__dzenflow.
(function () {
  window.__dzenflow = window.__dzenflow || {};

  var EMBED_SDK_VERSION = '0.13.0';

  // Мост Dzen.Team (тот же SSH-туннель, путь /bridge). instanceUrl конструктора
  // отдаёт сам мост в ответе /embed-token.
  var BRIDGE_URL = 'https://amoai-dev.dzen.team/bridge';

  // Фабрика на каждый вызов amo-коллбека: amo пересоздаёт инстанс виджета на
  // каждый SPA-переход, поэтому self приходит свежий. Персистентное состояние
  // (booted, sdkLoading, lcardBound) живёт в синглтоне core, не в замыкании.
  window.__dzenflow.createApp = function (self, $) {
    function core() {
      var store = window.__dzenflow;
      store.core = store.core || { booted: false };
      return store.core;
    }

    function t(key, fallback) {
      try {
        var value = self.i18n(key);
        return typeof value === 'string' && value ? value : fallback;
      } catch (e) {
        return fallback;
      }
    }

    function widgetCode() {
      try {
        var settings = self.get_settings();
        if (settings && settings.widget_code) {
          return settings.widget_code;
        }
      } catch (e) {}
      return self.params && self.params.widget_code;
    }

    function amoConstant(name) {
      try {
        return (window.AMOCRM && AMOCRM.constant && AMOCRM.constant(name)) || null;
      } catch (e) {
        return null;
      }
    }

    // У amo нет документированного API уведомлений — feature-detect, любой сбой
    // гасим: надёжный сигнал успеха/ошибки для amo — resolve/reject Deferred в onSave.
    function notify(text) {
      try {
        var n = window.AMOCRM && AMOCRM.notifications;
        if (n && typeof n.show_message === 'function') {
          n.show_message({ header: t('widget.name', 'Автоматизации Dzen.Team'), text: text });
        }
      } catch (e) {}
    }

    function installKey() {
      var settings = self.get_settings ? self.get_settings() : null;
      return settings && settings.install_key ? String(settings.install_key).replace(/^\s+|\s+$/g, '') : '';
    }

    function submitInstall() {
      var key = installKey();
      // Поле необязательное — пустой ключ сохраняем как есть, клиент введёт позже.
      if (!key) {
        return true;
      }
      var account = amoConstant('account');
      var user = amoConstant('user');
      if (!account || !account.id) {
        notify(t('install.neterror', 'Не удалось связаться с сервером Dzen.Team.'));
        return false;
      }
      var dfd = $.Deferred();
      fetch(BRIDGE_URL + '/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          install_key: key,
          account_id: account.id,
          subdomain: account.subdomain,
          user: user ? { id: user.id, name: user.name } : null
        })
      })
        .then(function (res) {
          if (res.ok) {
            notify(t('install.ok', 'Интеграция Dzen.Team подключена.'));
            dfd.resolve();
          } else {
            notify(t('install.rejected', 'Ключ установки недействителен.'));
            dfd.reject();
          }
        })
        .catch(function () {
          notify(t('install.neterror', 'Не удалось связаться с сервером Dzen.Team.'));
          dfd.reject();
        });
      return dfd.promise();
    }

    // SDK — UMD-бандл, а в amo глобально живёт RequireJS: тег <script> уводит
    // UMD в ветку define.amd, фабрика не исполняется («Mismatched anonymous
    // define») и window.activepieces не появляется. Поэтому грузим текстом
    // (CORS у форка открыт) и исполняем с заслонённым define — UMD падает в
    // ветку присвоения глобалов.
    function loadEmbedSdk(baseUrl, done) {
      if (window.activepieces) {
        done(true);
        return;
      }
      var store = core();
      if (store.sdkLoading) {
        store.sdkLoading.push(done);
        return;
      }
      store.sdkLoading = [done];
      function finish(ok) {
        var waiters = store.sdkLoading || [];
        store.sdkLoading = null;
        for (var i = 0; i < waiters.length; i++) {
          waiters[i](ok);
        }
      }
      fetch(baseUrl + '/embed/' + EMBED_SDK_VERSION + '.js')
        .then(function (res) {
          if (!res.ok) {
            throw new Error('embed sdk http ' + res.status);
          }
          return res.text();
        })
        .then(function (code) {
          new Function('define', 'exports', 'module', code)(undefined, undefined, undefined);
          finish(!!window.activepieces);
        })
        .catch(function () {
          finish(false);
        });
    }

    function renderMessage(area, text) {
      area.innerHTML =
        '<div class="dzenflow-msg">' +
        '<h2>' + t('advanced.title', 'Автоматизации Dzen.Team') + '</h2>' +
        '<p>' + text + '</p>' +
        '</div>';
    }

    // amo рисует тёмную тему добавлением класса на body/html. Точный класс не
    // подтверждён живьём (headless без сессии) — эвристика по 'night'/'dark',
    // дефолт light. ponytail: уточнить селектор при первой живой проверке.
    function detectStylingMode() {
      try {
        var cls =
          ((document.body && document.body.className) || '') +
          ' ' +
          (document.documentElement.className || '');
        if (/(theme[-_]?night|\bnight\b|\bdark\b)/i.test(cls)) {
          return 'dark';
        }
      } catch (e) {}
      return 'light';
    }

    function mountEmbed(area, code, instanceUrl, jwtToken) {
      var top = area.getBoundingClientRect().top;
      var height = Math.max(400, Math.round(window.innerHeight - top - 16));
      var containerId = 'dzenflow-embed-' + code;
      // Повторный вызов advancedSettings (SPA-переходы) пересоздаёт контейнер —
      // старый iframe уходит вместе с innerHTML, задвоения нет. Высота считается
      // от места блока — остаётся инлайн; остальное стайлится классом из CSS.
      area.innerHTML =
        '<div id="' + containerId + '" class="dzenflow-embed" style="height:' + height + 'px;"></div>';
      loadEmbedSdk(instanceUrl, function (ok) {
        if (!ok) {
          renderMessage(area, t('advanced.unavailable', 'Сервис временно недоступен.'));
          return;
        }
        window.activepieces
          .configure({
            instanceUrl: instanceUrl,
            jwtToken: jwtToken,
            embedding: {
              containerId: containerId,
              locale: 'ru',
              styling: { mode: detectStylingMode() },
              dashboard: { hideSidebar: true, hideFlowsPageNavbar: false },
              hideFolders: true,
              hideTables: true,
              hideGlobalSearch: true,
              builder: { homeButtonIcon: 'back' }
            }
          })
          .catch(function () {
            renderMessage(area, t('advanced.unavailable', 'Сервис временно недоступен.'));
          });
      });
    }

    function renderEmbed() {
      var code = widgetCode();
      if (!code) {
        return;
      }
      var area = document.getElementById('work-area-' + code);
      if (!area) {
        return;
      }
      var key = installKey();
      if (!key) {
        renderMessage(area, t('advanced.no_key', 'Введите ключ установки в настройках интеграции (кнопка «Настроить») и сохраните.'));
        return;
      }
      var account = amoConstant('account');
      var user = amoConstant('user');
      if (!account || !account.id) {
        renderMessage(area, t('advanced.unavailable', 'Сервис временно недоступен.'));
        return;
      }
      fetch(BRIDGE_URL + '/embed-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          install_key: key,
          account_id: account.id,
          user: user ? { id: user.id, name: user.name } : null
        })
      })
        .then(function (res) {
          if (res.status === 403) {
            renderMessage(area, t('advanced.invalid_key', 'Ключ установки недействителен. Обратитесь в поддержку Dzen.Team.'));
            return null;
          }
          if (!res.ok) {
            renderMessage(area, t('advanced.unavailable', 'Сервис временно недоступен.'));
            return null;
          }
          return res.json();
        })
        .then(function (data) {
          if (data === null) {
            return;
          }
          if (!data || !data.jwtToken || !data.instanceUrl) {
            renderMessage(area, t('advanced.unavailable', 'Сервис временно недоступен.'));
            return;
          }
          mountEmbed(area, code, data.instanceUrl, data.jwtToken);
        })
        .catch(function () {
          renderMessage(area, t('advanced.unavailable', 'Сервис временно недоступен.'));
        });
    }

    // lcard-0: amo не рисует блок сам (суффикс -0) — решаем и рендерим сами через
    // render_template (официальный метод инстанса виджета; форма { caption, body, render }
    // подтверждена двумя боевыми виджетами: sensei/widget/script.js, triggeron F5triggeron.js).
    function lcardConstructorUrl(code) {
      return location.protocol + '//' + location.host + '/settings/widgets/' + code + '/';
    }

    // id текущей сделки для ручного запуска flow с карточки. Форма amo-глобала
    // (AMOCRM.data.current_card.id) — из боевого reference (triggeron EntityCard,
    // F5.currentCard); живьём не снята (headless без сессии). ponytail: уточнить
    // на первой живой карточке.
    function currentLeadId() {
      try {
        var card = window.AMOCRM && AMOCRM.data && AMOCRM.data.current_card;
        return card && card.id ? card.id : null;
      } catch (e) {
        return null;
      }
    }

    function statusLabel(status) {
      var map = {
        SUCCEEDED: t('runs.status_ok', 'Успех'),
        FAILED: t('runs.status_failed', 'Ошибка'),
        RUNNING: t('runs.status_running', 'Выполняется'),
        PAUSED: t('runs.status_paused', 'Ожидание'),
        QUEUED: t('runs.status_queued', 'В очереди')
      };
      return map[status] || status || '';
    }

    function renderRunsList($runs, runs) {
      $runs.empty();
      if (!runs || !runs.length) {
        $runs.append($('<div class="dzenflow-runs-empty"></div>').text(t('runs.empty', 'Пока нет запусков')));
        return;
      }
      for (var i = 0; i < runs.length; i++) {
        var r = runs[i];
        var when = '';
        try {
          if (r.created) {
            when = new Date(r.created).toLocaleString('ru');
          }
        } catch (e) {}
        var cls = String(r.status || '').toLowerCase().replace(/[^a-z]/g, '');
        var $item = $('<div class="dzenflow-run-item"></div>');
        // .text() — имя/статус приходят с форка, не интерпретируем как HTML.
        $item.append($('<span class="dzenflow-run-name"></span>').text(r.displayName || r.flowId));
        $item.append($('<span class="dzenflow-run-status dzenflow-run-status-' + cls + '"></span>').text(statusLabel(r.status)));
        if (when) {
          $item.append($('<span class="dzenflow-run-when"></span>').text(when));
        }
        $runs.append($item);
      }
    }

    // Наполняет блок карточки: последние раны проекта (GET /runs) и селект flow
    // для ручного запуска (GET /flows). Раны — по проекту, не по сделке (ран не
    // знает lead_id — честное ограничение MVP W018, оговорено подписью в UI).
    function hydrateCard() {
      loadRuns();
      loadFlowSelect();
    }

    function cardContext() {
      var account = amoConstant('account');
      var key = installKey();
      if (!account || !account.id || !key) {
        return null;
      }
      return '?install_key=' + encodeURIComponent(key) + '&account_id=' + encodeURIComponent(account.id);
    }

    // Не-ok ответ моста (403 ревокнутый ключ, 502 недоступный форк) — ошибка,
    // а не «пустой список»: роняем в catch, чтобы UI показал текст ошибки.
    function jsonOrThrow(res) {
      if (!res.ok) {
        throw new Error('http ' + res.status);
      }
      return res.json();
    }

    function loadRuns() {
      var $runs = $('.dzenflow-runs');
      if (!$runs.length) {
        return;
      }
      var suffix = cardContext();
      if (suffix === null) {
        $runs.text(t('runs.no_key', 'Введите ключ установки в настройках интеграции.'));
        return;
      }
      $runs.text(t('runs.loading', 'Загрузка запусков…'));
      fetch(BRIDGE_URL + '/runs' + suffix)
        .then(jsonOrThrow)
        .then(function (runs) {
          renderRunsList($runs, runs);
        })
        .catch(function () {
          $runs.text(t('runs.error', 'Не удалось загрузить запуски.'));
        });
    }

    function loadFlowSelect() {
      var $select = $('.dzenflow-run-select');
      if (!$select.length) {
        return;
      }
      var suffix = cardContext();
      if (suffix === null) {
        return;
      }
      $select.empty().append(new Option(t('dp.loading', 'Загрузка сценариев…'), ''));
      fetch(BRIDGE_URL + '/flows' + suffix)
        .then(jsonOrThrow)
        .then(function (flows) {
          $select.empty().append(new Option(t('run.choose', '— выберите сценарий —'), ''));
          if (flows && flows.length) {
            for (var i = 0; i < flows.length; i++) {
              $select.append(new Option(flows[i].displayName || flows[i].id, flows[i].id));
            }
          } else {
            var opt = new Option(t('dp.empty', 'Нет доступных сценариев'), '');
            opt.disabled = true;
            $select.append(opt);
          }
        })
        .catch(function () {
          $select.empty().append(new Option(t('dp.error', 'Не удалось загрузить список сценариев'), ''));
        });
    }

    function runSelectedFlow($btn) {
      var flowId = String($('.dzenflow-run-select').val() || '');
      if (!flowId) {
        notify(t('run.no_flow', 'Выберите сценарий для запуска.'));
        return;
      }
      var account = amoConstant('account');
      var key = installKey();
      var leadId = currentLeadId();
      if (!account || !account.id || !key) {
        notify(t('advanced.unavailable', 'Сервис временно недоступен.'));
        return;
      }
      if (!leadId) {
        notify(t('run.no_lead', 'Не удалось определить сделку.'));
        return;
      }
      $btn.prop('disabled', true);
      fetch(BRIDGE_URL + '/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ install_key: key, account_id: account.id, flow_id: flowId, lead_id: leadId })
      })
        .then(function (res) {
          if (res.ok) {
            notify(t('run.ok', 'Сценарий запущен.'));
            loadRuns();
          } else {
            notify(t('run.error', 'Не удалось запустить сценарий.'));
          }
        })
        .catch(function () {
          notify(t('run.error', 'Не удалось запустить сценарий.'));
        })
        .then(function () {
          $btn.prop('disabled', false);
        });
    }

    function bindLcardClicks(code) {
      var store = core();
      if (store.lcardBound) {
        return;
      }
      store.lcardBound = true;
      // Делегирование на document: render_template может пересоздать DOM блока
      // при переходе на другую карточку, прямой bind на элемент тогда потеряется.
      $(document).on('click', '.dzenflow-lcard-button', function () {
        location.href = lcardConstructorUrl(code);
      });
      $(document).on('click', '.dzenflow-run-btn', function () {
        runSelectedFlow($(this));
      });
    }

    function renderCardBlock() {
      var code = widgetCode();
      if (!code || typeof self.render_template !== 'function') {
        return;
      }
      bindLcardClicks(code);
      if ($('.card-widgets__widget-' + code).length) {
        // Блок уже отрисован для текущей карточки — повторный render_template не нужен.
        return;
      }
      var rendered;
      try {
        rendered = self.render_template({
          caption: { class_name: 'dzenflow-lcard-caption', html: t('widget.name', 'Автоматизации Dzen.Team') },
          body: '',
          render:
            '<div class="dzenflow-lcard-block">' +
            '<button type="button" class="dzenflow-lcard-button">' +
            t('lcard.button', 'Автоматизации сделки') +
            '</button>' +
            '<div class="dzenflow-runs-title">' + t('runs.title', 'Последние запуски') + '</div>' +
            '<div class="dzenflow-runs-hint">' + t('runs.hint', 'по проекту, не только по этой сделке') + '</div>' +
            '<div class="dzenflow-runs"></div>' +
            '<div class="dzenflow-run-row">' +
            '<select class="dzenflow-run-select"></select>' +
            '<button type="button" class="dzenflow-run-btn">' + t('runs.run_button', 'Запустить') + '</button>' +
            '</div>' +
            '</div>'
        });
      } catch (e) {}
      // render_template в amo обычно асинхронный (возвращает Deferred/промис) —
      // ждём его, иначе hydrate не найдёт DOM блока (боевой bpmn инжектит в .then).
      if (rendered && typeof rendered.then === 'function') {
        rendered.then(function () {
          hydrateCard();
        });
      } else {
        hydrateCard();
      }
    }

    // Заменяет сырой <input name="flow_id"> в переданной области настроек на
    // <select> сценариев из GET /flows и пишет выбранное обратно в input (amo
    // сохраняет именно его значение). Сеть упала → input остаётся видимым
    // (graceful degrade). Общий для dp-плашки и шага salesbot-конструктора.
    function enhanceFlowSelect($scope) {
      var $input = $scope.find('input[name="flow_id"]');
      if (!$input.length || $input.data('dzenflowEnhanced')) {
        return;
      }
      $input.data('dzenflowEnhanced', true);
      var current = String($input.val() || '');
      var $select = $('<select class="dzenflow-dp-select"></select>');
      $select.append(new Option(t('dp.loading', 'Загрузка сценариев…'), ''));
      $input.hide().after($select);
      $select.on('change', function () {
        $input.val($select.val()).trigger('change');
      });

      var account = amoConstant('account');
      var key = installKey();
      if (!account || !account.id || !key) {
        $select.empty().append(new Option(t('dp.no_key', 'Сначала введите ключ установки в настройках интеграции'), ''));
        return;
      }
      fetch(BRIDGE_URL + '/flows?install_key=' + encodeURIComponent(key) + '&account_id=' + encodeURIComponent(account.id))
        .then(jsonOrThrow)
        .then(function (flows) {
          $select.empty();
          $select.append(new Option(t('dp.choose', '— выберите сценарий —'), ''));
          if (!flows || !flows.length) {
            var opt = new Option(t('dp.empty', 'Нет доступных сценариев'), '');
            opt.disabled = true;
            $select.append(opt);
          } else {
            for (var i = 0; i < flows.length; i++) {
              // new Option ставит текст через textContent — имя flow не интерпретируется как HTML.
              $select.append(new Option(flows[i].displayName || flows[i].id, flows[i].id));
            }
          }
          if (current) {
            $select.val(current);
          }
        })
        .catch(function () {
          $select.empty().append(new Option(t('dp.error', 'Не удалось загрузить список сценариев'), ''));
        });
    }

    // dp-плашка: amo рендерит поля dp.settings как <input> внутри
    // #widget_settings__fields_wrapper (механика — reference/triggeron DpSettings.open).
    function dpSettings() {
      enhanceFlowSelect($('#widget_settings__fields_wrapper'));
    }

    // Шаг salesbot-конструктора: поля salesbot_designer.start_flow.settings amo
    // рендерит теми же <input> внутри переданного $body блока-шага.
    function salesbotDesignerSettings($body) {
      enhanceFlowSelect($body);
    }

    return {
      submitInstall: submitInstall,
      renderEmbed: renderEmbed,
      renderCardBlock: renderCardBlock,
      dpSettings: dpSettings,
      salesbotDesignerSettings: salesbotDesignerSettings
    };
  };
})();
