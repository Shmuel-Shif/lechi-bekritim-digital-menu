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

  const STATUS_LABEL = {
    new: '🆕 חדשה',
    open: '🟡 בטיפול',
    closed: '✅ סגורה',
  };
  const EMPTY = {
    new: 'אין פניות חדשות',
    open: 'אין פניות בטיפול',
    closed: 'אין פניות סגורות',
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
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}.${mm}.${yy} · ${hh}:${mi}`;
  }

  function firstMessage(row) {
    const list = Array.isArray(row?.support_messages) ? row.support_messages.slice() : [];
    list.sort((a, b) => (Date.parse(a.created_at || 0) || 0) - (Date.parse(b.created_at || 0) || 0));
    const customer = list.find((item) => item.sender === 'customer') || list[0];
    return String(customer?.body || '').trim();
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
    const counts = { new: 0, open: 0, closed: 0 };
    cache.forEach((row) => {
      const s = String(row.status || '');
      if (counts[s] != null) counts[s] += 1;
    });
    filtersEl.querySelectorAll('[data-support-filter]').forEach((btn) => {
      const key = btn.dataset.supportFilter;
      btn.classList.toggle('is-active', key === filter);
      const badge = btn.querySelector('.admin-tab__badge');
      const n = counts[key] || 0;
      if (badge) {
        badge.textContent = String(n);
        badge.hidden = n <= 0;
      }
    });
  }

  function nextStatus(status) {
    if (status === 'new') return 'open';
    if (status === 'open') return 'closed';
    return null;
  }

  function nextLabel(status) {
    if (status === 'new') return 'עברו לטיפול';
    if (status === 'open') return 'סגרו פנייה';
    return '';
  }

  function render() {
    updateFilterCounts();
    setBadge(cache.filter((row) => row.status === 'new').length);
    const list = cache.filter((row) => row.status === filter);
    if (emptyEl) {
      emptyEl.textContent = EMPTY[filter] || 'אין פניות';
      emptyEl.hidden = list.length > 0;
    }
    if (!gridEl) return;
    gridEl.innerHTML = list.map((row) => {
      const body = firstMessage(row);
      const order = String(row.public_order_no || '').trim();
      const email = String(row.customer_email || '').trim();
      const nxt = nextStatus(row.status);
      return `
        <article class="support-ticket" data-support-id="${escapeHtml(row.id)}" data-support-status="${escapeHtml(row.status)}">
          <header class="support-ticket__head">
            <span class="support-ticket__status support-ticket__status--${escapeHtml(row.status)}">${escapeHtml(STATUS_LABEL[row.status] || row.status)}</span>
            <time class="support-ticket__when">${escapeHtml(formatWhen(row.created_at))}</time>
          </header>
          <h3 class="support-ticket__name">${escapeHtml(row.customer_name || '—')}</h3>
          <p class="support-ticket__meta">
            <a href="tel:${escapeHtml(String(row.customer_phone || '').replace(/\s/g, ''))}">${escapeHtml(row.customer_phone || '—')}</a>
            ${email ? ` · <span dir="ltr">${escapeHtml(email)}</span>` : ''}
            ${order ? ` · הזמנה ${escapeHtml(order)}` : ''}
          </p>
          <p class="support-ticket__subject">${escapeHtml(row.subject || '')}</p>
          ${body ? `<p class="support-ticket__body">${escapeHtml(body)}</p>` : ''}
          ${nxt ? `<button type="button" class="admin-btn admin-btn--primary" data-support-next="${escapeHtml(nxt)}">${escapeHtml(nextLabel(row.status))}</button>` : ''}
        </article>
      `;
    }).join('');
  }

  async function loadTickets() {
    const sb = getClient();
    if (!sb) throw new Error('חסר חיבור');
    const { data, error } = await sb
      .from('support_tickets')
      .select('id, status, customer_name, customer_phone, customer_email, public_order_no, subject, created_at, support_messages(body, sender, created_at)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    cache = Array.isArray(data) ? data : [];
  }

  async function refreshBadgeOnly() {
    const sb = getClient();
    if (!sb) return;
    const { count, error } = await sb
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new');
    if (!error) setBadge(count || 0);
  }

  async function refresh() {
    await loadTickets();
    render();
  }

  async function setStatus(id, status) {
    const sb = getClient();
    if (!sb || !id || !status) return;
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
      filter = btn.dataset.supportFilter || 'new';
      render();
    });
    gridEl?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-support-next]');
      if (!btn) return;
      const card = btn.closest('[data-support-id]');
      const id = card?.dataset.supportId;
      const next = btn.dataset.supportNext;
      if (id && next) setStatus(id, next);
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
