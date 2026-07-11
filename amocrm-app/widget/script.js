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

    function renderStub() {
      var code = widgetCode();
      if (!code) {
        return;
      }
      var area = document.getElementById('work-area-' + code);
      if (!area) {
        return;
      }
      area.innerHTML =
        '<div style="padding:24px;font-family:inherit;">' +
        '<h2 style="margin:0 0 8px;font-size:18px;">' +
        t('advanced.title', 'Автоматизации Dzen.Team') +
        '</h2>' +
        '<p style="margin:0;color:#7a8290;">' +
        t('advanced.stub', 'Раздел в разработке.') +
        '</p>' +
        '</div>';
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
