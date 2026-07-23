/**
 * LECHAIM Admin — PWA install helper
 * Registers service worker and shows “Install app” when the browser allows it.
 */
(function () {
  'use strict';

  let deferredPrompt = null;

  function isStandalone() {
    return Boolean(
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function setInstallVisible(show) {
    document.querySelectorAll('[data-admin-install]').forEach((btn) => {
      btn.hidden = !show;
    });
  }

  function updateInstallUi() {
    if (isStandalone()) {
      setInstallVisible(false);
      return;
    }
    setInstallVisible(Boolean(deferredPrompt));
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('./admin-sw.js', { scope: './' });
      console.log('[admin-pwa] service worker registered', reg.scope);
    } catch (err) {
      console.warn('[admin-pwa] service worker registration failed', err);
    }
  }

  async function promptInstall() {
    if (!deferredPrompt) return;
    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    updateInstallUi();
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
    } catch (err) {
      console.warn('[admin-pwa] install prompt failed', err);
    }
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    updateInstallUi();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    setInstallVisible(false);
  });

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-admin-install]');
    if (!btn) return;
    event.preventDefault();
    promptInstall();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      registerServiceWorker();
      updateInstallUi();
    });
  } else {
    registerServiceWorker();
    updateInstallUi();
  }
})();
