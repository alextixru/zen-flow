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

    function ns() {
      window.__dzenflow = window.__dzenflow || {};
      return window.__dzenflow;
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
