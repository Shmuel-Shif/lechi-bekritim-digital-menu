/**
 * LECHAIM — Documents: phone scanner app + desktop dashboard.
 * Isolated from orders / till / print / kitchen / staff payroll.
 */
(function (global) {
  'use strict';

  const TZ = 'Europe/Athens';
  const BUCKET = 'business-documents';
  const SIGNED_TTL_SEC = 90;
  const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
  const MAX_IMAGE_EDGE = 2400;
  const JPEG_QUALITY = 0.88;
  const ALLOWED_MIME = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
  };
  const HE_MONTHS = [
    'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
  ];
  const DEFAULT_SUPPLIERS = [
    'ירקות',
    'דה מארט',
    'שתייה',
    'דגים',
    'לחם',
    'ביצים',
    'חד פעמי',
    'חשבוניות קטנות',
    'חשבוניות כלליות',
  ];
  const SUPPLIER_COLORS = {
    'ירקות': '#3f8f5b',
    'דה מארט': '#3a6ea8',
    'שתייה': '#2a9b8a',
    'דגים': '#2c4a7c',
    'לחם': '#c4892d',
    'ביצים': '#d4a017',
    'חד פעמי': '#6b7c8a',
    'חשבוניות קטנות': '#8a5a8c',
    'חשבוניות כלליות': '#c45a3d',
  };
  const EXTRA_COLORS = ['#8d6e4c', '#5a7d6a', '#9a5b6a', '#4a6d8c', '#7d6b3a', '#5c6b9a'];
  const TILL_COUNT_FROM_YMD = '2026-08-10';

  const viewEl = document.getElementById('admin-view-documents');
  const errorEl = document.getElementById('docs-error');
  const toastEl = document.getElementById('docs-toast');
  const cameraInput = document.getElementById('docs-camera-input');
  const fileInput = document.getElementById('docs-file-input');
  const scanOverlay = document.getElementById('docs-scan-overlay');
  const previewStep = document.getElementById('docs-preview-step');
  const previewFrame = document.getElementById('docs-preview-frame');
  const retakeBtn = document.getElementById('docs-retake');
  const useBtn = document.getElementById('docs-use');
  const formStep = document.getElementById('docs-form-step');
  const formEl = document.getElementById('docs-meta-form');
  const formTitleEl = document.getElementById('docs-form-title');
  const formErrorEl = document.getElementById('docs-form-error');
  const vaultModal = document.getElementById('docs-vault-modal');
  const vaultForm = document.getElementById('docs-vault-form');
  const vaultCodeInput = document.getElementById('docs-vault-code');
  const vaultFormError = document.getElementById('docs-vault-form-error');
  const viewModal = document.getElementById('docs-view-modal');
  const viewTitleEl = document.getElementById('docs-view-title');
  const viewFrameEl = document.getElementById('docs-view-frame');
  const viewMetaEl = document.getElementById('docs-view-meta');
  const pickModal = document.getElementById('docs-pick-modal');
  const pickListEl = document.getElementById('docs-pick-list');
  const newModal = document.getElementById('docs-new-modal');
  const newForm = document.getElementById('docs-new-form');
  const newNameInput = document.getElementById('docs-new-name');
  const newFormError = document.getElementById('docs-new-form-error');
  const deleteModal = document.getElementById('docs-delete-modal');
  const deleteTextEl = document.getElementById('docs-delete-text');

  let client = null;
  let cache = [];
  let unlocked = false;
  let bindDone = false;
  let busy = false;
  let realtimeChannel = null;
  let toastTimer = null;
  let pendingFile = null;
  let pendingPreviewUrl = null;
  let captureSource = 'camera';
  let editingId = null;
  let vaultTrap = null;
  let scanTrap = null;
  let viewTrap = null;
  let pickTrap = null;
  let newTrap = null;
  let deleteTrap = null;
  let deleteResolver = null;
  let docsPane = 'list';
  let activeSupplier = '';
  let scanSupplier = '';
  let pendingSuppliers = [];
  let newThenScan = false;
  let moveDocId = null;
  let selectedYm = '';
  let incomeByYm = {};
  let incomeBusyYm = '';
  const openMonths = new Set();

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

  function monthLabel(ym) {
    const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
    if (!m) return ym || '';
    return `${HE_MONTHS[Number(m[2]) - 1] || m[2]} ${m[1]}`;
  }

  function shiftYm(ym, delta) {
    const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
    if (!m) return currentYm();
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
  }

  function activeYm() {
    return selectedYm || currentYm();
  }

  function supplierColor(name) {
    const key = supplierKey(name);
    if (SUPPLIER_COLORS[key]) return SUPPLIER_COLORS[key];
    let h = 0;
    for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return EXTRA_COLORS[h % EXTRA_COLORS.length];
  }

  function colorStyle(name) {
    return `style="--docs-color:${supplierColor(name)}"`;
  }

  function formatMoney(amount) {
    if (amount == null || amount === '') return '€0';
    const n = Number(amount);
    if (!Number.isFinite(n)) return '€0';
    return `€${n.toLocaleString('en-US', {
      minimumFractionDigits: n % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function formatDate(ymd) {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '—';
    return `${m[3]}/${m[2]}`;
  }

  function formatDateFull(ymd) {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '—';
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  function supplierKey(name) {
    return String(name || '').trim();
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
    }, 2200);
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
    viewEl.classList.toggle('is-desktop', isDesktop());
    viewEl.classList.toggle('is-folder', docsPane === 'folder');
    viewEl.classList.toggle('is-report', docsPane === 'report');
    const listPane = document.getElementById('docs-app-list');
    const folderPane = document.getElementById('docs-app-folder');
    const reportPane = document.getElementById('docs-month-report');
    if (listPane) listPane.hidden = docsPane !== 'list';
    if (folderPane) folderPane.hidden = docsPane !== 'folder';
    if (reportPane) reportPane.hidden = docsPane !== 'report';
  }

  function activateTrap(modal) {
    return window.LechaimFocusTrap?.activate?.(modal) || null;
  }

  function releaseTrap(release) {
    if (typeof release === 'function') release();
  }

  function allDocsModals() {
    return [vaultModal, scanOverlay, viewModal, pickModal, newModal, deleteModal];
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
    if (allDocsModals().every((el) => !el || el.hidden)) {
      document.body.classList.remove('admin-modal-open');
    }
  }

  function closeDeleteModal(ok) {
    releaseTrap(deleteTrap);
    deleteTrap = null;
    closeModal(deleteModal);
    if (typeof deleteResolver === 'function') {
      deleteResolver(Boolean(ok));
      deleteResolver = null;
    }
  }

  function askDeleteConfirm(row) {
    const label = formatDateFull(row?.document_date);
    const amount = formatMoney(row?.amount_total);
    if (deleteTextEl) {
      deleteTextEl.textContent = label
        ? `אתה בטוח? למחוק את החשבונית מ-${label} (${amount})? הקובץ יימחק לצמיתות.`
        : 'אתה בטוח? החשבונית תימחק לצמיתות.';
    }
    openModal(deleteModal);
    releaseTrap(deleteTrap);
    deleteTrap = activateTrap(deleteModal);
    window.setTimeout(() => document.getElementById('docs-delete-cancel')?.focus(), 50);
    return new Promise((resolve) => {
      if (typeof deleteResolver === 'function') deleteResolver(false);
      deleteResolver = resolve;
    });
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
      const outMime = 'image/jpeg';
      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, outMime, JPEG_QUALITY);
      });
      if (!blob) return file;
      return blobToFile(blob, safeFilename(file.name, outMime), outMime);
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
    if (!ALLOWED_MIME[mime]) throw new Error('נתמכים רק JPEG, PNG, WebP או PDF');
    if (prepared.size > MAX_UPLOAD_BYTES) throw new Error('הקובץ עדיין גדול מדי אחרי כיווץ');
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
    const dateEl = document.getElementById('docs-field-date');
    if (dateEl) dateEl.value = todayYmd();
    const totalEl = document.getElementById('docs-field-total');
    if (totalEl) totalEl.value = '';
    showFormError(formErrorEl, '');
  }

  function activeRows() {
    return cache.filter((row) => row.status !== 'archived');
  }

  function rowsForSupplier(name) {
    const key = supplierKey(name);
    return activeRows().filter((row) => supplierKey(row.supplier_name) === key);
  }

  function monthOf(row) {
    return String(row?.document_date || '').slice(0, 7);
  }

  function sumAmounts(rows) {
    return rows.reduce((sum, row) => sum + (Number(row.amount_total) || 0), 0);
  }

  function supplierRank(name) {
    const idx = DEFAULT_SUPPLIERS.indexOf(supplierKey(name));
    return idx >= 0 ? idx : DEFAULT_SUPPLIERS.length;
  }

  function buildSuppliers() {
    const map = new Map();
    DEFAULT_SUPPLIERS.forEach((name) => {
      map.set(name, { name, rows: [] });
    });
    activeRows().forEach((row) => {
      const name = supplierKey(row.supplier_name);
      if (!name) return;
      if (!map.has(name)) map.set(name, { name, rows: [] });
      map.get(name).rows.push(row);
    });
    pendingSuppliers.forEach((name) => {
      const key = supplierKey(name);
      if (key && !map.has(key)) map.set(key, { name: key, rows: [] });
    });
    const ym = activeYm();
    return [...map.values()].map((item) => {
      const monthRows = item.rows.filter((row) => monthOf(row) === ym);
      return {
        name: item.name,
        monthCount: monthRows.length,
        monthSum: sumAmounts(monthRows),
      };
    }).sort((a, b) => {
      const rankDiff = supplierRank(a.name) - supplierRank(b.name);
      if (rankDiff !== 0) return rankDiff;
      return a.name.localeCompare(b.name, 'he');
    });
  }

  function rememberSupplier(name) {
    const key = supplierKey(name);
    if (!key) return;
    if (!pendingSuppliers.includes(key)) pendingSuppliers.push(key);
  }

  function openFolder(name) {
    activeSupplier = supplierKey(name);
    if (!activeSupplier) return;
    rememberSupplier(activeSupplier);
    docsPane = 'folder';
    openMonths.clear();
    openMonths.add(activeYm());
    applyLayout();
    renderAll();
    document.getElementById('docs-app-folder')?.scrollTo?.(0, 0);
  }

  function openList() {
    docsPane = 'list';
    activeSupplier = '';
    applyLayout();
    renderAll();
  }

  function openReport() {
    docsPane = 'report';
    applyLayout();
    renderAll();
    loadMonthIncome(activeYm()).catch(() => {});
  }

  function renderSuppliers() {
    const list = document.getElementById('docs-supplier-list');
    if (!list) return;
    list.innerHTML = buildSuppliers().map((item) => {
      const active = supplierKey(item.name) === activeSupplier ? ' is-active' : '';
      return `
      <button type="button" class="docs-chat${active}" data-docs-folder="${escapeHtml(item.name)}" ${colorStyle(item.name)}>
        <span class="docs-chat__swatch" aria-hidden="true"></span>
        <span class="docs-chat__body">
          <strong class="docs-chat__name">${escapeHtml(item.name)}</strong>
          <span class="docs-chat__sum">${escapeHtml(formatMoney(item.monthSum))} החודש</span>
          <span class="docs-chat__count">${item.monthCount} חשבוניות</span>
        </span>
      </button>
    `;
    }).join('');
  }

  function renderFolder() {
    const titleEl = document.getElementById('docs-folder-title');
    const sumEl = document.getElementById('docs-folder-sum');
    const monthsEl = document.getElementById('docs-folder-months');
    const emptyEl = document.getElementById('docs-folder-empty');
    const idleEl = document.getElementById('docs-folder-idle');
    const activeEl = document.getElementById('docs-folder-active');
    const name = activeSupplier;
    if (idleEl) idleEl.hidden = true;
    if (activeEl) activeEl.hidden = !name;
    if (!name) {
      if (titleEl) titleEl.textContent = '';
      if (sumEl) sumEl.textContent = '€0';
      if (monthsEl) monthsEl.innerHTML = '';
      return;
    }
    if (titleEl) {
      titleEl.textContent = name;
      titleEl.style.setProperty('--docs-color', supplierColor(name));
    }
    const rows = rowsForSupplier(name)
      .slice()
      .sort((a, b) => String(b.document_date || '').localeCompare(String(a.document_date || '')));
    const ym = activeYm();
    const monthRows = rows.filter((row) => monthOf(row) === ym);
    if (sumEl) sumEl.textContent = formatMoney(sumAmounts(monthRows));
    const groups = new Map();
    if (rows.length) groups.set(ym, []);
    rows.forEach((row) => {
      const key = monthOf(row) || 'unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    const keys = [...groups.keys()].sort((a, b) => b.localeCompare(a));
    if (emptyEl) emptyEl.hidden = rows.length > 0;
    if (!monthsEl) return;
    monthsEl.innerHTML = keys.map((key) => {
      const open = openMonths.has(key);
      const items = groups.get(key) || [];
      return `
        <section class="docs-month${open ? ' is-open' : ''}" data-docs-month="${escapeHtml(key)}">
          <button type="button" class="docs-month__head" data-docs-month-toggle="${escapeHtml(key)}">
            <strong class="docs-month__name">${escapeHtml(key === 'unknown' ? 'ללא תאריך' : monthLabel(key))}</strong>
            <span class="docs-month__total">סה״כ ${escapeHtml(formatMoney(sumAmounts(items)))}</span>
          </button>
          <div class="docs-month__body">
            ${items.length ? items.map((row) => `
              <button type="button" class="docs-inv" data-docs-open="${escapeHtml(row.id)}">
                <span class="docs-inv__date">${escapeHtml(formatDate(row.document_date))}</span>
                <strong class="docs-inv__amount">${escapeHtml(formatMoney(row.amount_total))}</strong>
                <span class="docs-inv__chev" aria-hidden="true">‹</span>
              </button>
            `).join('') : '<p class="docs-month__empty">אין חשבוניות בחודש זה</p>'}
          </div>
        </section>
      `;
    }).join('');
  }

  function monthSessionSales(row) {
    const method = String(row?.payment_method || '').toLowerCase();
    if (method !== 'cash' && method !== 'credit' && method !== 'split') return 0;
    const cash = Number(row?.paid_cash);
    const credit = Number(row?.paid_credit);
    const hasCash = row?.paid_cash != null && Number.isFinite(cash);
    const hasCredit = row?.paid_credit != null && Number.isFinite(credit);
    if (hasCash || hasCredit) {
      return Math.max(0, (hasCash ? cash : 0) + (hasCredit ? credit : 0));
    }
    return 0;
  }

  function monthIsoWindow(ym) {
    const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const start = new Date(Date.UTC(y, mo - 1, 1) - 12 * 3600000);
    const end = new Date(Date.UTC(y, mo - 1, last, 23, 59, 59, 999) + 12 * 3600000);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  async function loadMonthIncome(ym) {
    if (!ym || incomeByYm[ym] != null || incomeBusyYm === ym) return;
    const sb = getClient();
    if (!sb) {
      incomeByYm[ym] = 0;
      return;
    }
    const windowIso = monthIsoWindow(ym);
    if (!windowIso) {
      incomeByYm[ym] = 0;
      return;
    }
    incomeBusyYm = ym;
    try {
      const page = 1000;
      let from = 0;
      const rows = [];
      while (true) {
        const { data, error } = await sb
          .from('order_sessions')
          .select('closed_at, payment_method, paid_cash, paid_credit, status')
          .eq('status', 'closed')
          .gte('closed_at', windowIso.start)
          .lte('closed_at', windowIso.end)
          .range(from, from + page - 1);
        if (error) throw error;
        const chunk = Array.isArray(data) ? data : [];
        rows.push(...chunk);
        if (chunk.length < page) break;
        from += page;
      }
      let sum = 0;
      rows.forEach((row) => {
        const parts = athensParts(row.closed_at);
        if (!parts || parts.ym !== ym) return;
        if (parts.ymd < TILL_COUNT_FROM_YMD) return;
        sum += monthSessionSales(row);
      });
      incomeByYm[ym] = Math.round(sum * 100) / 100;
    } catch (err) {
      console.error('[documents] income', err);
      incomeByYm[ym] = 0;
    } finally {
      if (incomeBusyYm === ym) incomeBusyYm = '';
    }
    if (activeYm() === ym) renderReport();
  }

  function expenseBreakdown() {
    const ym = activeYm();
    return buildSuppliers().map((item) => ({
      name: item.name,
      sum: item.monthSum,
      count: item.monthCount,
    })).filter((item, idx) => idx < DEFAULT_SUPPLIERS.length || item.sum > 0 || item.count > 0);
  }

  function renderMonthNav() {
    const ym = activeYm();
    const labelEl = document.getElementById('docs-month-label');
    const labelReportEl = document.getElementById('docs-month-label-report');
    const nextBtn = document.getElementById('docs-month-next');
    const nextReportBtn = document.getElementById('docs-month-next-report');
    if (labelEl) labelEl.textContent = monthLabel(ym);
    if (labelReportEl) labelReportEl.textContent = monthLabel(ym);
    if (nextBtn) nextBtn.disabled = ym >= currentYm();
    if (nextReportBtn) nextReportBtn.disabled = ym >= currentYm();
  }

  function renderReport() {
    const ym = activeYm();
    const incomeEl = document.getElementById('docs-income-sum');
    const expenseEl = document.getElementById('docs-expense-sum');
    const listEl = document.getElementById('docs-expense-break');
    const breakdown = expenseBreakdown();
    const expense = breakdown.reduce((sum, item) => sum + item.sum, 0);
    const income = incomeByYm[ym];
    if (incomeEl) incomeEl.textContent = income == null ? '…' : formatMoney(income);
    if (expenseEl) expenseEl.textContent = formatMoney(expense);
    if (listEl) {
      listEl.innerHTML = breakdown.map((item) => `
        <div class="docs-break__row" ${colorStyle(item.name)}>
          <span class="docs-break__swatch" aria-hidden="true"></span>
          <span class="docs-break__name">${escapeHtml(item.name)}</span>
          <span class="docs-break__meta">${escapeHtml(formatMoney(item.sum))}</span>
        </div>
      `).join('');
    }
  }

  function changeMonth(delta) {
    const next = shiftYm(activeYm(), delta);
    if (delta > 0 && next > currentYm()) return;
    selectedYm = next;
    openMonths.clear();
    openMonths.add(selectedYm);
    renderAll();
    loadMonthIncome(selectedYm).catch(() => {});
  }

  function downloadMonthExcel() {
    const ym = activeYm();
    const income = incomeByYm[ym];
    if (income == null) {
      showError('ממתינים לסכום ההכנסות');
      return;
    }
    const api = global.LechaimDocsMonthlyXlsx;
    if (typeof api?.downloadMonthlyReportXlsx !== 'function') {
      showError('יצירת הקובץ לא זמינה');
      return;
    }
    const breakdown = expenseBreakdown();
    const expense = breakdown.reduce((sum, item) => sum + item.sum, 0);
    const label = monthLabel(ym);
    api.downloadMonthlyReportXlsx(`דוח_חודשי_${label.replace(/\s+/g, '_')}.xlsx`, {
      title: `דוח חודשי - ${label}`,
      income,
      expense,
      suppliers: breakdown.map((item) => ({ name: item.name, sum: item.sum })),
    });
    showToast('הקובץ ירד');
  }

  function renderAll() {
    if (!selectedYm) selectedYm = currentYm();
    renderMonthNav();
    renderSuppliers();
    renderFolder();
    renderReport();
    applyLayout();
    loadMonthIncome(activeYm()).catch(() => {});
  }

  function closeScanOverlay() {
    revokePreviewUrl();
    pendingFile = null;
    editingId = null;
    if (cameraInput) cameraInput.value = '';
    if (fileInput) fileInput.value = '';
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
        : '🔄 צילום מחדש';
    }
    if (useBtn) {
      useBtn.textContent = mime === 'application/pdf' ? '✓ המשך' : '✓ השתמש בתמונה';
    }
    setScanStep('preview');
    openScanOverlay();
  }

  function goToForm() {
    if (formTitleEl) formTitleEl.textContent = editingId ? 'עריכה' : (scanSupplier || activeSupplier || 'חשבונית');
    const hint = document.getElementById('docs-form-supplier');
    if (hint) hint.textContent = scanSupplier || activeSupplier || '';
    setScanStep('form');
    window.setTimeout(() => document.getElementById('docs-field-total')?.focus(), 80);
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

  function closePickModal() {
    releaseTrap(pickTrap);
    pickTrap = null;
    closeModal(pickModal);
  }

  function closeNewModal() {
    releaseTrap(newTrap);
    newTrap = null;
    newThenScan = false;
    if (newNameInput) newNameInput.value = '';
    closeModal(newModal);
  }

  function openPickModal() {
    const suppliers = buildSuppliers();
    if (pickListEl) {
      pickListEl.innerHTML = suppliers.map((item) => `
        <button type="button" class="docs-pick-item" data-docs-pick-supplier="${escapeHtml(item.name)}" ${colorStyle(item.name)}>
          <span class="docs-break__swatch" aria-hidden="true"></span>
          ${escapeHtml(item.name)}
        </button>
      `).join('');
    }
    openModal(pickModal);
    releaseTrap(pickTrap);
    pickTrap = activateTrap(pickModal);
  }

  function openNewModal(thenScan) {
    newThenScan = Boolean(thenScan);
    showFormError(newFormError, '');
    openModal(newModal);
    releaseTrap(newTrap);
    newTrap = activateTrap(newModal);
    window.setTimeout(() => newNameInput?.focus(), 50);
  }

  function beginScanFor(name) {
    const key = supplierKey(name);
    if (!key) {
      showError('בחרו ספק תחילה');
      return;
    }
    scanSupplier = key;
    rememberSupplier(key);
    cameraInput?.click();
  }

  function requestScan() {
    showError('');
    if (activeSupplier) {
      beginScanFor(activeSupplier);
      return;
    }
    showError('בחרו ספק תחילה');
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
      if (viewTitleEl) viewTitleEl.textContent = row.supplier_name || 'חשבונית';
      if (viewMetaEl) {
        viewMetaEl.textContent = [
          row.supplier_name,
          formatDateFull(row.document_date),
          formatMoney(row.amount_total),
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
          img.alt = row.original_filename || 'חשבונית';
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

  function editDocument(id) {
    const row = cache.find((item) => item.id === id);
    if (!row) return;
    editingId = id;
    pendingFile = null;
    scanSupplier = supplierKey(row.supplier_name);
    revokePreviewUrl();
    resetForm();
    const dateEl = document.getElementById('docs-field-date');
    const totalEl = document.getElementById('docs-field-total');
    if (dateEl) dateEl.value = row.document_date || todayYmd();
    if (totalEl) totalEl.value = row.amount_total ?? '';
    goToForm();
    openScanOverlay();
  }

  async function deleteDocument(id) {
    const row = cache.find((item) => item.id === id);
    const ok = await askDeleteConfirm(row);
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
      showToast('נמחק');
    } catch (err) {
      showError(err?.message || 'המחיקה נכשלה');
    }
  }

  async function moveDocument(id, newSupplier) {
    const row = cache.find((item) => item.id === id);
    if (!row) return;
    const target = supplierKey(newSupplier);
    if (!target) return;
    if (supplierKey(row.supplier_name) === target) {
      showToast('כבר באותו ספק');
      return;
    }
    const sb = getClient();
    if (!sb) { showError('Supabase לא מחובר'); return; }
    try {
      const { data, error } = await sb
        .from('business_documents')
        .update({ supplier_name: target })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      upsertCache(data);
      renderAll();
      showToast(`הועבר ל${target}`);
    } catch (err) {
      showError(err?.message || 'ההעברה נכשלה');
    }
  }

  function readSimpleForm() {
    const date = String(document.getElementById('docs-field-date')?.value || '').trim();
    const raw = String(document.getElementById('docs-field-total')?.value || '').trim();
    const total = Number(raw);
    return {
      date: date || null,
      total: raw && Number.isFinite(total) ? total : null,
    };
  }

  async function saveDocument(event) {
    event.preventDefault();
    if (busy) return;
    const simple = readSimpleForm();
    const supplier = supplierKey(scanSupplier || activeSupplier);
    if (!supplier) {
      showFormError(formErrorEl, 'חסר ספק');
      return;
    }
    if (!simple.date) {
      showFormError(formErrorEl, 'בחרו תאריך');
      return;
    }
    if (simple.total == null || simple.total < 0) {
      showFormError(formErrorEl, 'הזינו סכום סופי');
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
          .update({
            document_date: simple.date,
            amount_total: simple.total,
            supplier_name: supplier,
            status: 'saved',
          })
          .eq('id', editingId)
          .select('*')
          .single();
        if (error) throw error;
        upsertCache(data);
        renderAll();
        closeScanOverlay();
        showToast('עודכן');
        return;
      }
      if (!pendingFile) {
        showFormError(formErrorEl, 'אין קובץ לשמירה');
        return;
      }
      const prepared = await prepareUploadFile(pendingFile);
      const mime = guessMime(prepared);
      const id = global.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const parts = athensParts(simple.date) || athensParts(new Date()) || { year: '1970', month: '01' };
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
        document_type: 'supplier_invoice',
        category: '',
        supplier_name: supplier,
        document_number: '',
        document_date: simple.date,
        currency: 'EUR',
        amount_before_vat: null,
        vat_amount: null,
        amount_total: simple.total,
        notes: '',
        status: 'saved',
        ocr_status: 'none',
        ocr_raw: null,
      };
      const { data, error } = await sb.from('business_documents').insert(row).select('*').single();
      if (error) {
        try { await sb.storage.from(BUCKET).remove([path]); } catch (_) { /* keep going */ }
        throw error;
      }
      upsertCache(data);
      rememberSupplier(supplier);
      openFolder(supplier);
      closeScanOverlay();
      showToast('✓ נשמר');
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
    docsPane = 'list';
    activeSupplier = '';
    scanSupplier = '';
    pendingSuppliers = [];
    selectedYm = '';
    incomeByYm = {};
    incomeBusyYm = '';
    closeScanOverlay();
    closeViewModal();
    closeVaultModal();
    closePickModal();
    closeNewModal();
    closeDeleteModal(false);
    stopRealtime();
    const appEl = document.getElementById('docs-app');
    if (appEl) appEl.hidden = true;
    renderAll();
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
      selectedYm = currentYm();
      closeVaultModal();
      const appEl = document.getElementById('docs-app');
      if (appEl) appEl.hidden = false;
      await loadRows();
      startRealtime();
    } catch (err) {
      console.error('[documents] unlock', err);
      showFormError(vaultFormError, err?.message || 'הכניסה נכשלה');
    } finally {
      busy = false;
    }
  }

  function submitNewSupplier(event) {
    event.preventDefault();
    const name = supplierKey(newNameInput?.value);
    if (!name) {
      showFormError(newFormError, 'הזינו שם ספק');
      return;
    }
    const thenScan = newThenScan;
    closeNewModal();
    rememberSupplier(name);
    openFolder(name);
    if (thenScan) beginScanFor(name);
  }

  function bindOnce() {
    if (bindDone) return;
    bindDone = true;

    vaultForm?.addEventListener('submit', (event) => {
      submitVault(event).catch(() => {});
    });
    document.getElementById('docs-vault-cancel')?.addEventListener('click', closeVaultModal);
    document.getElementById('docs-vault-backdrop')?.addEventListener('click', closeVaultModal);

    viewEl?.addEventListener('click', (event) => {
      if (event.target.closest('[data-docs-lock]')) {
        lockVault().then(() => openVaultModal());
        return;
      }
      if (!unlocked) {
        openVaultModal();
        return;
      }
      if (event.target.closest('[data-docs-scan]')) {
        requestScan();
        return;
      }
      if (event.target.closest('[data-docs-pick-file]')) {
        if (activeSupplier) scanSupplier = activeSupplier;
        fileInput?.click();
        return;
      }
      if (event.target.closest('[data-docs-new-supplier]')) {
        openNewModal(false);
        return;
      }
      if (event.target.closest('[data-docs-open-report]')) {
        openReport();
        return;
      }
      if (event.target.closest('[data-docs-back]')) {
        openList();
        return;
      }
      if (event.target.closest('#docs-month-prev') || event.target.closest('#docs-month-prev-report')) {
        changeMonth(-1);
        return;
      }
      if (event.target.closest('#docs-month-next') || event.target.closest('#docs-month-next-report')) {
        changeMonth(1);
        return;
      }
      if (event.target.closest('#docs-xlsx')) {
        downloadMonthExcel();
        return;
      }
      const folder = event.target.closest('[data-docs-folder]')?.getAttribute('data-docs-folder');
      if (folder) {
        openFolder(folder);
        return;
      }
      const monthKey = event.target.closest('[data-docs-month-toggle]')?.getAttribute('data-docs-month-toggle');
      if (monthKey) {
        if (openMonths.has(monthKey)) openMonths.delete(monthKey);
        else openMonths.add(monthKey);
        renderFolder();
        return;
      }
      const openId = event.target.closest('[data-docs-open]')?.getAttribute('data-docs-open');
      if (openId) openDocument(openId).catch(() => {});
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

    retakeBtn?.addEventListener('click', () => {
      if (captureSource === 'file') fileInput?.click();
      else cameraInput?.click();
    });
    useBtn?.addEventListener('click', goToForm);
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
      if (id) editDocument(id);
    });
    document.getElementById('docs-view-delete')?.addEventListener('click', () => {
      const id = viewModal?.dataset.docId;
      if (id) deleteDocument(id).catch(() => {});
    });
    document.getElementById('docs-view-move')?.addEventListener('click', () => {
      const id = viewModal?.dataset.docId;
      if (!id) return;
      closeViewModal();
      moveDocId = id;
      openPickModal();
    });

    pickModal?.addEventListener('click', (event) => {
      if (event.target.closest('#docs-pick-backdrop') || event.target.closest('#docs-pick-cancel')) {
        closePickModal();
        moveDocId = null;
        return;
      }
      if (event.target.closest('[data-docs-pick-new]')) {
        closePickModal();
        openNewModal(true);
        return;
      }
      const name = event.target.closest('[data-docs-pick-supplier]')?.getAttribute('data-docs-pick-supplier');
      if (name) {
        closePickModal();
        if (moveDocId) {
          moveDocument(moveDocId, name).catch(() => {});
          moveDocId = null;
        } else {
          beginScanFor(name);
        }
      }
    });

    newForm?.addEventListener('submit', submitNewSupplier);
    document.getElementById('docs-new-cancel')?.addEventListener('click', closeNewModal);
    document.getElementById('docs-new-backdrop')?.addEventListener('click', closeNewModal);

    document.getElementById('docs-delete-yes')?.addEventListener('click', () => closeDeleteModal(true));
    document.getElementById('docs-delete-cancel')?.addEventListener('click', () => closeDeleteModal(false));
    document.getElementById('docs-delete-backdrop')?.addEventListener('click', () => closeDeleteModal(false));

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (deleteModal && !deleteModal.hidden) closeDeleteModal(false);
      else if (viewModal && !viewModal.hidden) closeViewModal();
      else if (scanOverlay && !scanOverlay.hidden) closeScanOverlay();
      else if (pickModal && !pickModal.hidden) closePickModal();
      else if (newModal && !newModal.hidden) closeNewModal();
      else if (vaultModal && !vaultModal.hidden) closeVaultModal();
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
    closePickModal();
    closeNewModal();
    closeDeleteModal(false);
  }

  global.LechaimAdminDocuments = {
    start,
    stop,
    lockVault,
  };
})(window);
