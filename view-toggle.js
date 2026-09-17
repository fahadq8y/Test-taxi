/* Persistent Mobile/Desktop view control.
 * This file is intentionally dependency-free and is loaded synchronously in <head>.
 */
(function (window, document) {
  'use strict';

  var STORAGE_KEY = 'taxi:viewMode';
  var DESKTOP_WIDTH = 'width=1280, initial-scale=1, viewport-fit=cover';
  var MOBILE_WIDTH = 'width=device-width, initial-scale=1, viewport-fit=cover';
  var VALID = { mobile: true, desktop: true };

  function readMode() {
    try {
      var value = window.localStorage.getItem(STORAGE_KEY);
      return VALID[value] ? value : null;
    } catch (error) {
      return null;
    }
  }

  function isSmallDevice() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
  }

  function isInstalledApp() {
    var standalone = !!window.navigator.standalone;
    if (!window.matchMedia) return standalone;
    return standalone ||
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches;
  }

  function effectiveMode() {
    return readMode() || (isSmallDevice() ? 'mobile' : 'desktop');
  }

  function setViewport(mode) {
    var meta = document.getElementById('viewModeViewport') ||
      document.querySelector('meta[name="viewport"]');
    if (meta) {
      meta.id = 'viewModeViewport';
      meta.setAttribute('content', mode === 'desktop' ? DESKTOP_WIDTH : MOBILE_WIDTH);
    }
  }

  function applyMode(mode) {
    var root = document.documentElement;
    var installed = isInstalledApp();
    root.dataset.viewMode = mode;
    root.dataset.installedApp = installed ? 'standalone' : 'browser';
    root.classList.toggle('view-mobile', mode === 'mobile');
    root.classList.toggle('view-desktop', mode === 'desktop');
    root.classList.toggle('view-standalone', installed);
    setViewport(mode);
  }

  function saveMode(mode) {
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch (error) {
      /* Private browsing/storage-disabled mode remains usable with in-memory state. */
    }
  }

  function addStyles() {
    if (document.getElementById('viewToggleStyles')) return;
    var style = document.createElement('style');
    style.id = 'viewToggleStyles';
    style.textContent =
      '.view-toggle{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:8px 12px;border:1px solid rgba(18,52,59,.3);border-radius:10px;background:rgba(255,253,248,.96);color:#12343b;box-shadow:0 3px 12px rgba(0,0,0,.18);font:600 13px/1.25 Tahoma,Arial,sans-serif;cursor:pointer;direction:rtl;white-space:nowrap;vertical-align:middle;-webkit-tap-highlight-color:transparent}' +
      '.view-toggle:focus-visible{outline:3px solid #087f8c;outline-offset:2px}' +
      '.view-toggle:hover{background:#fff;transform:translateY(-1px)}' +
      '@media(max-width:520px){.view-toggle{max-width:calc(100vw - 20px);overflow:hidden;text-overflow:ellipsis}}' +
      '.view-toggle-fallback{display:flex;align-items:center;justify-content:flex-start;min-height:60px;padding:calc(8px + env(safe-area-inset-top)) 10px 8px;direction:rtl}' +
      '@media print{.view-toggle,.view-toggle-fallback{display:none!important}}' +
      'html.view-mobile .desktop-table{display:none!important}html.view-mobile .mobile-cards{display:block!important}' +
      'html.view-desktop .desktop-table{display:table!important}html.view-desktop .mobile-cards{display:none!important}';
    (document.head || document.documentElement).appendChild(style);
  }

  function updateButton(button) {
    var mode = effectiveMode();
    var next = mode === 'desktop' ? 'mobile' : 'desktop';
    button.textContent = next === 'desktop' ? '🖥️ عرض الديسكتوب' : '📱 عرض الجوال';
    button.setAttribute('aria-label', next === 'desktop'
      ? 'التبديل إلى عرض الديسكتوب'
      : 'التبديل إلى عرض الجوال');
    button.setAttribute('aria-pressed', mode === 'desktop' ? 'true' : 'false');
    button.title = button.getAttribute('aria-label');
  }

  function isVisible(element) {
    if (!element) return false;
    var style = window.getComputedStyle(element);
    var rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' &&
      rect.width > 0 && rect.height > 0;
  }

  function findTopContainer() {
    var selectors = ['.nav-buttons', '.header-right', '.header .meta',
      '.action-buttons', 'header', '.header'];
    for (var i = 0; i < selectors.length; i += 1) {
      var candidates = document.querySelectorAll(selectors[i]);
      for (var j = 0; j < candidates.length; j += 1) {
        if (isVisible(candidates[j])) return candidates[j];
      }
    }
    return null;
  }

  function placeButton(button) {
    var container = findTopContainer();
    var fallback = document.getElementById('viewToggleFallback');
    if (fallback) fallback.remove();
    if (container) {
      button.classList.remove('view-toggle-fallback-button');
      container.appendChild(button);
      return;
    }
    fallback = document.createElement('div');
    fallback.id = 'viewToggleFallback';
    fallback.className = 'view-toggle-fallback';
    fallback.appendChild(button);
    (document.body || document.documentElement).insertBefore(
      fallback, (document.body || document.documentElement).firstChild
    );
  }

  function installButton() {
    addStyles();
    var button = document.getElementById('viewToggle');
    if (!button) {
      button = document.createElement('button');
      button.id = 'viewToggle';
      button.className = 'view-toggle';
      button.type = 'button';
      button.addEventListener('click', function () {
        var next = effectiveMode() === 'desktop' ? 'mobile' : 'desktop';
        saveMode(next);
        applyMode(next);
        window.location.reload();
      });
    }
    placeButton(button);
    updateButton(button);
  }

  /* Apply before first paint, then add the accessible control after the body exists. */
  applyMode(effectiveMode());
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installButton, { once: true });
  } else {
    installButton();
  }
}(window, document));