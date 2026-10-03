/**
 * LECHAIM — Admin sticky notes (פתקים).
 * Create / edit / delete / mark done. History via filter; due reminders stay visible.
 */
(function (global) {
  'use strict';

  const core = global.LechaimAdminNotesCore;
  const viewEl = document.getElementById('admin-view-notes');
  const listEl = document.getElementById('notes-list');
  const emptyEl = document.getElementById('notes-empty');
  const errorEl = document.getElementById('notes-error');
  const filterEl = document.getElementById('notes-filter');
  const addBtn = document.getElementById('notes-add-btn');
  const modal = document.getElementById('notes-modal');
  const modalBackdrop = document.getElementById('notes-modal-backdrop');
  const modalClose = document.getElementById('notes-modal-close');
  const modalTitle = document.getElementById('notes-modal-title');
  const formEl = document.getElementById('notes-form');
  const titleInput = document.getElementById('notes-field-title');
  const bodyInput = document.getElementById('notes-field-body');
  const remindInput = document.getElementById('notes-field-remind');
  const formErrorEl = document.getElementById('notes-form-error');
  const cancelBtn = document.getElementById('notes-form-cancel');

  let client = null;
  let cache = [];
  let filter = core?.FILTER_OPEN || 'open';
  let editingId = null;
  let busy = false;
  let bound = false;
  let focusTrapRelease = null;
  let historyMode = false;
  let historyHost = null;

  function getClient() {
    if (client) return client;
    if (typeof global.LechaimInventory?.getClient === 'function') {
      client = global.LechaimInventory.getClient();
      if (client) return client;
    }
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

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function toLocalInputValue(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function showError(message) {
    const host = historyMode ? historyHost?.querySelector?.('.notes-error') : errorEl;
    if (!host) return;
    if (!message) {
      host.hidden = true;
      host.textContent = '';
      return;
    }
    host.hidden = false;
    host.textContent = message;
  }

  function showFormError(message) {
    if (!formErrorEl) return;
    formErrorEl.hidden = !message;
    formErrorEl.textContent = message || '';
  }

  function showConfirm(message, yesLabel) {
    if (typeof global.LechaimAdminTables?.showConfirmModal === 'function') {
      return global.LechaimAdminTables.showConfirmModal(message, { yesLabel: yesLabel || 'כן' });
    }
    return Promise.resolve(window.confirm(String(message || '')));
  }

  function activeListEl() {
    return historyMode ? historyHost?.querySelector?.('#history-notes-list') || historyHost : listEl;
  }

  function activeEmptyEl() {
    return historyMode ? historyHost?.querySelector?.('#history-notes-empty') : emptyEl;
  }

  function activeFilterEl() {
    return historyMode ? historyHost?.querySelector?.('#history-notes-filter') : filterEl;
  }

  function setFilter(next) {
    filter = core.normalizeFilter(next);
    const host = activeFilterEl();
    host?.querySelectorAll?.('[data-notes-filter]')?.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.notesFilter === filter);
    });
    renderList();
  }

  function renderList() {
    const host = activeListEl();
    const empty = activeEmptyEl();
    if (!host || !core) return;
    const rows = core.filterNotes(cache, filter);
    if (!rows.length) {
      host.innerHTML = '';
      if (empty) {
        empty.hidden = false;
        empty.textContent = filter === 'done'
          ? 'אין פתקים שבוצעו'
          : (filter === 'open' ? 'אין פתקים פתוחים' : 'אין פתקים');
      }
      return;
    }
    if (empty) empty.hidden = true;
    host.innerHTML = rows.map((note) => {
      const open = core.normalizeStatus(note.status) === core.STATUS_OPEN;
      const due = core.isReminderDue(note);
      const classes = [
        'notes-card',
        open ? 'is-open' : 'is-done',
        due ? 'is-due' : '',
      ].filter(Boolean).join(' ');
      const statusLabel = open ? (due ? 'תזכורת הגיעה' : 'פתוח') : 'בוצע';
      const remindLine = note.remind_at
        ? `<span class="notes-card__meta">תזכורת: ${escapeHtml(formatDateTime(note.remind_at))}</span>`
        : '';
      const doneLine = note.completed_at
        ? `<span class="notes-card__meta">בוצע: ${escapeHtml(formatDateTime(note.completed_at))}</span>`
        : '';
      return `
        <article class="${classes}" data-note-id="${escapeHtml(note.id)}">
          <div class="notes-card__main">
            <div class="notes-card__top">
              <h3 class="notes-card__title">${escapeHtml(note.title)}</h3>
              <span class="notes-card__status">${escapeHtml(statusLabel)}</span>
            </div>
            <p class="notes-card__body">${escapeHtml(note.body)}</p>
            <div class="notes-card__metas">
              <span class="notes-card__meta">נוצר: ${escapeHtml(formatDateTime(note.created_at))}</span>
              ${remindLine}
              ${doneLine}
            </div>
          </div>
          <div class="notes-card__actions">
            ${open
              ? `<button type="button" class="admin-btn admin-btn--primary" data-note-done="${escapeHtml(note.id)}">בוצע</button>`
              : `<button type="button" class="admin-btn admin-btn--soft" data-note-reopen="${escapeHtml(note.id)}">החזר לפתוח</button>`}
            <button type="button" class="admin-btn admin-btn--ghost" data-note-edit="${escapeHtml(note.id)}">עריכה</button>
            <button type="button" class="admin-btn admin-btn--danger" data-note-delete="${escapeHtml(note.id)}">מחיקה</button>
          </div>
        </article>
      `;
    }).join('');
  }

  function closeModal() {
    if (!modal) return;
    if (typeof focusTrapRelease === 'function') focusTrapRelease();
    focusTrapRelease = null;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    const open = document.querySelector('.admin-modal:not([hidden])');
    if (!open) document.body.classList.remove('admin-modal-open');
    editingId = null;
    showFormError('');
  }

  function openModal(note) {
    if (!modal) return;
    editingId = note?.id || null;
    if (modalTitle) modalTitle.textContent = editingId ? 'עריכת פתק' : 'פתק חדש';
    if (titleInput) titleInput.value = note?.title || '';
    if (bodyInput) bodyInput.value = note?.body || '';
    if (remindInput) remindInput.value = toLocalInputValue(note?.remind_at);
    showFormError('');
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    if (typeof focusTrapRelease === 'function') focusTrapRelease();
    focusTrapRelease = global.LechaimFocusTrap?.activate?.(modal) || null;
    window.setTimeout(() => titleInput?.focus?.(), 40);
  }

  async function loadNotes() {
    const sb = getClient();
    if (!sb) {
      showError('לא ניתן לטעון פתקים כרגע');
      cache = [];
      renderList();
      return;
    }
    showError('');
    const { data, error } = await sb
      .from('admin_notes')
      .select('id, title, body, remind_at, status, created_at, updated_at, completed_at')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[admin-notes] load', error);
      showError('לא ניתן לטעון את הפתקים כרגע');
      cache = [];
      renderList();
      return;
    }
    cache = Array.isArray(data) ? data : [];
    renderList();
  }

  async function saveNote(event) {
    event.preventDefault();
    if (busy || !core) return;
    const checked = core.validateNoteInput({
      title: titleInput?.value,
      body: bodyInput?.value,
      remind_at: remindInput?.value ? new Date(remindInput.value).toISOString() : null,
    });
    if (!checked.ok) {
      showFormError(checked.error);
      return;
    }
    const sb = getClient();
    if (!sb) {
      showFormError('לא ניתן לשמור כרגע');
      return;
    }
    busy = true;
    try {
      if (editingId) {
        const { data, error } = await sb
          .from('admin_notes')
          .update({
            title: checked.note.title,
            body: checked.note.body,
            remind_at: checked.note.remind_at,
          })
          .eq('id', editingId)
          .select('id, title, body, remind_at, status, created_at, updated_at, completed_at')
          .single();
        if (error) throw error;
        cache = cache.map((row) => (String(row.id) === String(editingId) ? data : row));
      } else {
        const { data: userData } = await sb.auth.getUser();
        const { data, error } = await sb
          .from('admin_notes')
          .insert({
            title: checked.note.title,
            body: checked.note.body,
            remind_at: checked.note.remind_at,
            status: 'open',
            created_by: userData?.user?.id || null,
          })
          .select('id, title, body, remind_at, status, created_at, updated_at, completed_at')
          .single();
        if (error) throw error;
        cache = [data, ...cache];
      }
      closeModal();
      renderList();
    } catch (err) {
      console.error('[admin-notes] save', err);
      showFormError('השמירה נכשלה');
    } finally {
      busy = false;
    }
  }

  async function markDone(id) {
    const existing = cache.find((row) => String(row.id) === String(id));
    if (!existing || !core) return;
    const next = core.markNoteDone(existing);
    if (!next.ok) return;
    const sb = getClient();
    if (!sb) return;
    const { data, error } = await sb
      .from('admin_notes')
      .update({ status: 'done', completed_at: next.note.completed_at })
      .eq('id', id)
      .select('id, title, body, remind_at, status, created_at, updated_at, completed_at')
      .single();
    if (error) {
      showError(error.message || 'לא ניתן לסמן כבוצע');
      return;
    }
    cache = cache.map((row) => (String(row.id) === String(id) ? data : row));
    renderList();
  }

  async function markOpen(id) {
    const sb = getClient();
    if (!sb) return;
    const { data, error } = await sb
      .from('admin_notes')
      .update({ status: 'open', completed_at: null })
      .eq('id', id)
      .select('id, title, body, remind_at, status, created_at, updated_at, completed_at')
      .single();
    if (error) {
      showError(error.message || 'לא ניתן להחזיר לפתוח');
      return;
    }
    cache = cache.map((row) => (String(row.id) === String(id) ? data : row));
    renderList();
  }

  async function deleteNote(id) {
    const ok = await showConfirm('למחוק את הפתק?', 'מחק');
    if (!ok) return;
    const sb = getClient();
    if (!sb) return;
    const { error } = await sb.from('admin_notes').delete().eq('id', id);
    if (error) {
      showError(error.message || 'המחיקה נכשלה');
      return;
    }
    cache = cache.filter((row) => String(row.id) !== String(id));
    renderList();
  }

  function onListClick(event) {
    const done = event.target.closest('[data-note-done]');
    if (done) {
      markDone(done.dataset.noteDone);
      return;
    }
    const reopen = event.target.closest('[data-note-reopen]');
    if (reopen) {
      markOpen(reopen.dataset.noteReopen);
      return;
    }
    const edit = event.target.closest('[data-note-edit]');
    if (edit) {
      const note = cache.find((row) => String(row.id) === String(edit.dataset.noteEdit));
      if (note) openModal(note);
      return;
    }
    const del = event.target.closest('[data-note-delete]');
    if (del) deleteNote(del.dataset.noteDelete);
  }

  function onFilterClick(event) {
    const btn = event.target.closest('[data-notes-filter]');
    if (!btn) return;
    setFilter(btn.dataset.notesFilter);
  }

  function bindOnce() {
    if (bound) return;
    bound = true;
    addBtn?.addEventListener('click', () => openModal(null));
    formEl?.addEventListener('submit', saveNote);
    cancelBtn?.addEventListener('click', closeModal);
    modalClose?.addEventListener('click', closeModal);
    modalBackdrop?.addEventListener('click', closeModal);
    listEl?.addEventListener('click', onListClick);
    filterEl?.addEventListener('click', onFilterClick);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal && !modal.hidden) closeModal();
    });
  }

  function start() {
    bindOnce();
    historyMode = false;
    historyHost = null;
    filter = core?.FILTER_OPEN || 'open';
    setFilter(filter);
    loadNotes();
  }

  function stop() {
    closeModal();
  }

  function mountHistory(hostEl) {
    if (!hostEl) return;
    bindOnce();
    historyMode = true;
    historyHost = hostEl;
    filter = core?.FILTER_ALL || 'all';
    hostEl.innerHTML = `
      <div class="notes-history">
        <p class="admin-error notes-error" role="alert" hidden></p>
        <div class="notes-toolbar">
          <div class="notes-filter" id="history-notes-filter" role="tablist" aria-label="סינון פתקים">
            <button type="button" class="admin-btn admin-btn--soft" data-notes-filter="open">פתוחים</button>
            <button type="button" class="admin-btn admin-btn--soft" data-notes-filter="done">בוצעו</button>
            <button type="button" class="admin-btn admin-btn--soft is-active" data-notes-filter="all">הכל</button>
          </div>
          <button type="button" class="admin-btn admin-btn--primary" id="history-notes-add">פתק חדש</button>
        </div>
        <div class="notes-list" id="history-notes-list"></div>
        <p class="tables-category__empty" id="history-notes-empty" hidden>אין פתקים</p>
      </div>
    `;
    hostEl.querySelector('#history-notes-filter')?.addEventListener('click', onFilterClick);
    hostEl.querySelector('#history-notes-list')?.addEventListener('click', onListClick);
    hostEl.querySelector('#history-notes-add')?.addEventListener('click', () => openModal(null));
    setFilter(filter);
    loadNotes();
  }

  global.LechaimAdminNotes = {
    start,
    stop,
    refresh: loadNotes,
    mountHistory,
  };
})(window);
