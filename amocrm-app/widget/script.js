define(['jquery'], function ($) {
  return function () {
    var self = this;

    // amoCRM пересоздаёт инстанс виджета на каждый SPA-переход и зовёт destroy у старого.
    // Ядро — синглтон в window с гардом в init(); destroy оставляем пустым, иначе виджет
    // умрёт при первом же переходе между разделами.
    function core() {
      if (!window.__dzenflow) {
        window.__dzenflow = { booted: false };
      }
      return window.__dzenflow;
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

    var EMBED_SDK_VERSION = '0.13.0';

    // Мост Dzen.Team (тот же SSH-туннель, путь /bridge). Dev-переопределение
    // придёт с белым бэкдором (W013); пока зашито константой. instanceUrl
    // конструктора отдаёт сам мост в ответе /embed-token.
    var BRIDGE_URL = 'https://amoai-dev.dzen.team/bridge';

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

    function submitInstall() {
      var settings = self.get_settings ? self.get_settings() : null;
      var key = settings && settings.install_key ? String(settings.install_key).replace(/^\s+|\s+$/g, '') : '';
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
        '<div style="padding:16px 24px 8px;font-family:inherit;">' +
        '<h2 style="margin:0 0 4px;font-size:18px;">' +
        t('advanced.title', 'Автоматизации Dzen.Team') +
        '</h2>' +
        '<p style="margin:0;color:#7a8290;">' + text + '</p>' +
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
      // старый iframe уходит вместе с innerHTML, задвоения нет.
      // SDK не стилизует основной iframe — растягиваем его на контейнер сами.
      area.innerHTML =
        '<style>#' + containerId + ' iframe{width:100%;height:100%;border:0;display:block;}</style>' +
        '<div id="' + containerId + '" style="width:100%;height:' + height + 'px;"></div>';
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
      var settings = self.get_settings ? self.get_settings() : null;
      var key = settings && settings.install_key ? String(settings.install_key).replace(/^\s+|\s+$/g, '') : '';
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

    this.callbacks = {
      render: function () {
        return true;
      },
      init: function () {
        var store = core();
        if (store.booted) {
          return true;
        }
        store.booted = true;
        return true;
      },
      bind_actions: function () {
        return true;
      },
      settings: function () {
        return true;
      },
      onSave: function () {
        return submitInstall();
      },
      advancedSettings: function () {
        renderEmbed();
        return true;
      },
      destroy: function () {},
      contacts: {
        selected: function () {}
      },
      leads: {
        selected: function () {}
      },
      todo: {
        selected: function () {}
      }
    };

    return this;
  };
});
