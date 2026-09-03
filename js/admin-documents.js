/**
 * LECHAIM — Admin business documents (phone scanner + desktop dashboard).
 * Isolated from orders / till / print / kitchen / staff payroll.
 */
(function (global) {
  'use strict';

  const TZ = 'Europe/Athens';
  const BUCKET = 'business-documents';
  const SIGNED_TTL_SEC = 90;
  const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
  const MAX_IMAGE_EDGE = 2000;
  const JPEG_QUALITY = 0.82;
  const ALLOWED_MIME = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
  };
  const TYPE_LABELS = {
    supplier_invoice: 'חשבונית ספק',
    receipt: 'קבלה',
    purchase_invoice: 'חשבונית רכישה',
    expense: 'הוצאה',
    other: 'אחר',
  };
  const STATUS_LABELS = {
    draft: 'ממתין לטיפול',
    saved: 'שמור',
    archived: 'ארכיון',
  };
  const CATEGORY_HINTS = [
    'מכולת',
    'בשר',
    'דגים',
    'ירקות',
    'שתייה',
    'חשמל',
    'מים',
    'גז',
    'ציוד',
    'ניקיון',
    'תחזוקה',
    'שכירות',
    'אחר',
  ];

  const viewEl = document.getElementById('admin-view-documents');
  const errorEl = document.getElementById('docs-error');
  const toastEl = document.getElementById('docs-toast');
  const lockBtn = document.getElementById('docs-lock-btn');
  const statsTotalEl = document.getElementById('docs-stat-total');
  const statsMonthCountEl = document.getElementById('docs-stat-month-count');
  const statsMonthSumEl = document.getElementById('docs-stat-month-sum');
  const dashCatsEl = document.getElementById('docs-dash-cats');
  const dashSuppliersEl = document.getElementById('docs-dash-suppliers');
  const dashRecentEl = document.getElementById('docs-dash-recent');
  const dashPendingEl = document.getElementById('docs-dash-pending');
  const dashPendingWrap = document.getElementById('docs-dash-pending-wrap');
  const archiveEl = document.getElementById('docs-archive');
  const listEl = document.getElementById('docs-list');
  const emptyEl = document.getElementById('docs-empty');
  const searchEl = document.getElementById('docs-search');
  const typeFilterEl = document.getElementById('docs-filter-type');
  const statusFilterEl = document.getElementById('docs-filter-status');
  const dateFromEl = document.getElementById('docs-filter-from');
  const dateToEl = document.getElementById('docs-filter-to');
  const cameraInput = document.getElementById('docs-camera-input');
  const fileInput = document.getElementById('docs-file-input');
  const dropEl = document.getElementById('docs-drop');
  const scanOverlay = document.getElementById('docs-scan-overlay');
  const previewStep = document.getElementById('docs-preview-step');
  const previewFrame = document.getElementById('docs-preview-frame');
  const retakeBtn = document.getElementById('docs-retake');
  const useBtn = document.getElementById('docs-use');
  const formStep = document.getElementById('docs-form-step');
  const formEl = document.getElementById('docs-meta-form');
  const formTitleEl = document.getElementById('docs-form-title');
  const formErrorEl = document.getElementById('docs-form-error');
  const formPreviewEl = document.getElementById('docs-form-preview');
  const vaultModal = document.getElementById('docs-vault-modal');
  const vaultForm = document.getElementById('docs-vault-form');
  const vaultCodeInput = document.getElementById('docs-vault-code');
  const vaultFormError = document.getElementById('docs-vault-form-error');
  const viewModal = document.getElementById('docs-view-modal');
  const viewTitleEl = document.getElementById('docs-view-title');
  const viewFrameEl = document.getElementById('docs-view-frame');
  const viewMetaEl = document.getElementById('docs-view-meta');

  let client = null;
  let cache = [];
  let unlocked = false;
  let bindDone = false;
  let busy = false;
  let realtimeChannel = null;
  let toastTimer = null;
  let archiveMode = false;
  let pendingFile = null;
  let pendingPreviewUrl = null;
  let captureSource = 'camera';
  let editingId = null;
  let vaultTrap = null;
  let scanTrap = null;
  let viewTrap = null;
  let searchTimer = null;

  function getConfig() {
    return global.LECHAIM_SUPABASE_CONFIG || {};
  }

  function getClient() {
    if (client) return client;
    if (typeof global.LechaimInventory?.getClient === 'function') {
      client = global.LechaimInventory.getClient();
      if (client) return client;
    }
    const { url, anonKey } = getConfig();
    if (!url || !anonKey || !global.supabase?.createClient) return null;
    client = global.supabase.createClient(url, anonKey, {
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

  function athensParts(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (Number.isNaN(d.getTime())) return null;
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const map = {};
    fmt.formatToParts(d).forEach((part) => {
      if (part.type !== 'literal') map[part.type] = part.value;
    });
    return {
      year: map.year,
      month: map.month,
      day: map.day,
      ymd: `${map.year}-${map.month}-${map.day}`,
      ym: `${map.year}-${map.month}`,
    };
  }

  function todayYmd() {
    return athensParts(new Date())?.ymd || '';
  }

  function currentYm() {
    return athensParts(new Date())?.ym || '';
  }

  function formatMoney(amount) {
    if (amount == null || amount === '') return '—';
    const n = Number(amount);
    if (!Number.isFinite(n)) return '—';
    return `€${n.toLocaleString('en-US', {
      minimumFractionDigits: n % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function formatDate(ymd) {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '—';
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  function showError(message) {
    if (!errorEl) return;
    if (!message) {
      errorEl.hidden = true;
      errorEl.textContent = '';
      return;
    }
    errorEl.hidden = false;
    errorEl.textContent = message;
  }

  function showToast(message) {
    if (!toastEl) return;
    window.clearTimeout(toastTimer);
    if (!message) {
      toastEl.hidden = true;
      toastEl.textContent = '';
      return;
    }
    toastEl.hidden = false;
    toastEl.textContent = message;
    toastTimer = window.setTimeout(() => {
      toastEl.hidden = true;
      toastEl.textContent = '';
    }, 2800);
  }

  function showFormError(el, message) {
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = message;
  }

  function isDesktop() {
    return window.matchMedia('(min-width: 860px)').matches;
  }

  function applyLayout() {
    if (!viewEl) return;
    viewEl.classList.toggle('is-archive', !isDesktop() || archiveMode);
  }

  function activateTrap(modal) {
    return window.LechaimFocusTrap?.activate?.(modal) || null;
  }

  function releaseTrap(release) {
    if (typeof release === 'function') release();
  }

  function openModal(modal) {
    if (!modal) return;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    const closed = (el) => !el || el.hidden;
    if (closed(vaultModal) && closed(scanOverlay) && closed(viewModal)) {
      document.body.classList.remove('admin-modal-open');
    }
  }

  async function confirmDanger(message) {
    if (typeof global.LechaimAdminTables?.showConfirmModal === 'function') {
      return global.LechaimAdminTables.showConfirmModal(message, { yesLabel: 'מחק' });
    }
    return window.confirm(String(message || ''));
  }

  function revokePreviewUrl() {
    if (pendingPreviewUrl) {
      URL.revokeObjectURL(pendingPreviewUrl);
      pendingPreviewUrl = null;
    }
  }

  function safeFilename(name, mime) {
    const raw = String(name || 'document').split(/[/\\]/).pop() || 'document';
    const cleaned = raw
      .replace(/[^\w.\-()+]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^\.+/, '')
      .slice(0, 80);
    const ext = ALLOWED_MIME[mime] || 'bin';
    const base = cleaned.replace(/\.[^.]+$/, '') || 'document';
    return `${base}.${ext}`;
  }

  function guessMime(file) {
    const type = String(file?.type || '').toLowerCase();
    if (ALLOWED_MIME[type]) return type;
    const name = String(file?.name || '').toLowerCase();
    if (name.endsWith('.pdf')) return 'application/pdf';
    if (name.endsWith('.png')) return 'image/png';
    if (name.endsWith('.webp')) return 'image/webp';
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
    return '';
  }

  function blobToFile(blob, filename, mime) {
    return new File([blob], filename, { type: mime, lastModified: Date.now() });
  }

  async function compressImage(file, mime) {
    if (mime === 'application/pdf') return file;
    if (typeof createImageBitmap !== 'function') return file;
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch (_) {
      return file;
    }
    try {
      let { width, height } = bitmap;
      if (!width || !height) return file;
      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, width, height);
      const outMime = mime === 'image/png' && file.size < 900000 ? 'image/png' : 'image/jpeg';
      const quality = outMime === 'image/jpeg' ? JPEG_QUALITY : undefined;
      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, outMime, quality);
      });
      if (!blob) return file;
      const name = safeFilename(file.name, outMime);
      return blobToFile(blob, name, outMime);
    } finally {
      bitmap.close?.();
    }
  }

  async function prepareUploadFile(file) {
    const guessed = guessMime(file);
    if (!file) throw new Error('לא נבחר קובץ');
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('הקובץ גדול מדי (מקסימום 15MB)');
    let prepared = file;
    if (guessed !== 'application/pdf') {
      prepared = await compressImage(file, guessed || 'image/jpeg');
    }
    const mime = guessMime(prepared) || (prepared.type === 'image/jpeg' ? 'image/jpeg' : '');
    if (!ALLOWED_MIME[mime]) {
      throw new Error('נתמכים רק JPEG, PNG, WebP או PDF');
    }
    if (prepared.size > MAX_UPLOAD_BYTES) {
      throw new Error('הקובץ עדיין גדול מדי אחרי כיווץ');
    }
    return prepared;
  }

  function renderPreviewInto(target, file, url) {
    if (!target) return;
    target.innerHTML = '';
    const mime = guessMime(file) || file?.type;
    if (mime === 'application/pdf') {
      const iframe = document.createElement('iframe');
      iframe.className = 'docs-preview__pdf';
      iframe.title = 'תצוגת PDF';
      iframe.src = url;
      target.appendChild(iframe);
      return;
    }
    const img = document.createElement('img');
    img.className = 'docs-preview__img';
    img.alt = 'תצוגת מסמך';
    img.src = url;
    target.appendChild(img);
  }

  function setScanStep(step) {
    if (previewStep) previewStep.hidden = step !== 'preview';
    if (formStep) formStep.hidden = step !== 'form';
  }

  function resetForm() {
    if (!formEl) return;
    formEl.reset();
    const typeEl = document.getElementById('docs-field-type');
    const dateEl = document.getElementById('docs-field-date');
    const currencyEl = document.getElementById('docs-field-currency');
    if (typeEl) typeEl.value = 'supplier_invoice';
    if (dateEl) dateEl.value = todayYmd();
    if (currencyEl) currencyEl.value = 'EUR';
    showFormError(formErrorEl, '');
  }

  function fillForm(row) {
    resetForm();
    if (!row) return;
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value == null ? '' : String(value);
    };
    set('docs-field-type', row.document_type || 'other');
    set('docs-field-supplier', row.supplier_name || '');
    set('docs-field-date', row.document_date || '');
    set('docs-field-before-vat', row.amount_before_vat ?? '');
    set('docs-field-vat', row.vat_amount ?? '');
    set('docs-field-total', row.amount_total ?? '');
    set('docs-field-number', row.document_number || '');
    set('docs-field-category', row.category || '');
    set('docs-field-notes', row.notes || '');
    set('docs-field-currency', row.currency || 'EUR');
  }

  function readForm() {
    const num = (id) => {
      const raw = String(document.getElementById(id)?.value || '').trim();
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };
    const text = (id) => String(document.getElementById(id)?.value || '').trim();
    const supplier = text('docs-field-supplier');
    const date = text('docs-field-date');
    const total = num('docs-field-total');
    const status = supplier && date && total != null ? 'saved' : 'draft';
    return {
      document_type: text('docs-field-type') || 'other',
      supplier_name: supplier,
      document_date: date || null,
      amount_before_vat: num('docs-field-before-vat'),
      vat_amount: num('docs-field-vat'),
      amount_total: total,
      document_number: text('docs-field-number'),
      category: text('docs-field-category'),
      notes: text('docs-field-notes'),
      currency: 'EUR',
      status,
    };
  }

  function maybeFillTotal() {
    const before = Number(document.getElementById('docs-field-before-vat')?.value);
    const vat = Number(document.getElementById('docs-field-vat')?.value);
    const totalEl = document.getElementById('docs-field-total');
    if (!totalEl) return;
    if (String(totalEl.value || '').trim()) return;
    if (!Number.isFinite(before) || !Number.isFinite(vat)) return;
    if (!before && !vat) return;
    totalEl.value = String(Math.round((before + vat) * 100) / 100);
  }

  function closeScanOverlay() {
    revokePreviewUrl();
    pendingFile = null;
    editingId = null;
    if (cameraInput) cameraInput.value = '';
    if (fileInput) fileInput.value = '';
    if (formPreviewEl) formPreviewEl.innerHTML = '';
    if (previewFrame) previewFrame.innerHTML = '';
    releaseTrap(scanTrap);
    scanTrap = null;
    closeModal(scanOverlay);
  }

  function openScanOverlay() {
    openModal(scanOverlay);
    releaseTrap(scanTrap);
    scanTrap = activateTrap(scanOverlay);
  }

  function showPreview(file) {
    revokePreviewUrl();
    pendingFile = file;
    pendingPreviewUrl = URL.createObjectURL(file);
    const mime = guessMime(file);
    renderPreviewInto(previewFrame, file, pendingPreviewUrl);
    if (retakeBtn) {
      retakeBtn.textContent = mime === 'application/pdf' || captureSource === 'file'
        ? '🔄 בחר קובץ אחר'
        : '🔄 צלם מחדש';
    }
    if (useBtn) {
      useBtn.textContent = mime === 'application/pdf' ? '✓ המשך' : '✓ השתמש בתמונה';
    }
    setScanStep('preview');
    openScanOverlay();
  }

  function goToForm() {
    if (formTitleEl) {
      formTitleEl.textContent = editingId ? 'עריכת פרטי מסמך' : 'פרטי המסמך';
    }
    if (formPreviewEl && pendingFile && pendingPreviewUrl) {
      renderPreviewInto(formPreviewEl, pendingFile, pendingPreviewUrl);
    }
    setScanStep('form');
  }

  function openVaultModal() {
    showFormError(vaultFormError, '');
    openModal(vaultModal);
    releaseTrap(vaultTrap);
    vaultTrap = activateTrap(vaultModal);
    window.setTimeout(() => vaultCodeInput?.focus(), 50);
  }

  function closeVaultModal() {
    releaseTrap(vaultTrap);
    vaultTrap = null;
    if (vaultCodeInput) vaultCodeInput.value = '';
    closeModal(vaultModal);
  }

  function closeViewModal() {
    releaseTrap(viewTrap);
    viewTrap = null;
    if (viewFrameEl) viewFrameEl.innerHTML = '';
    closeModal(viewModal);
  }

  function upsertCache(row) {
    if (!row?.id) return;
    const idx = cache.findIndex((item) => item.id === row.id);
    if (idx >= 0) cache[idx] = { ...cache[idx], ...row };
    else cache.unshift(row);
    cache.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }

  function removeFromCache(id) {
    cache = cache.filter((item) => item.id !== id);
  }

  function visibleRows() {
    const q = String(searchEl?.value || '').trim().toLowerCase();
    const type = String(typeFilterEl?.value || 'all');
    const status = String(statusFilterEl?.value || 'all');
    const from = String(dateFromEl?.value || '');
    const to = String(dateToEl?.value || '');
    return cache.filter((row) => {
      if (row.status === 'archived' && status !== 'archived') return false;
      if (type !== 'all' && row.document_type !== type) return false;
      if (status !== 'all' && row.status !== status) return false;
      const date = String(row.document_date || '').slice(0, 10);
      if (from && date && date < from) return false;
      if (to && date && date > to) return false;
      if (from && !date) return false;
      if (!q) return true;
      const hay = [
        row.supplier_name,
        row.document_number,
        row.category,
        row.notes,
        TYPE_LABELS[row.document_type],
        row.original_filename,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  function renderStats() {
    const ym = currentYm();
    const active = cache.filter((row) => row.status !== 'archived');
    const monthRows = active.filter((row) => String(row.document_date || '').startsWith(ym));
    const monthSum = monthRows.reduce((sum, row) => sum + (Number(row.amount_total) || 0), 0);
    if (statsTotalEl) statsTotalEl.textContent = String(active.length);
    if (statsMonthCountEl) statsMonthCountEl.textContent = String(monthRows.length);
    if (statsMonthSumEl) statsMonthSumEl.textContent = formatMoney(monthSum);
  }

  function renderBreakdown(target, rows, key, emptyText) {
    if (!target) return;
    const map = new Map();
    rows.forEach((row) => {
      const label = String(row[key] || '').trim() || 'ללא';
      const cur = map.get(label) || { count: 0, sum: 0 };
      cur.count += 1;
      cur.sum += Number(row.amount_total) || 0;
      map.set(label, cur);
    });
    const list = [...map.entries()]
      .sort((a, b) => b[1].sum - a[1].sum)
      .slice(0, 8);
    if (!list.length) {
      target.innerHTML = `<p class="docs-dash__empty">${escapeHtml(emptyText)}</p>`;
      return;
    }
    target.innerHTML = list.map(([label, val]) => `
      <div class="docs-break__row">
        <span class="docs-break__name">${escapeHtml(label)}</span>
        <span class="docs-break__meta">${val.count} · ${escapeHtml(formatMoney(val.sum))}</span>
      </div>
    `).join('');
  }

  function miniCard(row) {
    return `
      <button type="button" class="docs-mini" data-docs-open="${escapeHtml(row.id)}">
        <span class="docs-mini__type">${escapeHtml(TYPE_LABELS[row.document_type] || row.document_type)}</span>
        <strong class="docs-mini__name">${escapeHtml(row.supplier_name || 'ללא ספק')}</strong>
        <span class="docs-mini__meta">${escapeHtml(formatDate(row.document_date))} · ${escapeHtml(formatMoney(row.amount_total))}</span>
      </button>
    `;
  }

  function renderDashboard() {
    const ym = currentYm();
    const active = cache.filter((row) => row.status !== 'archived');
    const monthRows = active.filter((row) => String(row.document_date || '').startsWith(ym));
    const pending = active.filter((row) => row.status === 'draft');
    renderBreakdown(dashCatsEl, monthRows, 'category', 'אין הוצאות לפי קטגוריה החודש');
    renderBreakdown(dashSuppliersEl, monthRows, 'supplier_name', 'אין הוצאות לפי ספק החודש');
    if (dashRecentEl) {
      const recent = active.slice(0, 6);
      dashRecentEl.innerHTML = recent.length
        ? recent.map(miniCard).join('')
        : '<p class="docs-dash__empty">אין מסמכים עדיין</p>';
    }
    if (dashPendingWrap) dashPendingWrap.hidden = pending.length === 0;
    if (dashPendingEl) {
      dashPendingEl.innerHTML = pending.slice(0, 8).map(miniCard).join('');
    }
  }

  function renderList() {
    const rows = visibleRows();
    if (emptyEl) {
      emptyEl.hidden = rows.length > 0;
      emptyEl.textContent = cache.length ? 'אין מסמכים לפי הסינון' : 'אין מסמכים עדיין — סרקו חשבונית כדי להתחיל';
    }
    if (!listEl) return;
    listEl.innerHTML = rows.map((row) => `
      <article class="docs-card" data-docs-id="${escapeHtml(row.id)}">
        <header class="docs-card__top">
          <span class="docs-card__type">${escapeHtml(TYPE_LABELS[row.document_type] || row.document_type)}</span>
          <span class="docs-card__status docs-card__status--${escapeHtml(row.status)}">${escapeHtml(STATUS_LABELS[row.status] || row.status)}</span>
        </header>
        <h3 class="docs-card__title">${escapeHtml(row.supplier_name || 'ללא ספק')}</h3>
        <p class="docs-card__amount">${escapeHtml(formatMoney(row.amount_total))}</p>
        <dl class="docs-card__meta">
          <div><dt>תאריך</dt><dd>${escapeHtml(formatDate(row.document_date))}</dd></div>
          <div><dt>קטגוריה</dt><dd>${escapeHtml(row.category || '—')}</dd></div>
          <div><dt>מספר</dt><dd>${escapeHtml(row.document_number || '—')}</dd></div>
        </dl>
        <div class="docs-card__actions">
          <button type="button" class="admin-btn admin-btn--soft" data-docs-open="${escapeHtml(row.id)}">צפייה</button>
          <button type="button" class="admin-btn admin-btn--ghost" data-docs-edit="${escapeHtml(row.id)}">עריכה</button>
          <button type="button" class="admin-btn admin-btn--ghost" data-docs-download="${escapeHtml(row.id)}">הורדה</button>
          <button type="button" class="admin-btn admin-btn--danger" data-docs-delete="${escapeHtml(row.id)}">מחיקה</button>
        </div>
      </article>
    `).join('');
  }

  function renderAll() {
    renderStats();
    renderDashboard();
    renderList();
  }

  async function loadRows() {
    const sb = getClient();
    if (!sb) throw new Error('Supabase לא מחובר');
    const { data, error } = await sb
      .from('business_documents')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) throw error;
    cache = Array.isArray(data) ? data : [];
    renderAll();
  }

  async function signedUrl(path, downloadName) {
    const sb = getClient();
    if (!sb) throw new Error('Supabase לא מחובר');
    const options = downloadName ? { download: downloadName } : undefined;
    const { data, error } = await sb.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_TTL_SEC, options);
    if (error) throw error;
    const url = data?.signedUrl;
    if (!url) throw new Error('לא ניתן ליצור קישור מאובטח');
    return url;
  }

  async function openDocument(id) {
    const row = cache.find((item) => item.id === id);
    if (!row) return;
    showError('');
    try {
      const url = await signedUrl(row.storage_path);
      if (viewTitleEl) {
        viewTitleEl.textContent = row.supplier_name || TYPE_LABELS[row.document_type] || 'מסמך';
      }
      if (viewMetaEl) {
        viewMetaEl.textContent = [
          TYPE_LABELS[row.document_type],
          formatDate(row.document_date),
          formatMoney(row.amount_total),
          row.document_number,
        ].filter(Boolean).join(' · ');
      }
      if (viewFrameEl) {
        viewFrameEl.innerHTML = '';
        if (row.mime_type === 'application/pdf') {
          const iframe = document.createElement('iframe');
          iframe.className = 'docs-preview__pdf';
          iframe.title = 'תצוגת PDF';
          iframe.src = url;
          viewFrameEl.appendChild(iframe);
        } else {
          const img = document.createElement('img');
          img.className = 'docs-preview__img';
          img.alt = row.original_filename || 'מסמך';
          img.src = url;
          viewFrameEl.appendChild(img);
        }
      }
      viewModal.dataset.docId = id;
      openModal(viewModal);
      releaseTrap(viewTrap);
      viewTrap = activateTrap(viewModal);
    } catch (err) {
      showError(err?.message || 'לא ניתן לפתוח את המסמך');
    }
  }

  async function downloadDocument(id) {
    const row = cache.find((item) => item.id === id);
    if (!row) return;
    try {
      const url = await signedUrl(row.storage_path, row.original_filename || 'document');
      const a = document.createElement('a');
      a.href = url;
      a.rel = 'noopener';
      a.download = row.original_filename || 'document';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      showError(err?.message || 'ההורדה נכשלה');
    }
  }

  async function editDocument(id) {
    const row = cache.find((item) => item.id === id);
    if (!row) return;
    editingId = id;
    pendingFile = null;
    revokePreviewUrl();
    fillForm(row);
    if (formPreviewEl) {
      formPreviewEl.innerHTML = '<p class="docs-form__hint">הקובץ הקיים נשמר. כאן עורכים רק את הפרטים.</p>';
    }
    setScanStep('form');
    openScanOverlay();
  }

  async function deleteDocument(id) {
    const row = cache.find((item) => item.id === id);
    const label = row?.supplier_name || row?.original_filename || 'המסמך';
    const ok = await confirmDanger(`למחוק את המסמך של ${label}? הקובץ יימחק לצמיתות.`);
    if (!ok) return;
    const sb = getClient();
    if (!sb) {
      showError('Supabase לא מחובר');
      return;
    }
    try {
      const { data, error } = await sb.rpc('delete_business_document', { p_id: id });
      if (error) throw error;
      if (data && data.ok === false) {
        throw new Error(data.error === 'not_unlocked' ? 'אין הרשאת מסמכים' : (data.error || 'המחיקה נכשלה'));
      }
      removeFromCache(id);
      renderAll();
      closeViewModal();
      showToast('המסמך נמחק');
    } catch (err) {
      showError(err?.message || 'המחיקה נכשלה');
    }
  }

  async function saveDocument(event) {
    event.preventDefault();
    if (busy) return;
    const meta = readForm();
    if (!TYPE_LABELS[meta.document_type]) {
      showFormError(formErrorEl, 'בחרו סוג מסמך');
      return;
    }
    const sb = getClient();
    if (!sb) {
      showFormError(formErrorEl, 'Supabase לא מחובר');
      return;
    }
    busy = true;
    showFormError(formErrorEl, '');
    try {
      if (editingId) {
        const { data, error } = await sb
          .from('business_documents')
          .update(meta)
          .eq('id', editingId)
          .select('*')
          .single();
        if (error) throw error;
        upsertCache(data);
        renderAll();
        closeScanOverlay();
        showToast('הפרטים עודכנו');
        return;
      }
      if (!pendingFile) {
        showFormError(formErrorEl, 'אין קובץ לשמירה');
        return;
      }
      const prepared = await prepareUploadFile(pendingFile);
      const mime = guessMime(prepared);
      const id = global.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const parts = athensParts(new Date()) || { year: '1970', month: '01' };
      const filename = safeFilename(prepared.name || pendingFile.name, mime);
      const path = `${parts.year}/${parts.month}/${id}/${filename}`;
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, prepared, {
        contentType: mime,
        upsert: false,
      });
      if (upErr) throw upErr;
      const row = {
        id,
        storage_bucket: BUCKET,
        storage_path: path,
        original_filename: filename,
        mime_type: mime,
        file_size_bytes: prepared.size,
        ocr_status: 'none',
        ocr_raw: null,
        ...meta,
      };
      const { data, error } = await sb.from('business_documents').insert(row).select('*').single();
      if (error) {
        try { await sb.storage.from(BUCKET).remove([path]); } catch (_) { /* keep going */ }
        throw error;
      }
      upsertCache(data);
      renderAll();
      closeScanOverlay();
      showToast('✓ המסמך נשמר');
    } catch (err) {
      console.error('[documents] save', err);
      showFormError(formErrorEl, err?.message || 'השמירה נכשלה');
    } finally {
      busy = false;
    }
  }

  async function handlePickedFile(file, source) {
    captureSource = source;
    try {
      const prepared = await prepareUploadFile(file);
      editingId = null;
      resetForm();
      showPreview(prepared);
    } catch (err) {
      showError(err?.message || 'לא ניתן להשתמש בקובץ');
    }
  }

  function startRealtime() {
    stopRealtime();
    const sb = getClient();
    if (!sb?.channel || !unlocked) return;
    realtimeChannel = sb
      .channel('admin-business-documents')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'business_documents' },
        (payload) => {
          if (!unlocked) return;
          const event = payload?.eventType;
          if (event === 'INSERT' && payload.new) upsertCache(payload.new);
          else if (event === 'UPDATE' && payload.new) upsertCache(payload.new);
          else if (event === 'DELETE' && payload.old?.id) removeFromCache(payload.old.id);
          else {
            loadRows().catch(() => {});
            return;
          }
          renderAll();
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

  function clearSensitive() {
    cache = [];
    unlocked = false;
    archiveMode = false;
    closeScanOverlay();
    closeViewModal();
    closeVaultModal();
    stopRealtime();
    renderAll();
    applyLayout();
  }

  async function lockVault() {
    clearSensitive();
    const sb = getClient();
    if (!sb) return;
    try {
      await sb.rpc('documents_vault_lock');
    } catch (err) {
      console.error('[documents] lock', err);
    }
  }

  async function submitVault(event) {
    event.preventDefault();
    if (busy) return;
    const code = vaultCodeInput?.value || '';
    if (!String(code).trim()) {
      showFormError(vaultFormError, 'הזינו קוד גישה');
      return;
    }
    const sb = getClient();
    if (!sb) {
      showFormError(vaultFormError, 'Supabase לא מחובר');
      return;
    }
    busy = true;
    showFormError(vaultFormError, '');
    try {
      const { data, error } = await sb.rpc('documents_vault_unlock', { p_code: code });
      if (vaultCodeInput) vaultCodeInput.value = '';
      if (error) throw error;
      const res = data || {};
      if (!res.ok) {
        if (res.error === 'invalid_code') showFormError(vaultFormError, 'קוד שגוי');
        else if (res.error === 'code_not_set') showFormError(vaultFormError, 'קוד המסמכים עדיין לא הוגדר ב-Supabase');
        else if (res.error === 'not_authenticated') showFormError(vaultFormError, 'יש להתחבר לאדמין');
        else showFormError(vaultFormError, res.error || 'שגיאה');
        return;
      }
      unlocked = true;
      closeVaultModal();
      await loadRows();
      startRealtime();
    } catch (err) {
      console.error('[documents] unlock', err);
      showFormError(vaultFormError, err?.message || 'הכניסה נכשלה');
    } finally {
      busy = false;
    }
  }

  function bindOnce() {
    if (bindDone) return;
    bindDone = true;

    const hints = document.getElementById('docs-category-hints');
    if (hints && !hints.childElementCount) {
      CATEGORY_HINTS.forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        hints.appendChild(opt);
      });
    }

    vaultForm?.addEventListener('submit', (event) => {
      submitVault(event).catch(() => {});
    });
    document.getElementById('docs-vault-cancel')?.addEventListener('click', () => {
      closeVaultModal();
    });
    document.getElementById('docs-vault-backdrop')?.addEventListener('click', () => {
      closeVaultModal();
    });

    lockBtn?.addEventListener('click', () => {
      lockVault().then(() => openVaultModal());
    });

    viewEl?.addEventListener('click', (event) => {
      if (event.target.closest('#docs-lock-btn')) return;
      if (!unlocked) {
        openVaultModal();
        return;
      }
      const scan = event.target.closest('[data-docs-scan]');
      if (scan) {
        cameraInput?.click();
        return;
      }
      const pick = event.target.closest('[data-docs-pick]');
      if (pick) {
        fileInput?.click();
        return;
      }
      const archiveBtn = event.target.closest('[data-docs-archive]');
      if (archiveBtn) {
        archiveMode = true;
        applyLayout();
        return;
      }
      const dashBtn = event.target.closest('[data-docs-dashboard]');
      if (dashBtn) {
        archiveMode = false;
        applyLayout();
        return;
      }
      const openId = event.target.closest('[data-docs-open]')?.getAttribute('data-docs-open');
      if (openId) {
        openDocument(openId).catch(() => {});
        return;
      }
      const editId = event.target.closest('[data-docs-edit]')?.getAttribute('data-docs-edit');
      if (editId) {
        editDocument(editId).catch(() => {});
        return;
      }
      const dlId = event.target.closest('[data-docs-download]')?.getAttribute('data-docs-download');
      if (dlId) {
        downloadDocument(dlId).catch(() => {});
        return;
      }
      const delId = event.target.closest('[data-docs-delete]')?.getAttribute('data-docs-delete');
      if (delId) {
        deleteDocument(delId).catch(() => {});
      }
    });

    cameraInput?.addEventListener('change', () => {
      const file = cameraInput.files?.[0];
      if (file) handlePickedFile(file, 'camera').catch(() => {});
      cameraInput.value = '';
    });
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) handlePickedFile(file, 'file').catch(() => {});
      fileInput.value = '';
    });

    ['dragenter', 'dragover'].forEach((name) => {
      dropEl?.addEventListener(name, (event) => {
        event.preventDefault();
        dropEl.classList.add('is-over');
      });
    });
    ['dragleave', 'drop'].forEach((name) => {
      dropEl?.addEventListener(name, (event) => {
        event.preventDefault();
        dropEl.classList.remove('is-over');
      });
    });
    dropEl?.addEventListener('drop', (event) => {
      const file = event.dataTransfer?.files?.[0];
      if (file) handlePickedFile(file, 'file').catch(() => {});
    });

    retakeBtn?.addEventListener('click', () => {
      if (captureSource === 'file') fileInput?.click();
      else cameraInput?.click();
    });
    useBtn?.addEventListener('click', () => {
      goToForm();
    });
    document.getElementById('docs-scan-cancel')?.addEventListener('click', closeScanOverlay);
    document.getElementById('docs-scan-backdrop')?.addEventListener('click', closeScanOverlay);
    document.getElementById('docs-form-cancel')?.addEventListener('click', closeScanOverlay);
    formEl?.addEventListener('submit', (event) => {
      saveDocument(event).catch(() => {});
    });

    document.getElementById('docs-view-close')?.addEventListener('click', closeViewModal);
    document.getElementById('docs-view-backdrop')?.addEventListener('click', closeViewModal);
    document.getElementById('docs-view-download')?.addEventListener('click', () => {
      const id = viewModal?.dataset.docId;
      if (id) downloadDocument(id).catch(() => {});
    });
    document.getElementById('docs-view-edit')?.addEventListener('click', () => {
      const id = viewModal?.dataset.docId;
      closeViewModal();
      if (id) editDocument(id).catch(() => {});
    });
    document.getElementById('docs-view-delete')?.addEventListener('click', () => {
      const id = viewModal?.dataset.docId;
      if (id) deleteDocument(id).catch(() => {});
    });

    document.getElementById('docs-field-before-vat')?.addEventListener('input', maybeFillTotal);
    document.getElementById('docs-field-vat')?.addEventListener('input', maybeFillTotal);

    searchEl?.addEventListener('input', () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(renderList, 120);
    });
    typeFilterEl?.addEventListener('change', renderList);
    statusFilterEl?.addEventListener('change', renderList);
    dateFromEl?.addEventListener('change', renderList);
    dateToEl?.addEventListener('change', renderList);

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (viewModal && !viewModal.hidden) {
        closeViewModal();
        return;
      }
      if (scanOverlay && !scanOverlay.hidden) {
        closeScanOverlay();
        return;
      }
      if (vaultModal && !vaultModal.hidden) closeVaultModal();
    });

    window.addEventListener('resize', applyLayout);
  }

  async function start() {
    bindOnce();
    applyLayout();
    showError('');
    if (!unlocked) {
      openVaultModal();
      return;
    }
    try {
      await loadRows();
      startRealtime();
    } catch (err) {
      showError(err?.message || 'טעינת המסמכים נכשלה');
    }
  }

  function stop() {
    closeScanOverlay();
    closeViewModal();
  }

  global.LechaimAdminDocuments = {
    start,
    stop,
    lockVault,
  };
})(window);
