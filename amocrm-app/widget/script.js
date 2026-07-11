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

    // W002-проба: внешний https-iframe в work-area — измерение поведения CSP amo
    // и размеров области. В W003 src меняется на embed-SDK форка (configure()).
    function renderStub() {
      var code = widgetCode();
      if (!code) {
        return;
      }
      var area = document.getElementById('work-area-' + code);
      if (!area) {
        return;
      }
      var top = area.getBoundingClientRect().top;
      var height = Math.max(400, Math.round(window.innerHeight - top - 16));
      area.innerHTML =
        '<div style="padding:16px 24px 8px;font-family:inherit;">' +
        '<h2 style="margin:0 0 4px;font-size:18px;">' +
        t('advanced.title', 'Автоматизации Dzen.Team') +
        '</h2>' +
        '<p style="margin:0;color:#7a8290;">' +
        t('advanced.stub', 'Раздел в разработке.') +
        '</p>' +
        '</div>' +
        '<iframe id="dzenflow-frame-' + code +
        '" src="https://example.com/" ' +
        'style="display:block;width:100%;height:' + height +
        'px;border:0;" referrerpolicy="no-referrer"></iframe>';
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
        return true;
      },
      advancedSettings: function () {
        renderStub();
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
