/**
 * LECHAIM — Admin Settings tab (hours, delivery copy, restaurant/kitchen/shabbat controls).
 * Toggles reuse existing IDs/APIs. This module only loads/saves flag_text values
 * and paints status pills.
 */
(function (global) {
  'use strict';

  const view = document.getElementById('admin-view-settings');
  const indexEl = document.getElementById('settings-index');
  const hoursDaysEl = document.getElementById('settings-hours-days');
  const hoursSaveBtn = document.getElementById('settings-hours-save');
  const deliveryMinInput = document.getElementById('settings-delivery-min');
  const deliveryFeeInput = document.getElementById('settings-delivery-fee');
  const deliveryEtaInput = document.getElementById('settings-delivery-eta');
  const deliverySaveBtn = document.getElementById('settings-delivery-save');
  const shabbatPickupInput = document.getElementById('settings-shabbat-pickup');
  const shabbatSaveBtn = document.getElementById('settings-shabbat-save');
  const shopStatusEl = document.getElementById('settings-shop-status');
  const deliveriesStatusEl = document.getElementById('settings-deliveries-status');
  const kitchenStatusEl = document.getElementById('settings-kitchen-status');
  const shabbatStatusEl = document.getElementById('settings-shabbat-status');

  let started = false;
  let flagsUnsub = null;
  let kitchenTick = null;
  let dineInCloseAtMs = null;
  let deliveriesClosed = false;
  let shabbatEnabled = true;

  function showToast(message) {
    if (typeof global.LechaimAdminTables?.showSuccessModal === 'function') {
      global.LechaimAdminTables.showSuccessModal(message || '', {
        checkOnly: true,
        autoCloseMs: 500,
      });
      return;
    }
    const toast = document.getElementById('admin-toast');
    if (!toast) return;
    toast.hidden = false;
    toast.textContent = message;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      toast.hidden = true;
    }, 500);
  }

  function showError(message) {
    const el = document.getElementById('admin-panel-error');
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || '';
  }

  function paintStatus(el, open, openText, closedText) {
    if (!el) return;
    el.dataset.open = open ? '1' : '0';
    el.textContent = open ? openText : closedText;
  }

  function formatRemain(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function paintShopStatus() {
    const open = global.LechaimOpeningHours?.isWithinOrderingHours?.() === true;
    paintStatus(shopStatusEl, open, 'פתוחה', 'סגורה');
  }

  function paintDeliveriesStatus() {
    paintStatus(deliveriesStatusEl, !deliveriesClosed, 'פתוחים', 'סגורים');
  }

  function paintShabbatStatus() {
    paintStatus(shabbatStatusEl, shabbatEnabled !== false, 'פתוחות', 'סגורות');
  }

  function paintKitchenStatus() {
    if (!kitchenStatusEl) return;
    if (!dineInCloseAtMs) {
      paintStatus(kitchenStatusEl, true, 'פתוח', 'סגור');
      return;
    }
    const remain = dineInCloseAtMs - Date.now();
    if (remain > 0) {
      kitchenStatusEl.dataset.open = '0';
      kitchenStatusEl.textContent = `נסגר בעוד ${formatRemain(remain)}`;
    } else {
      paintStatus(kitchenStatusEl, false, 'פתוח', 'סגור');
    }
  }

  function armKitchenTick() {
    if (kitchenTick) {
      window.clearInterval(kitchenTick);
      kitchenTick = null;
    }
    if (dineInCloseAtMs && dineInCloseAtMs > Date.now()) {
      kitchenTick = window.setInterval(paintKitchenStatus, 1000);
    }
    paintKitchenStatus();
  }

  function dayRow(day) {
    return hoursDaysEl?.querySelector(`.settings-hours-day[data-day="${day}"]`) || null;
  }

  function syncDayRowEnabled(row) {
    if (!row) return;
    const open = row.querySelector('.settings-hours-open')?.checked === true;
    row.querySelectorAll('.settings-hours-from, .settings-hours-to').forEach((input) => {
      input.disabled = !open;
    });
  }

  function readWeeklyFromForm() {
    const week = {};
    for (let day = 0; day < 7; day += 1) {
      const row = dayRow(day);
      week[day] = {
        open: row?.querySelector('.settings-hours-open')?.checked === true,
        from: row?.querySelector('.settings-hours-from')?.value || '14:00',
        to: row?.querySelector('.settings-hours-to')?.value || '21:00',
      };
    }
    return week;
  }

  function fillWeeklyForm(week) {
    const hours = global.LechaimOpeningHours;
    const src = week || hours?.getWeeklySchedule?.() || {};
    for (let day = 0; day < 7; day += 1) {
      const row = dayRow(day);
      if (!row) continue;
      const rule = src[day] || src[String(day)] || { open: day <= 4, from: '14:00', to: '21:00' };
      const box = row.querySelector('.settings-hours-open');
      const from = row.querySelector('.settings-hours-from');
      const to = row.querySelector('.settings-hours-to');
      if (box) box.checked = rule.open !== false;
      if (from) from.value = rule.from || '14:00';
      if (to) to.value = rule.to || '21:00';
      syncDayRowEnabled(row);
    }
  }

  function fillFormFromSettings() {
    const hours = global.LechaimOpeningHours;
    const settings = global.LechaimAppSettings;
    fillWeeklyForm(hours?.getWeeklySchedule?.());
    if (deliveryMinInput) deliveryMinInput.value = String(settings?.getDeliveryMinOrder?.() ?? 100);
    if (deliveryFeeInput) deliveryFeeInput.value = String(settings?.getDeliveryFee?.() ?? 10);
    if (deliveryEtaInput) {
      deliveryEtaInput.value = settings?.getDeliveryEta?.('he') || '30–45 דקות';
    }
    if (shabbatPickupInput) {
      shabbatPickupInput.value = settings?.getShabbatPickupTime?.() || '14:00';
    }
  }

  async function refreshFlags() {
    const api = global.LechaimSupabaseOrders;
    if (!api?.isConfigured?.()) {
      paintShopStatus();
      paintDeliveriesStatus();
      paintShabbatStatus();
      paintKitchenStatus();
      return;
    }
    try {
      const [closed, shabbat, closeAt] = await Promise.all([
        typeof api.getDeliveriesClosed === 'function' ? api.getDeliveriesClosed() : false,
        typeof api.getShabbatOrdersEnabled === 'function' ? api.getShabbatOrdersEnabled() : true,
        typeof api.getDineInCloseAt === 'function' ? api.getDineInCloseAt() : null,
      ]);
      deliveriesClosed = Boolean(closed);
      shabbatEnabled = Boolean(shabbat);
      dineInCloseAtMs = closeAt ? Date.parse(closeAt) : null;
      if (!Number.isFinite(dineInCloseAtMs)) dineInCloseAtMs = null;
    } catch (err) {
      console.warn('[admin-settings] flags load failed', err);
    }
    paintShopStatus();
    paintDeliveriesStatus();
    paintShabbatStatus();
    armKitchenTick();
  }

  async function saveHours() {
    const api = global.LechaimSupabaseOrders;
    const week = readWeeklyFromForm();
    for (let day = 0; day < 7; day += 1) {
      const row = week[day];
      if (!row.open) continue;
      if (!row.from || !row.to) {
        showError('נא למלא שעת פתיחה וסגירה לכל יום פתוח');
        return;
      }
      if (String(row.to) <= String(row.from)) {
        showError('שעת הסגירה חייבת להיות אחרי שעת הפתיחה');
        return;
      }
    }
    if (typeof api?.setWeeklyHours !== 'function' && typeof api?.setAppSetting !== 'function') {
      showError('שמירת שעות לא זמינה');
      return;
    }
    hoursSaveBtn && (hoursSaveBtn.disabled = true);
    showError('');
    try {
      if (typeof api.setWeeklyHours === 'function') {
        await api.setWeeklyHours(week);
      } else {
        await api.setAppSetting('hours_weekly', JSON.stringify(week));
      }
      const today = new Date().getDay();
      if (week[today] && week[today].open !== true && typeof api.setShopForceOpen === 'function') {
        try { await api.setShopForceOpen(false); } catch (_) { /* keep schedule */ }
        global.LechaimOpeningHours?.applyForceOpenFromFlag?.(false, null);
      }
      global.LechaimOpeningHours?.setWeeklySchedule?.(week);
      global.LechaimAppSettings?.applyPatch?.({ hours_weekly: JSON.stringify(week) });
      fillFormFromSettings();
      paintShopStatus();
      showToast('');
    } catch (err) {
      showError(err?.message || 'שמירת השעות נכשלה');
    } finally {
      if (hoursSaveBtn) hoursSaveBtn.disabled = false;
    }
  }

  async function saveDelivery() {
    const api = global.LechaimSupabaseOrders;
    const minOrder = String(deliveryMinInput?.value || '').trim();
    const fee = String(deliveryFeeInput?.value || '').trim();
    const eta = String(deliveryEtaInput?.value || '').trim();
    if (!minOrder || !fee || !eta) {
      showError('נא למלא מינימום, דמי משלוח וזמן הגעה');
      return;
    }
    if (Number(minOrder) < 0 || Number(fee) < 0) {
      showError('הסכומים חייבים להיות 0 ומעלה');
      return;
    }
    if (typeof api?.setDeliverySettings !== 'function') {
      showError('שמירת משלוחים לא זמינה');
      return;
    }
    deliverySaveBtn && (deliverySaveBtn.disabled = true);
    showError('');
    try {
      await api.setDeliverySettings({ fee, minOrder, eta });
      global.LechaimAppSettings?.applyPatch?.({
        delivery_fee: fee,
        delivery_min_order: minOrder,
        delivery_eta: eta,
      });
      fillFormFromSettings();
      showToast('');
    } catch (err) {
      showError(err?.message || 'שמירת המשלוחים נכשלה');
    } finally {
      if (deliverySaveBtn) deliverySaveBtn.disabled = false;
    }
  }

  async function saveShabbatPickup() {
    const api = global.LechaimSupabaseOrders;
    const time = String(shabbatPickupInput?.value || '').trim();
    if (!time) {
      showError('נא לבחור שעת איסוף לשבת');
      return;
    }
    if (typeof api?.setShabbatPickupTime !== 'function') {
      showError('שמירת שעת איסוף לא זמינה');
      return;
    }
    shabbatSaveBtn && (shabbatSaveBtn.disabled = true);
    showError('');
    try {
      await api.setShabbatPickupTime(time);
      global.LechaimAppSettings?.applyPatch?.({ shabbat_pickup_time: time });
      fillFormFromSettings();
      showToast('');
    } catch (err) {
      showError(err?.message || 'שמירת שעת האיסוף נכשלה');
    } finally {
      if (shabbatSaveBtn) shabbatSaveBtn.disabled = false;
    }
  }

  function itemEl(key) {
    return indexEl?.querySelector(`.settings-item[data-settings-key="${key}"]`) || null;
  }

  function closeItem(item) {
    if (!item) return;
    item.classList.remove('is-open');
    const row = item.querySelector('[data-settings-open]');
    const card = item.querySelector('.settings-card');
    if (row) row.setAttribute('aria-expanded', 'false');
    if (card) card.hidden = true;
  }

  function closeAll() {
    indexEl?.querySelectorAll('.settings-item').forEach(closeItem);
  }

  function toggleCard(key) {
    const item = itemEl(key);
    if (!item) return;
    const wasOpen = item.classList.contains('is-open');
    closeAll();
    if (wasOpen) return;
    item.classList.add('is-open');
    const row = item.querySelector('[data-settings-open]');
    const card = item.querySelector('.settings-card');
    if (row) row.setAttribute('aria-expanded', 'true');
    if (card) card.hidden = false;
  }

  function bind() {
    indexEl?.addEventListener('click', (event) => {
      const row = event.target.closest('[data-settings-open]');
      if (!row || !indexEl.contains(row)) return;
      toggleCard(row.getAttribute('data-settings-open'));
    });
    hoursDaysEl?.addEventListener('change', (event) => {
      const row = event.target.closest('.settings-hours-day');
      if (row) syncDayRowEnabled(row);
    });
    hoursSaveBtn?.addEventListener('click', () => {
      saveHours().catch((err) => console.error('[admin-settings] hours save', err));
    });
    deliverySaveBtn?.addEventListener('click', () => {
      saveDelivery().catch((err) => console.error('[admin-settings] delivery save', err));
    });
    shabbatSaveBtn?.addEventListener('click', () => {
      saveShabbatPickup().catch((err) => console.error('[admin-settings] shabbat save', err));
    });
  }

  function start() {
    if (!view) return;
    closeAll();
    fillFormFromSettings();
    refreshFlags();
    if (started) return;
    started = true;
    bind();
    const api = global.LechaimSupabaseOrders;
    if (typeof api?.subscribeRestaurantFlags === 'function') {
      flagsUnsub = api.subscribeRestaurantFlags((evt) => {
        if (evt?.flagKey === 'deliveries_closed') {
          deliveriesClosed = Boolean(evt.flagValue);
          paintDeliveriesStatus();
        } else if (evt?.flagKey === 'shabbat_orders_enabled') {
          shabbatEnabled = Boolean(evt.flagValue);
          paintShabbatStatus();
        } else if (evt?.flagKey === 'dine_in_close_at') {
          dineInCloseAtMs = evt.flagValue && evt.flagText ? Date.parse(evt.flagText) : null;
          if (!Number.isFinite(dineInCloseAtMs)) dineInCloseAtMs = null;
          armKitchenTick();
        } else if (
          evt?.flagKey === 'shop_force_open'
          || evt?.flagKey === 'shop_force_close'
          || evt?.flagKey === 'hours_open'
          || evt?.flagKey === 'hours_close'
          || evt?.flagKey === 'hours_weekly'
        ) {
          paintShopStatus();
          fillFormFromSettings();
        } else if (
          evt?.flagKey === 'delivery_fee'
          || evt?.flagKey === 'delivery_min_order'
          || evt?.flagKey === 'delivery_eta'
          || evt?.flagKey === 'shabbat_pickup_time'
        ) {
          fillFormFromSettings();
        }
      });
    }
    global.LechaimOpeningHours?.onScheduleChange?.(paintShopStatus);
    global.LechaimAppSettings?.onChange?.(fillFormFromSettings);
  }

  function stop() {
    if (kitchenTick) {
      window.clearInterval(kitchenTick);
      kitchenTick = null;
    }
    if (typeof flagsUnsub === 'function') {
      try { flagsUnsub(); } catch (_) { /* ignore */ }
      flagsUnsub = null;
    }
    started = false;
  }

  global.LechaimAdminSettings = { start, stop };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (view && !view.hidden) start();
    });
  }
})(window);
