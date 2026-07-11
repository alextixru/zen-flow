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

    // PoC W003: конструктор форка через embed-SDK. JWT подписывается вручную
    // (bridge/scripts/sign-jwt.ts) и подставляется в DEV_EMBED_JWT перед
    // инжектом/сборкой — в git живёт пустым. С W007 токен придёт с моста.
    var FORK_URL = 'https://amoai-dev.dzen.team';
    var EMBED_SDK_VERSION = '0.13.0';
    var DEV_EMBED_JWT = '';

    // Мост Dzen.Team (тот же SSH-туннель, путь /bridge). Dev-переопределение
    // придёт с белым бэкдором (W013); пока зашито константой.
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
    function loadEmbedSdk(done) {
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
      fetch(FORK_URL + '/embed/' + EMBED_SDK_VERSION + '.js')
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

    function renderEmbed() {
      var code = widgetCode();
      if (!code) {
        return;
      }
      var area = document.getElementById('work-area-' + code);
      if (!area) {
        return;
      }
      if (!DEV_EMBED_JWT) {
        renderMessage(area, t('advanced.stub', 'Раздел в разработке.'));
        return;
      }
      var top = area.getBoundingClientRect().top;
      var height = Math.max(400, Math.round(window.innerHeight - top - 16));
      var containerId = 'dzenflow-embed-' + code;
      // Повторный вызов advancedSettings (SPA-переходы) пересоздаёт контейнер —
      // старый iframe уходит вместе с innerHTML, задвоения нет.
      // SDK не стилизует основной iframe — растягиваем его на контейнер сами.
      area.innerHTML =
        '<style>#' + containerId + ' iframe{width:100%;height:100%;border:0;display:block;}</style>' +
        '<div id="' + containerId + '" style="width:100%;height:' + height + 'px;"></div>';
      loadEmbedSdk(function (ok) {
        if (!ok) {
          renderMessage(area, t('advanced.error', 'Не удалось загрузить конструктор.'));
          return;
        }
        window.activepieces
          .configure({
            instanceUrl: FORK_URL,
            jwtToken: DEV_EMBED_JWT,
            embedding: {
              containerId: containerId,
              locale: 'ru',
              dashboard: { hideSidebar: true }
            }
          })
          .catch(function () {
            renderMessage(area, t('advanced.error', 'Не удалось загрузить конструктор.'));
          });
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
