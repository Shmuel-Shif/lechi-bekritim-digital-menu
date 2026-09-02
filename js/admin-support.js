/**
 * LECHAIM — Admin customer-support inbox.
 * Isolated from orders / till / print / reservations.
 */
(function (global) {
  'use strict';

  const viewEl = document.getElementById('admin-view-support');
  const gridEl = document.getElementById('support-inbox-grid');
  const emptyEl = document.getElementById('support-inbox-empty');
  const badgeEl = document.getElementById('tab-badge-support');
  const filtersEl = document.getElementById('support-inbox-filters');

  const EMPTY = {
    new: 'אין פניות חדשות',
    closed: 'אין פניות שטופלו',
  };

  let client = null;
  let cache = [];
  let filter = 'new';
  let active = false;
  let realtimeChannel = null;
  let pollTimer = null;

  function getClient() {
    if (client) return client;
    const cfg = global.LECHAIM_SUPABASE_CONFIG || {};
    if (!cfg.url || !cfg.anonKey || !global.supabase?.createClient) return null;
    client = global.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    return client;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function formatWhen(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return { date: `${dd}.${mm}.${yy}`, time: `${hh}:${mi}` };
  }

  function formatClosedLine(iso) {
    const parts = formatWhen(iso);
    if (!parts) return '';
    return `טופל בתאריך ${parts.date} בשעה ${parts.time}`;
  }

  function firstMessage(row) {
    const list = Array.isArray(row?.support_messages) ? row.support_messages.slice() : [];
    list.sort((a, b) => (Date.parse(a.created_at || 0) || 0) - (Date.parse(b.created_at || 0) || 0));
    const customer = list.find((item) => item.sender === 'customer') || list[0];
    return String(customer?.body || '').trim();
  }

  function isOpenTicket(row) {
    return String(row?.status || '') !== 'closed';
  }

  function setBadge(count) {
    if (!badgeEl) return;
    const n = Number(count) || 0;
    badgeEl.textContent = String(n);
    badgeEl.dataset.count = String(n);
    badgeEl.hidden = n <= 0;
  }

  function updateFilterCounts() {
    if (!filtersEl) return;
    filtersEl.querySelectorAll('[data-support-filter]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.supportFilter === filter);
    });
  }

  function handledAt(row) {
    return Date.parse(row?.closed_at || row?.updated_at || 0) || 0;
  }

  function createdAt(row) {
    return Date.parse(row?.created_at || 0) || 0;
  }

  function visibleTickets() {
    const list = cache.filter((row) => (filter === 'closed' ? !isOpenTicket(row) : isOpenTicket(row)));
    if (filter === 'closed') {
      return list.sort((a, b) => handledAt(b) - handledAt(a));
    }
    return list.sort((a, b) => createdAt(b) - createdAt(a));
  }

  function toWhatsAppDigits(raw) {
    const original = String(raw || '').trim();
    let digits = original.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (!digits) return '';
    if (/^\s*\+|^\s*00/.test(original)) {
      return digits.length >= 10 && digits.length <= 15 ? digits : '';
    }
    if (digits.startsWith('972') && digits.length >= 11 && digits.length <= 15) return digits;
    if (digits.startsWith('30') && digits.length >= 11 && digits.length <= 15) return digits;
    if (digits.startsWith('05') && digits.length === 10) return `972${digits.slice(1)}`;
    if (digits.length === 9 && digits.startsWith('5')) return `972${digits}`;
    if (digits.startsWith('069') && digits.length === 11) return `30${digits.slice(1)}`;
    if (digits.length === 10 && digits.startsWith('69')) return `30${digits}`;
    if (!digits.startsWith('0') && digits.length >= 10 && digits.length <= 15) return digits;
    return '';
  }

  function isValidIntlPhone(raw) {
    const digits = toWhatsAppDigits(raw);
    return digits.length >= 10 && digits.length <= 15;
  }

  function isValidEmail(raw) {
    const email = String(raw || '').trim();
    if (email.length < 3 || email.length > 120) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function contactPreferenceOf(row) {
    const raw = String(row?.contact_preference || '').trim();
    if (raw === 'email' || raw === 'whatsapp_email' || raw === 'whatsapp') return raw;
    return 'whatsapp';
  }

  function preferenceLabel(pref) {
    if (pref === 'email') return 'אימייל';
    if (pref === 'whatsapp_email') return 'WhatsApp + אימייל';
    return 'WhatsApp';
  }

  function isMobileDevice() {
    const ua = navigator.userAgent || '';
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
    return navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua);
  }

  function openExternalUrl(url) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function openCustomerWhatsApp(phoneRaw) {
    const phone = toWhatsAppDigits(phoneRaw);
    if (!phone) return false;
    if (!isMobileDevice()) {
      openExternalUrl(`https://web.whatsapp.com/send?phone=${encodeURIComponent(phone)}`);
      return true;
    }
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) {
      const fallback = `https://wa.me/${phone}`;
      openExternalUrl(
        `intent://send/?phone=${phone}`
        + '#Intent;scheme=whatsapp;package=com.whatsapp.w4b;'
        + `S.browser_fallback_url=${encodeURIComponent(fallback)};end`
      );
      return true;
    }
    openExternalUrl(`https://wa.me/${phone}`);
    return true;
  }

  function supportEmailSubject(row) {
    const order = String(row?.public_order_no || '').trim();
    if (order) return `פנייה לשירות לקוחות - הזמנה #${order}`;
    return 'פנייה לשירות לקוחות - Lechaim';
  }

  function supportEmailBody(row) {
    const name = String(row?.customer_name || '').trim();
    const greeting = name ? `שלום ${name},` : 'שלום,';
    let message = firstMessage(row);
    if (message.length > 1500) message = `${message.slice(0, 1500)}…`;
    const quoted = message ? `"${message}"` : '"—"';
    return `${greeting}\n\nתודה שפניתם אלינו.\n\nקיבלנו את פנייתכם:\n${quoted}\n\nבברכה,\nצוות Lechaim`;
  }

  function gmailComposeUrl(to, subject, body) {
    return 'https://mail.google.com/mail/u/0/?view=cm&fs=1&tf=cm'
      + `&to=${encodeURIComponent(to)}`
      + `&su=${encodeURIComponent(subject)}`
      + `&body=${encodeURIComponent(body)}`;
  }

  function openCustomerEmail(row) {
    const email = String(row?.customer_email || '').trim();
    if (!isValidEmail(email)) return false;
    openExternalUrl(gmailComposeUrl(email, supportEmailSubject(row), supportEmailBody(row)));
    return true;
  }

  function render() {
    updateFilterCounts();
    setBadge(cache.filter(isOpenTicket).length);
    const list = visibleTickets();
    if (emptyEl) {
      emptyEl.textContent = EMPTY[filter] || 'אין פניות';
      emptyEl.hidden = list.length > 0;
    }
    if (!gridEl) return;
    gridEl.innerHTML = list.map((row) => {
      const body = firstMessage(row);
      const order = String(row.public_order_no || '').trim();
      const email = String(row.customer_email || '').trim();
      const phone = String(row.customer_phone || '').trim();
      const pref = contactPreferenceOf(row);
      const wantsWa = pref === 'whatsapp' || pref === 'whatsapp_email';
      const wantsEmail = pref === 'email' || pref === 'whatsapp_email';
      const waOk = wantsWa && isValidIntlPhone(phone);
      const emailOk = wantsEmail && isValidEmail(email);
      const phoneHtml = phone
        ? `<p class="support-ticket__meta">טלפון <span dir="ltr">${escapeHtml(phone)}</span></p>`
        : '';
      const emailHtml = email
        ? `<p class="support-ticket__meta">Email <span dir="ltr">${escapeHtml(email)}</span></p>`
        : '';
      const orderHtml = order
        ? `<p class="support-ticket__order">הזמנה #${escapeHtml(order)}</p>`
        : '';
      const closedAt = row.closed_at || row.updated_at;
      const closedHtml = !isOpenTicket(row) && closedAt
        ? `<p class="support-ticket__closed">${escapeHtml(formatClosedLine(closedAt))}</p>`
        : '';
      return `
        <article class="support-ticket" data-support-id="${escapeHtml(row.id)}" data-support-status="${escapeHtml(isOpenTicket(row) ? 'new' : 'closed')}">
          <h3 class="support-ticket__name">${escapeHtml(row.customer_name || '—')}</h3>
          ${closedHtml}
          ${phoneHtml}
          ${emailHtml}
          <p class="support-ticket__pref">דרך יצירת קשר מועדפת: ${escapeHtml(preferenceLabel(pref))}</p>
          ${orderHtml}
          <p class="support-ticket__label">הודעת הלקוח</p>
          ${body ? `<p class="support-ticket__body">${escapeHtml(body)}</p>` : '<p class="support-ticket__body">—</p>'}
          <div class="support-ticket__actions">
            ${waOk ? `<button type="button" class="admin-btn admin-btn--whatsapp" data-support-wa>WhatsApp</button>` : ''}
            ${emailOk ? `<button type="button" class="admin-btn admin-btn--soft" data-support-email>אימייל</button>` : ''}
            ${isOpenTicket(row) ? `<button type="button" class="admin-btn admin-btn--primary" data-support-done>טופל</button>` : ''}
          </div>
        </article>
      `;
    }).join('');
  }

  async function loadTickets() {
    const sb = getClient();
    if (!sb) throw new Error('חסר חיבור');
    let { data, error } = await sb
      .from('support_tickets')
      .select('id, status, customer_name, customer_phone, customer_email, public_order_no, contact_preference, created_at, updated_at, closed_at, support_messages(body, sender, created_at)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error && /contact_preference/i.test(String(error.message || error.code || ''))) {
      const retry = await sb
        .from('support_tickets')
        .select('id, status, customer_name, customer_phone, customer_email, public_order_no, created_at, updated_at, closed_at, support_messages(body, sender, created_at)')
        .order('created_at', { ascending: false })
        .limit(200);
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    cache = Array.isArray(data) ? data : [];
  }

  async function refreshBadgeOnly() {
    const sb = getClient();
    if (!sb) return;
    const { count, error } = await sb
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'closed');
    if (!error) setBadge(count || 0);
  }

  async function refresh() {
    await loadTickets();
    render();
  }

  async function setStatus(id, status) {
    const sb = getClient();
    if (!sb || !id || status !== 'closed') return;
    const patch = {
      status,
      updated_at: new Date().toISOString(),
      closed_at: status === 'closed' ? new Date().toISOString() : null,
    };
    const { error } = await sb.from('support_tickets').update(patch).eq('id', id);
    if (error) {
      console.warn('[admin-support] status update failed', error);
      return;
    }
    const row = cache.find((item) => item.id === id);
    if (row) {
      row.status = status;
      row.updated_at = patch.updated_at;
      row.closed_at = patch.closed_at;
      render();
    } else {
      await refresh();
    }
  }

  function startRealtime() {
    stopRealtime();
    const sb = getClient();
    if (!sb?.channel) return;
    realtimeChannel = sb
      .channel('admin-support-tickets')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_tickets' },
        () => {
          if (!active) return;
          if (viewEl && !viewEl.hidden) {
            refresh().catch(() => {});
          } else {
            refreshBadgeOnly().catch(() => {});
          }
        }
      )
      .subscribe();
  }

  function stopRealtime() {
    const sb = getClient();
    if (realtimeChannel && sb) {
      try { sb.removeChannel(realtimeChannel); } catch (_) { /* ignore */ }
    }
    realtimeChannel = null;
  }

  function startPolling() {
    window.clearInterval(pollTimer);
    pollTimer = window.setInterval(() => {
      if (!active) return;
      if (viewEl && !viewEl.hidden) refresh().catch(() => {});
      else refreshBadgeOnly().catch(() => {});
    }, 20000);
  }

  function stopPolling() {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }

  function bindOnce() {
    if (bindOnce.done) return;
    bindOnce.done = true;
    filtersEl?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-support-filter]');
      if (!btn) return;
      filter = btn.dataset.supportFilter === 'closed' ? 'closed' : 'new';
      render();
    });
    gridEl?.addEventListener('click', (event) => {
      const card = event.target.closest('[data-support-id]');
      const id = card?.dataset.supportId;
      if (!id) return;
      const row = cache.find((item) => item.id === id);
      if (event.target.closest('[data-support-wa]')) {
        if (row) openCustomerWhatsApp(row.customer_phone);
        return;
      }
      if (event.target.closest('[data-support-email]')) {
        if (row) openCustomerEmail(row);
        return;
      }
      if (event.target.closest('[data-support-done]')) {
        setStatus(id, 'closed');
      }
    });
  }

  async function start() {
    bindOnce();
    const already = active;
    active = true;
    try {
      if (already) {
        await refreshBadgeOnly();
        if (viewEl && !viewEl.hidden) await refresh();
      } else {
        await refresh();
      }
    } catch (err) {
      console.warn('[admin-support] load failed', err);
      await refreshBadgeOnly().catch(() => {});
      if (viewEl && !viewEl.hidden && emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = 'טעינת הפניות נכשלה — הריצו supabase-support-tickets.sql';
      }
    }
    startPolling();
    startRealtime();
  }

  function stop() {
    active = false;
    stopPolling();
    stopRealtime();
  }

  global.LechaimAdminSupport = { start, stop, refresh };
})(window);
