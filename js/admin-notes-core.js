/**
 * LECHAIM — Pure helpers for admin sticky notes (פתקים).
 * Browser + Node (tests). No DOM / network.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.LechaimAdminNotesCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const STATUS_OPEN = 'open';
  const STATUS_DONE = 'done';
  const FILTER_OPEN = 'open';
  const FILTER_DONE = 'done';
  const FILTER_ALL = 'all';

  function normalizeStatus(value) {
    return value === STATUS_DONE ? STATUS_DONE : STATUS_OPEN;
  }

  function normalizeFilter(value) {
    if (value === FILTER_OPEN || value === FILTER_DONE || value === FILTER_ALL) return value;
    return FILTER_ALL;
  }

  function trimText(value, max) {
    const text = String(value == null ? '' : value).trim();
    if (!max || text.length <= max) return text;
    return text.slice(0, max);
  }

  function parseRemindAt(value) {
    if (value == null || value === '') return null;
    const s = String(value).trim();
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  function validateNoteInput(input) {
    const title = trimText(input?.title, 120);
    const body = trimText(input?.body, 4000);
    const remindAt = parseRemindAt(input?.remind_at);
    if (!title) return { ok: false, error: 'חסרה כותרת' };
    if (!body) return { ok: false, error: 'חסר תוכן' };
    return {
      ok: true,
      note: {
        title,
        body,
        remind_at: remindAt,
      },
    };
  }

  function createNoteRecord(input, nowIso) {
    const checked = validateNoteInput(input);
    if (!checked.ok) return checked;
    const now = nowIso || new Date().toISOString();
    return {
      ok: true,
      note: {
        id: String(input?.id || ''),
        title: checked.note.title,
        body: checked.note.body,
        remind_at: checked.note.remind_at,
        status: STATUS_OPEN,
        created_at: now,
        updated_at: now,
        completed_at: null,
      },
    };
  }

  function applyNoteEdit(existing, input, nowIso) {
    if (!existing || typeof existing !== 'object') {
      return { ok: false, error: 'הפתק לא נמצא' };
    }
    const checked = validateNoteInput(input);
    if (!checked.ok) return checked;
    const now = nowIso || new Date().toISOString();
    return {
      ok: true,
      note: {
        ...existing,
        title: checked.note.title,
        body: checked.note.body,
        remind_at: checked.note.remind_at,
        updated_at: now,
      },
    };
  }

  function markNoteDone(existing, nowIso) {
    if (!existing || typeof existing !== 'object') {
      return { ok: false, error: 'הפתק לא נמצא' };
    }
    const now = nowIso || new Date().toISOString();
    return {
      ok: true,
      note: {
        ...existing,
        status: STATUS_DONE,
        completed_at: existing.completed_at || now,
        updated_at: now,
      },
    };
  }

  function markNoteOpen(existing, nowIso) {
    if (!existing || typeof existing !== 'object') {
      return { ok: false, error: 'הפתק לא נמצא' };
    }
    const now = nowIso || new Date().toISOString();
    return {
      ok: true,
      note: {
        ...existing,
        status: STATUS_OPEN,
        completed_at: null,
        updated_at: now,
      },
    };
  }

  function isReminderDue(note, now) {
    if (!note || normalizeStatus(note.status) !== STATUS_OPEN) return false;
    if (!note.remind_at) return false;
    const when = new Date(note.remind_at);
    if (Number.isNaN(when.getTime())) return false;
    const at = now instanceof Date ? now : new Date(now || Date.now());
    return when.getTime() <= at.getTime();
  }

  function filterNotes(notes, filter) {
    const list = Array.isArray(notes) ? notes.slice() : [];
    const mode = normalizeFilter(filter);
    const filtered = list.filter((note) => {
      const status = normalizeStatus(note?.status);
      if (mode === FILTER_OPEN) return status === STATUS_OPEN;
      if (mode === FILTER_DONE) return status === STATUS_DONE;
      return true;
    });
    filtered.sort((a, b) => {
      const aOpen = normalizeStatus(a?.status) === STATUS_OPEN ? 0 : 1;
      const bOpen = normalizeStatus(b?.status) === STATUS_OPEN ? 0 : 1;
      if (aOpen !== bOpen) return aOpen - bOpen;
      const aDue = isReminderDue(a) ? 0 : 1;
      const bDue = isReminderDue(b) ? 0 : 1;
      if (aDue !== bDue) return aDue - bDue;
      const aRemind = a?.remind_at ? String(a.remind_at) : '9999';
      const bRemind = b?.remind_at ? String(b.remind_at) : '9999';
      if (aRemind !== bRemind) return aRemind.localeCompare(bRemind);
      return String(b?.created_at || '').localeCompare(String(a?.created_at || ''));
    });
    return filtered;
  }

  function noteStaysInHistoryAfterDone(before, after) {
    if (!before || !after) return false;
    if (String(before.id) !== String(after.id)) return false;
    return normalizeStatus(after.status) === STATUS_DONE && after.completed_at != null;
  }

  function notesForScreen(notes) {
    return filterNotes(notes, FILTER_ALL);
  }

  function noteExcerpt(body, max) {
    const text = String(body == null ? '' : body).replace(/\s+/g, ' ').trim();
    const limit = Number(max) > 0 ? Number(max) : 96;
    if (text.length <= limit) return text;
    return `${text.slice(0, limit).trimEnd()}…`;
  }

  function noteCardModel(note) {
    const body = note?.body == null ? '' : String(note.body);
    return {
      id: note?.id == null ? '' : String(note.id),
      title: note?.title == null ? '' : String(note.title),
      excerpt: noteExcerpt(body),
      status: normalizeStatus(note?.status),
      created_at: note?.created_at || null,
      remind_at: note?.remind_at || null,
    };
  }

  function noteViewModel(note) {
    return {
      id: note?.id == null ? '' : String(note.id),
      title: note?.title == null ? '' : String(note.title),
      body: note?.body == null ? '' : String(note.body),
      status: normalizeStatus(note?.status),
      created_at: note?.created_at || null,
      remind_at: note?.remind_at || null,
    };
  }

  return {
    STATUS_OPEN,
    STATUS_DONE,
    FILTER_OPEN,
    FILTER_DONE,
    FILTER_ALL,
    normalizeStatus,
    normalizeFilter,
    validateNoteInput,
    createNoteRecord,
    applyNoteEdit,
    markNoteDone,
    markNoteOpen,
    isReminderDue,
    filterNotes,
    noteStaysInHistoryAfterDone,
    notesForScreen,
    noteExcerpt,
    noteCardModel,
    noteViewModel,
  };
});
