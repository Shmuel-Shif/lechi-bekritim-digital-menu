/**
 * LECHAIM — Admin kitchen alerts tab + live banner
 * Always Hebrew. Does not touch till / print / table close.
 */
(function (global) {
  'use strict';

  const api = global.LechaimKitchenAlerts;
  const badgeEl = document.getElementById('tab-badge-kitchen');
  const bannerEl = document.getElementById('kitchen-live-banner');
  const bannerBtn = document.getElementById('kitchen-live-banner-btn');
  const emptyEl = document.getElementById('kitchen-alerts-empty');
  const lists = {
    urgent: document.getElementById('kitchen-alerts-urgent'),
    fault: document.getElementById('kitchen-alerts-fault'),
    stock: document.getElementById('kitchen-alerts-stock'),
    pace: document.getElementById('kitchen-alerts-pace'),
    message: document.getElementById('kitchen-alerts-messages'),
  };
  const sections = {
    urgent: document.getElementById('kitchen-sec-urgent'),
    fault: document.getElementById('kitchen-sec-fault'),
    stock: document.getElementById('kitchen-sec-stock'),
    pace: document.getElementById('kitchen-sec-pace'),
    message: document.getElementById('kitchen-sec-messages'),
  };

  let cache = [];
  let unsubscribe = null;
  let active = false;
  let nagTimer = null;
  let audioCtx = null;

  function meta(type) {
    return api?.typeMeta?.(type) || { labelHe: type, bannerHe: type, section: 'message', urgent: false };
  }

  function isUrgent(type) {
    return Boolean(meta(type).urgent);
  }

  function sectionOf(type) {
    return meta(type).section || 'message';
  }

  function clock(iso) {
    const d = new Date(iso || '');
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function playKitchenChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtx) audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      const now = audioCtx.currentTime;
      const tones = [
        { freq: 523, at: 0, dur: 0.2 },
        { freq: 784, at: 0.18, dur: 0.28 },
        { freq: 1046, at: 0.4, dur: 0.35 },
      ];
      tones.forEach((tone) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.value = tone.freq;
        gain.gain.setValueAtTime(0.0001, now + tone.at);
        gain.gain.exponentialRampToValueAtTime(0.38, now + tone.at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.at + tone.dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + tone.at);
        osc.stop(now + tone.at + tone.dur + 0.02);
      });
    } catch (_) { /* ignore */ }
  }

  function setBadge(count) {
    if (badgeEl) {
      badgeEl.textContent = String(count);
      badgeEl.dataset.count = String(count);
      badgeEl.hidden = count <= 0;
      badgeEl.classList.toggle('is-live', count > 0);
    }
    const indicator = document.getElementById('admin-kitchen-indicator');
    const indicatorCount = document.getElementById('admin-kitchen-indicator-count');
    if (indicator) {
      indicator.hidden = count <= 0;
      indicator.classList.toggle('is-urgent', cache.some((row) => isUrgent(row.alert_type)));
    }
    if (indicatorCount) indicatorCount.textContent = String(count);
  }

  function paintBanner() {
    const urgent = cache.filter((row) => isUrgent(row.alert_type));
    const count = cache.length;
    if (!bannerEl || !bannerBtn) return;
    if (!count) {
      bannerEl.hidden = true;
      return;
    }
    bannerEl.hidden = false;
    bannerEl.classList.toggle('is-urgent', urgent.length > 0);
    if (urgent.length) {
      const labels = [...new Set(urgent.map((row) => meta(row.alert_type).bannerHe))];
      const time = clock(urgent[0].created_at);
      bannerBtn.textContent = time ? `${labels.join(' / ')} · ${time}` : labels.join(' / ');
    } else {
      bannerBtn.textContent = `מטבח · ${count} התראות`;
    }
  }

  function cardTitle(row) {
    if (row.alert_type === 'out_of_stock') {
      return `נגמר במלאי: ${row.product_name || row.product_id || 'מנה'}`;
    }
    if (row.alert_type === 'message') {
      return row.message || 'כללי מהמטבח';
    }
    if (row.alert_type === 'fault') {
      const name = row.product_name || row.product_id || 'ציוד';
      return row.message ? `תקלה: ${name} · ${row.message}` : `תקלה: ${name}`;
    }
    return meta(row.alert_type).bannerHe || meta(row.alert_type).labelHe;
  }

  function cardHtml(row) {
    const urgent = isUrgent(row.alert_type);
    const hideMenu = row.alert_type === 'out_of_stock' && row.product_id;
    const startClose = row.alert_type === 'close_kitchen';
    return `
      <article class="kitchen-alert-card${urgent ? ' is-urgent' : ''}" data-alert-id="${escapeHtml(row.id)}">
        <div class="kitchen-alert-card__top">
          <span class="kitchen-alert-card__type">${escapeHtml(meta(row.alert_type).labelHe)}</span>
          <span class="kitchen-alert-card__time">${escapeHtml(clock(row.created_at))}</span>
        </div>
        <p class="kitchen-alert-card__body">${escapeHtml(cardTitle(row))}</p>
        <div class="kitchen-alert-card__actions">
          ${hideMenu ? `<button type="button" class="admin-btn admin-btn--soft" data-kitchen-hide="${escapeHtml(row.product_id)}">הורד מהתפריט</button>` : ''}
          ${startClose ? '<button type="button" class="admin-btn admin-btn--danger" data-kitchen-run-close>התחל סגירה 30 דק׳</button>' : ''}
          <button type="button" class="admin-btn admin-btn--primary" data-kitchen-ack="${escapeHtml(row.id)}">קיבלתי</button>
        </div>
      </article>
    `;
  }

  function render() {
    setBadge(cache.length);
    paintBanner();
    const grouped = { urgent: [], fault: [], stock: [], pace: [], message: [] };
    cache.forEach((row) => {
      const key = sectionOf(row.alert_type);
      (grouped[key] || grouped.message).push(row);
    });
    Object.keys(lists).forEach((key) => {
      const list = lists[key];
      const section = sections[key];
      const rows = grouped[key] || [];
      if (list) list.innerHTML = rows.map(cardHtml).join('');
      if (section) section.hidden = rows.length === 0;
    });
    if (emptyEl) emptyEl.hidden = cache.length > 0;
  }

  function syncNag() {
    window.clearInterval(nagTimer);
    nagTimer = null;
    const urgentOpen = cache.some((row) => isUrgent(row.alert_type));
    if (!urgentOpen) return;
    nagTimer = window.setInterval(() => {
      if (cache.some((row) => isUrgent(row.alert_type))) playKitchenChime();
    }, 12000);
  }

  async function refresh() {
    if (!api) return;
    try {
      cache = await api.listOpen();
      render();
      syncNag();
    } catch (err) {
      console.warn('[admin-kitchen] list failed', err);
    }
  }

  async function handleAck(id) {
    try {
      await api.acknowledge(id);
      cache = cache.filter((row) => row.id !== id);
      render();
      syncNag();
    } catch (err) {
      console.warn('[admin-kitchen] ack failed', err);
    }
  }

  async function handleHide(productId, alertId) {
    try {
      if (typeof global.LechaimInventory?.setAvailable === 'function') {
        await global.LechaimInventory.setAvailable(productId, false);
      }
    } catch (err) {
      console.warn('[admin-kitchen] hide dish failed', err);
    }
    await handleAck(alertId);
  }

  function onRealtime(payload) {
    const event = payload?.eventType;
    const row = payload?.new || payload?.old;
    if (event === 'INSERT' && row?.status === 'open') {
      cache = [row, ...cache.filter((item) => item.id !== row.id)];
      if (isUrgent(row.alert_type)) playKitchenChime();
      render();
      syncNag();
      return;
    }
    if (event === 'UPDATE' || event === 'DELETE') {
      const id = row?.id || payload?.old?.id;
      if (row?.status && row.status !== 'open') {
        cache = cache.filter((item) => item.id !== id);
      } else if (event === 'DELETE') {
        cache = cache.filter((item) => item.id !== id);
      }
      render();
      syncNag();
    }
  }

  function start() {
    if (active) return;
    active = true;
    refresh();
    unsubscribe = api?.subscribe?.(onRealtime);
  }

  function stop() {
    active = false;
    window.clearInterval(nagTimer);
    nagTimer = null;
    if (typeof unsubscribe === 'function') unsubscribe();
    unsubscribe = null;
  }

  document.getElementById('admin-view-kitchen')?.addEventListener('click', (event) => {
    const hideBtn = event.target.closest('[data-kitchen-hide]');
    if (hideBtn) {
      const card = hideBtn.closest('[data-alert-id]');
      handleHide(hideBtn.dataset.kitchenHide, card?.dataset.alertId);
      return;
    }
    if (event.target.closest('[data-kitchen-run-close]')) {
      document.querySelector('#admin-view-kitchen [data-kitchen-close]')?.click();
      return;
    }
    const ackBtn = event.target.closest('[data-kitchen-ack]');
    if (ackBtn) handleAck(ackBtn.dataset.kitchenAck);
  });

  function goKitchenTab() {
    document.querySelector('.admin-tab[data-tab="kitchen"]')?.click();
  }

  bannerBtn?.addEventListener('click', goKitchenTab);
  document.getElementById('admin-kitchen-indicator')?.addEventListener('click', goKitchenTab);

  global.LechaimAdminKitchen = { start, stop, refresh };
})(window);
