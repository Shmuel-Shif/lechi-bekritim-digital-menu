/**
 * LECHAIM Admin — local CHECK-IN / CHECK-OUT reminders.
 * Visual + beep only. Not attendance. No staff_clock. No employee checks.
 */
(function (global) {
  'use strict';

  const TZ = 'Europe/Athens';
  const STORAGE_KEY = 'lechaim-admin-reminders-v1';
  const CHANNEL_NAME = 'lechaim-admin-reminders';
  const BEEP_MS = 15000;
  const MAX_WAIT_MS = 6 * 60 * 60 * 1000;
  const CHECKIN_MINUTES = 14 * 60;
  const CHECKOUT_MINUTES = 22 * 60;

  const COPY = {
    checkin: {
      title: 'CHECK-IN',
      body: 'הגיע הזמן לבצע CHECK-IN',
      pushTitle: '🔔 CHECK-IN',
      pushTag: 'lechaim-admin-reminder-checkin',
    },
    checkout: {
      title: 'CHECK-OUT',
      body: 'הגיע הזמן לבצע CHECK-OUT',
      pushTitle: '🔔 CHECK-OUT',
      pushTag: 'lechaim-admin-reminder-checkout',
    },
  };

  const root = document.getElementById('admin-reminder');
  const titleEl = document.getElementById('admin-reminder-title');
  const copyEl = document.getElementById('admin-reminder-copy');
  const errorEl = document.getElementById('admin-reminder-error');
  const formEl = document.getElementById('admin-reminder-form');
  const inputEl = document.getElementById('admin-reminder-code');
  const submitEl = document.getElementById('admin-reminder-confirm');
  const ringEl = document.getElementById('admin-reminder-ring');

  let started = false;
  let bound = false;
  let busy = false;
  let activeKind = null;
  let scheduleTimer = null;
  let beepTimer = null;
  let audioCtx = null;
  let focusRelease = null;
  let channel = null;

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function athensParts(date) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(date instanceof Date ? date : new Date());
    const get = (type) => parts.find((p) => p.type === type)?.value;
    return {
      ymd: `${get('year')}-${get('month')}-${get('day')}`,
      hour: Number(get('hour')),
      minute: Number(get('minute')),
      second: Number(get('second')),
    };
  }

  function tzOffsetMs(date) {
    const p = athensParts(date);
    const asUtc = Date.UTC(
      Number(p.ymd.slice(0, 4)),
      Number(p.ymd.slice(5, 7)) - 1,
      Number(p.ymd.slice(8, 10)),
      p.hour,
      p.minute,
      p.second
    );
    return asUtc - date.getTime();
  }

  function zonedInstant(ymd, hour, minute) {
    const y = Number(ymd.slice(0, 4));
    const m = Number(ymd.slice(5, 7));
    const d = Number(ymd.slice(8, 10));
    const wallUtc = Date.UTC(y, m - 1, d, hour, minute, 0);
    let instant = wallUtc - tzOffsetMs(new Date(wallUtc));
    const offset2 = tzOffsetMs(new Date(instant));
    instant = wallUtc - offset2;
    return new Date(instant);
  }

  function addYmd(ymd, days) {
    const y = Number(ymd.slice(0, 4));
    const m = Number(ymd.slice(5, 7));
    const d = Number(ymd.slice(8, 10));
    const next = new Date(Date.UTC(y, m - 1, d + days));
    return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
  }

  function emptyState(ymd) {
    return {
      ymd,
      checkin: 'idle',
      checkout: 'idle',
      pushCheckin: false,
      pushCheckout: false,
    };
  }

  function loadState() {
    const ymd = athensParts(new Date()).ymd;
    let parsed = null;
    try {
      parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (_) {
      parsed = null;
    }
    if (!parsed || typeof parsed !== 'object' || parsed.ymd !== ymd) {
      const fresh = emptyState(ymd);
      saveState(fresh);
      return fresh;
    }
    return {
      ymd,
      checkin: parsed.checkin === 'done' || parsed.checkin === 'active' ? parsed.checkin : 'idle',
      checkout: parsed.checkout === 'done' || parsed.checkout === 'active' ? parsed.checkout : 'idle',
      pushCheckin: Boolean(parsed.pushCheckin),
      pushCheckout: Boolean(parsed.pushCheckout),
    };
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) { /* private mode */ }
  }

  function slotKey(kind) {
    return kind === 'checkout' ? 'checkout' : 'checkin';
  }

  function pushKey(kind) {
    return kind === 'checkout' ? 'pushCheckout' : 'pushCheckin';
  }

  function dueKinds(now) {
    const p = athensParts(now);
    const minutes = p.hour * 60 + p.minute;
    const list = [];
    if (minutes >= CHECKIN_MINUTES) list.push('checkin');
    if (minutes >= CHECKOUT_MINUTES) list.push('checkout');
    return list;
  }

  function getClient() {
    return global.LechaimInventory?.getClient?.()
      || global.LechaimSupabaseOrders?.getClient?.()
      || null;
  }

  function setError(text) {
    if (!errorEl) return;
    errorEl.hidden = !text;
    errorEl.textContent = text || '';
  }

  function unlockAudio() {
    try {
      const AudioCtx = global.AudioContext || global.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtx) audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    } catch (_) { /* autoplay blocked — visual reminder still runs */ }
  }

  function playBeep() {
    try {
      const AudioCtx = global.AudioContext || global.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtx) audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      const now = audioCtx.currentTime;
      const pulses = [
        { freq: 880, at: 0, dur: 0.32 },
        { freq: 1175, at: 0.38, dur: 0.32 },
        { freq: 880, at: 0.76, dur: 0.32 },
        { freq: 1175, at: 1.14, dur: 0.32 },
        { freq: 880, at: 1.52, dur: 0.32 },
        { freq: 1175, at: 1.9, dur: 0.32 },
        { freq: 988, at: 2.28, dur: 0.45 },
        { freq: 1319, at: 2.78, dur: 0.55 },
      ];
      pulses.forEach((tone) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.value = tone.freq;
        gain.gain.setValueAtTime(0.0001, now + tone.at);
        gain.gain.exponentialRampToValueAtTime(0.42, now + tone.at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.at + tone.dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + tone.at);
        osc.stop(now + tone.at + tone.dur + 0.02);
      });
    } catch (_) { /* ignore */ }
  }

  function restartRing() {
    if (!ringEl) return;
    ringEl.classList.remove('is-running');
    void ringEl.offsetWidth;
    ringEl.classList.add('is-running');
  }

  function stopBeepChain() {
    if (beepTimer) {
      global.clearTimeout(beepTimer);
      beepTimer = null;
    }
    ringEl?.classList.remove('is-running');
  }

  function scheduleBeep(immediate) {
    if (beepTimer) {
      global.clearTimeout(beepTimer);
      beepTimer = null;
    }
    if (!activeKind || !started) return;
    const wait = immediate ? 0 : BEEP_MS;
    beepTimer = global.setTimeout(() => {
      beepTimer = null;
      if (!activeKind || !started) return;
      playBeep();
      restartRing();
      scheduleBeep(false);
    }, wait);
  }

  function broadcast(payload) {
    try {
      channel?.postMessage(payload);
    } catch (_) { /* ignore */ }
  }

  function sendPushOnce(kind) {
    const state = loadState();
    const key = pushKey(kind);
    if (state[key]) return;
    state[key] = true;
    saveState(state);
    const meta = COPY[kind];
    const notify = global.LechaimAdminPush?.showLocalNotification;
    if (typeof notify !== 'function') return;
    Promise.resolve(notify(meta.pushTitle, meta.body, meta.pushTag)).catch(() => {});
  }

  function hideOverlay() {
    stopBeepChain();
    activeKind = null;
    busy = false;
    if (typeof focusRelease === 'function') {
      focusRelease();
      focusRelease = null;
    }
    document.body.classList.remove('admin-reminder-open');
    if (root) {
      root.hidden = true;
      root.setAttribute('aria-hidden', 'true');
      root.classList.remove('is-checkin', 'is-checkout');
    }
    if (inputEl) inputEl.value = '';
    setError('');
    if (submitEl) submitEl.disabled = false;
  }

  function showOverlay(kind, opts) {
    const options = opts || {};
    const meta = COPY[kind];
    if (!meta || !root) return;
    if (activeKind === kind && !root.hidden) {
      if (!options.fromPeer && !beepTimer) scheduleBeep(true);
      return;
    }
    if (activeKind && activeKind !== kind) hideOverlay();
    activeKind = kind;
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    root.classList.toggle('is-checkin', kind === 'checkin');
    root.classList.toggle('is-checkout', kind === 'checkout');
    document.body.classList.add('admin-reminder-open');
    if (titleEl) titleEl.textContent = meta.title;
    if (copyEl) copyEl.textContent = meta.body;
    setError('');
    if (inputEl) inputEl.value = '';
    if (typeof focusRelease === 'function') focusRelease();
    focusRelease = global.LechaimFocusTrap?.activate?.(root) || null;
    global.setTimeout(() => inputEl?.focus?.(), 40);
    if (!options.fromPeer) {
      scheduleBeep(true);
      sendPushOnce(kind);
    }
  }

  function activateKind(kind, opts) {
    const options = opts || {};
    const state = loadState();
    const key = slotKey(kind);
    if (state[key] === 'done') return false;
    if (state[key] === 'active') {
      showOverlay(kind, { restore: true, fromPeer: options.fromPeer });
      return true;
    }
    state[key] = 'active';
    saveState(state);
    showOverlay(kind, options);
    if (!options.fromPeer) {
      broadcast({ type: 'activated', kind, ymd: state.ymd });
    }
    return true;
  }

  function nextDecisionAt(now) {
    const p = athensParts(now);
    const state = loadState();
    const todayCheckin = zonedInstant(p.ymd, 14, 0);
    const todayCheckout = zonedInstant(p.ymd, 22, 0);
    const tomorrowCheckin = zonedInstant(addYmd(p.ymd, 1), 14, 0);
    if (state.checkin !== 'done' && now.getTime() < todayCheckin.getTime()) return todayCheckin;
    if (state.checkout !== 'done' && now.getTime() < todayCheckout.getTime()) return todayCheckout;
    return tomorrowCheckin;
  }

  function armSchedule() {
    if (scheduleTimer) {
      global.clearTimeout(scheduleTimer);
      scheduleTimer = null;
    }
    if (!started) return;
    const now = new Date();
    const target = nextDecisionAt(now);
    let delay = target.getTime() - now.getTime();
    if (!Number.isFinite(delay) || delay < 0) delay = 0;
    delay = Math.min(delay, MAX_WAIT_MS);
    if (delay === 0) delay = 250;
    scheduleTimer = global.setTimeout(() => {
      scheduleTimer = null;
      evaluate();
    }, delay);
  }

  function evaluate() {
    if (!started) return;
    const now = new Date();
    const due = dueKinds(now);
    const state = loadState();

    if (activeKind) {
      const key = slotKey(activeKind);
      if (state[key] === 'done') hideOverlay();
    }

    if (!activeKind) {
      if (due.includes('checkin') && state.checkin !== 'done') {
        activateKind('checkin', { restore: state.checkin === 'active' });
      } else if (due.includes('checkout') && state.checkout !== 'done') {
        activateKind('checkout', { restore: state.checkout === 'active' });
      }
    }
    armSchedule();
  }

  async function verifyAndDismiss(code) {
    const sb = getClient();
    if (!sb) {
      setError('יש להתחבר לאדמין');
      return;
    }
    const { data, error } = await sb.rpc('staff_settings_verify_code', { p_code: code });
    if (error) throw error;
    const res = data || {};
    if (!res.ok) {
      if (res.error === 'invalid_code') setError('קוד שגוי');
      else if (res.error === 'code_not_set') setError('קוד הגישה עדיין לא הוגדר ב-Supabase');
      else if (res.error === 'not_authenticated') setError('יש להתחבר לאדמין');
      else setError(res.error || 'קוד שגוי');
      return;
    }
    const kind = activeKind;
    const state = loadState();
    if (kind) state[slotKey(kind)] = 'done';
    saveState(state);
    const ymd = state.ymd;
    hideOverlay();
    broadcast({ type: 'dismissed', kind, ymd });
    evaluate();
  }

  function bindUi() {
    if (bound) return;
    bound = true;

    formEl?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!activeKind || busy) return;
      const code = String(inputEl?.value || '').trim();
      if (!code) {
        setError('קוד שגוי');
        return;
      }
      busy = true;
      if (submitEl) submitEl.disabled = true;
      setError('');
      try {
        await verifyAndDismiss(code);
      } catch (err) {
        console.warn('[admin-reminders] verify failed', err);
        const msg = String(err?.message || '');
        if (/staff_settings_verify_code|function/i.test(msg)) {
          setError('יש להריץ את supabase-till-tip-and-void-gate.sql ב-Supabase');
        } else {
          setError(msg || 'קוד שגוי');
        }
      } finally {
        busy = false;
        if (submitEl) submitEl.disabled = false;
        if (activeKind && inputEl) {
          inputEl.value = '';
          inputEl.focus();
        }
      }
    });

    root?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
    });

    ['pointerdown', 'keydown', 'touchstart'].forEach((name) => {
      document.addEventListener(name, unlockAudio, { passive: true });
    });

    document.addEventListener('visibilitychange', () => {
      if (!started || document.visibilityState !== 'visible') return;
      evaluate();
    });

    global.addEventListener('pageshow', () => {
      if (started) evaluate();
    });

    global.addEventListener('storage', (event) => {
      if (!started || event.key !== STORAGE_KEY) return;
      const state = loadState();
      if (activeKind && state[slotKey(activeKind)] === 'done') {
        hideOverlay();
        evaluate();
        return;
      }
      if (!activeKind) evaluate();
    });

    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        const msg = event.data || {};
        if (!started) return;
        if (msg.type === 'dismissed') {
          const state = loadState();
          if (msg.kind && state[slotKey(msg.kind)] !== 'done') {
            state[slotKey(msg.kind)] = 'done';
            saveState(state);
          }
          if (activeKind === msg.kind) hideOverlay();
          evaluate();
          return;
        }
        if (msg.type === 'activated' && msg.kind && !activeKind) {
          showOverlay(msg.kind, { fromPeer: true, restore: true });
        }
      };
    } catch (_) {
      channel = null;
    }
  }

  function start() {
    bindUi();
    if (started) {
      evaluate();
      return;
    }
    started = true;
    unlockAudio();
    evaluate();
  }

  function stop() {
    started = false;
    if (scheduleTimer) {
      global.clearTimeout(scheduleTimer);
      scheduleTimer = null;
    }
    hideOverlay();
  }

  global.LechaimAdminReminders = { start, stop };
})(window);
