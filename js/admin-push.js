/**
 * LECHAIM Admin — Web Push subscribe / unsubscribe (settings button).
 * Does not request permission until the user taps «הפעל התראות».
 */
(function (global) {
  'use strict';

  const VAPID_PUBLIC_KEY = 'BP8v_8At3h6okYnM7TI19cp8tWQ2yown3UqkynStxJm8Ob_9tVtP3YJSiq1P5HwPBqAXZVprnZ_xuCeF71Sx6FM';
  const DENIED_HINT =
    'ההתראות חסומות במכשיר.\n'
    + 'באנדרואיד: הגדרות → אפליקציות → Chrome או «LECHAIM Admin» → התראות → אפשר.\n'
    + 'אחר כך חזרו לכאן ולחצו «הפעל התראות».';

  const enableBtn = document.getElementById('settings-push-enable');
  const disableBtn = document.getElementById('settings-push-disable');
  const statusEl = document.getElementById('settings-push-status');
  const hintEl = document.getElementById('settings-push-hint');

  function getClient() {
    return global.LechaimInventory?.getClient?.()
      || global.LechaimSupabaseOrders?.getClient?.()
      || null;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
    return output;
  }

  function setHint(text, isError) {
    if (!hintEl) return;
    hintEl.hidden = !text;
    hintEl.textContent = text || '';
    hintEl.classList.toggle('is-error', Boolean(isError));
  }

  function paint(state) {
    if (statusEl) {
      statusEl.dataset.open = state === 'on' ? '1' : '0';
      statusEl.textContent = state === 'on'
        ? 'התראות פעילות'
        : (state === 'denied' ? 'חסומות' : 'כבוי');
    }
    if (enableBtn) {
      enableBtn.hidden = state === 'on';
      enableBtn.disabled = state === 'denied' || state === 'busy';
    }
    if (disableBtn) disableBtn.hidden = state !== 'on';
  }

  async function currentPushSubscription() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }

  async function saveSubscription(sub) {
    const sb = getClient();
    const { data: authData } = await sb.auth.getSession();
    const userId = authData?.session?.user?.id;
    if (!userId) throw new Error('יש להתחבר לאדמין');
    const json = sub.toJSON();
    const endpoint = String(json.endpoint || '');
    const p256dh = String(json.keys?.p256dh || '');
    const auth = String(json.keys?.auth || '');
    if (!endpoint || !p256dh || !auth) throw new Error('הרשמת ההתראות נכשלה');

    const { error } = await sb.from('admin_push_subscriptions').upsert({
      user_id: userId,
      endpoint,
      p256dh,
      auth,
      user_agent: String(navigator.userAgent || '').slice(0, 280),
      active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' });
    if (error) throw error;
  }

  async function deactivateEndpoint(endpoint) {
    const sb = getClient();
    if (!endpoint) return;
    await sb.from('admin_push_subscriptions').update({
      active: false,
      updated_at: new Date().toISOString(),
    }).eq('endpoint', endpoint);
  }

  async function refreshUi() {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      paint('off');
      setHint('המכשיר הזה לא תומך בהתראות מערכת.', true);
      if (enableBtn) enableBtn.disabled = true;
      return;
    }
    if (Notification.permission === 'denied') {
      paint('denied');
      setHint(DENIED_HINT, true);
      return;
    }
    const sub = await currentPushSubscription();
    if (sub && Notification.permission === 'granted') {
      paint('on');
      setHint('המכשיר הזה יקבל התראות גם כשהאדמין סגור.');
      return;
    }
    paint('off');
    setHint('לחצו «הפעל התראות» ואשרו במכשיר. אפשר להפעיל גם בטלפון וגם בטאבלט.');
  }

  async function enable() {
    paint('busy');
    setHint('');
    try {
      if (Notification.permission === 'denied') {
        paint('denied');
        setHint(DENIED_HINT, true);
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        if (permission === 'denied') {
          paint('denied');
          setHint(DENIED_HINT, true);
        } else {
          paint('off');
          setHint('לא אושר. אפשר לנסות שוב.');
        }
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }
      await saveSubscription(sub);
      paint('on');
      setHint('התראות פעילות במכשיר הזה.');
    } catch (err) {
      console.warn('[admin-push] enable failed', err);
      paint('off');
      setHint(err?.message || 'לא ניתן להפעיל התראות.', true);
    }
  }

  async function disable() {
    try {
      const sub = await currentPushSubscription();
      if (sub) {
        await deactivateEndpoint(sub.endpoint);
        await sub.unsubscribe();
      }
    } catch (err) {
      console.warn('[admin-push] disable failed', err);
    }
    paint('off');
    setHint('ההתראות כובו במכשיר הזה.');
  }

  async function onLoggedIn() {
    try {
      if (Notification.permission !== 'granted') return;
      const sub = await currentPushSubscription();
      if (sub) await saveSubscription(sub);
    } catch (err) {
      console.warn('[admin-push] sync failed', err);
    }
    refreshUi();
  }

  enableBtn?.addEventListener('click', () => {
    enable();
  });
  disableBtn?.addEventListener('click', () => {
    disable();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => refreshUi());
  } else {
    refreshUi();
  }

  global.LechaimAdminPush = { onLoggedIn, refreshUi };
})(window);
