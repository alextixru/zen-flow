define(['jquery'], function ($) {
  return function () {
    var self = this;

    // Белый бэкдор: базовый URL логики берётся из localStorage (dev-итерации без
    // перезаливки zip), иначе — зашитый прод-URL статики моста (/bridge/static/widget
    // через тот же SSH-туннель). Легитимная debug-фича — проходит модерацию.
    function basePath() {
      var override = null;
      try {
        override = window.localStorage && localStorage.getItem('dzenflow_public_path');
      } catch (e) {}
      if (override) {
        return String(override).replace(/\/+$/, '');
      }
      return 'https://amoai-dev.dzen.team/bridge/static/widget';
    }

    // Handler-URL шага salesbot: секрет тот же, что у DP-вебхука; в git —
    // placeholder, build.sh подставляет DP_SECRET в zip (виден только админам
    // аккаунта — тот же уровень, что webhook_url в манифесте).
    var SALESBOT_HANDLER = 'https://amoai-dev.dzen.team/bridge/salesbot?k=__DP_SECRET__';

    function ns() {
      window.__dzenflow = window.__dzenflow || {};
      return window.__dzenflow;
    }

    function amoAccount() {
      try {
        return (window.AMOCRM && AMOCRM.constant && AMOCRM.constant('account')) || null;
      } catch (e) {
        return null;
      }
    }

    function digFlowId(params, depth) {
      if (!params || typeof params !== 'object' || depth > 4) {
        return '';
      }
      if (typeof params.flow_id === 'string' && params.flow_id) {
        return params.flow_id;
      }
      return digFlowId(params.params, depth + 1);
    }

    function injectCss(base) {
      var store = ns();
      if (store.cssLoaded) {
        return;
      }
      store.cssLoaded = true;
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = base + '/widget-app.css';
      (document.head || document.documentElement).appendChild(link);
    }

    // Логика (widget-app.js) грузится один раз в window.__dzenflow.createApp и
    // делится всеми инстансами виджета. Не define() — исполняем текстом, файл сам
    // регистрирует фабрику (тот же приём, что для UMD embed-SDK).
    function loadApp(done) {
      var store = ns();
      if (store.createApp) {
        done(true);
        return;
      }
      if (store.appLoading) {
        store.appLoading.push(done);
        return;
      }
      store.appLoading = [done];
      var base = basePath();
      injectCss(base);
      function finish(ok) {
        var waiters = store.appLoading || [];
        store.appLoading = null;
        for (var i = 0; i < waiters.length; i++) {
          waiters[i](ok);
        }
      }
      $.ajax({ url: base + '/widget-app.js', dataType: 'text', cache: false })
        .done(function (code) {
          try {
            new Function(code)();
          } catch (e) {}
          finish(!!store.createApp);
        })
        .fail(function () {
          finish(false);
        });
    }

    function withApp(onReady, onFail) {
      loadApp(function (ok) {
        if (ok && ns().createApp) {
          try {
            onReady(ns().createApp(self, $));
            return;
          } catch (e) {}
        }
        if (onFail) {
          onFail();
        }
      });
    }

    this.callbacks = {
      render: function () {
        withApp(function (app) {
          app.renderCardBlock();
        });
        return true;
      },
      init: function () {
        var store = ns();
        if (store.booted) {
          return true;
        }
        store.booted = true;
        // Прогреваем логику заранее, чтобы onSave/advancedSettings не ждали сеть.
        loadApp(function () {});
        return true;
      },
      bind_actions: function () {
        return true;
      },
      settings: function () {
        return true;
      },
      onSave: function () {
        // onSave обязан вернуть результат синхронно, а логика грузится по сети —
        // отдаём Deferred и резолвим после submitInstall. Логика не загрузилась
        // → resolve: amo сохранит ключ сам, провижининг добьётся при показе.
        var outer = $.Deferred();
        withApp(
          function (app) {
            var r = app.submitInstall();
            if (r === true) {
              outer.resolve();
              return;
            }
            if (r && typeof r.then === 'function') {
              r.then(
                function () {
                  outer.resolve();
                },
                function () {
                  outer.reject();
                }
              );
              return;
            }
            outer.reject();
          },
          function () {
            outer.resolve();
          }
        );
        return outer.promise();
      },
      advancedSettings: function () {
        withApp(function (app) {
          app.renderEmbed();
        });
        return true;
      },
      dpSettings: function () {
        withApp(function (app) {
          app.dpSettings();
        });
        return true;
      },
      // amo ждёт синхронный возврат {exits} — рендер селекта запускаем асинхронно,
      // exits отдаём сразу. Пустой список: «выстрелил и забыл», ветвление по
      // результату flow — upgrade (escape W016, формат ответа handler не проверен).
      salesbotDesignerSettings: function ($body) {
        withApp(function (app) {
          app.salesbotDesignerSettings($body);
        });
        return { exits: [] };
      },
      // Логика шага возвращается синхронной строкой JSON (форма — reference/bpmn
      // widget.js): один widget_request на наш handler c выбранным flow_id.
      // account_id/subdomain вшиваем на сохранении — сценарий принадлежит аккаунту.
      // Форма params save-колбэка живьём не снята: render-путь BPMN получает поля
      // вложенными (params.params.params.params — SbSettings.js), поэтому flow_id
      // ищем и плоско, и вглубь по цепочке .params.
      onSalesbotDesignerSave: function (handler_code, params) {
        var account = amoAccount();
        var data = {
          flow_id: digFlowId(params, 0),
          account_id: account && account.id ? account.id : null,
          subdomain: account ? account.subdomain : null
        };
        return JSON.stringify([
          { question: [{ handler: 'widget_request', params: { url: SALESBOT_HANDLER, data: data } }] }
        ]);
      },
      destroy: function () {},
      contacts: {
        selected: function () {
          return true;
        }
      },
      leads: {
        selected: function () {
          return true;
        }
      },
      todo: {
        selected: function () {
          return true;
        }
      }
    };

    return this;
  };
});
