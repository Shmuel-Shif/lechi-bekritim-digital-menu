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
  const MANUAL_PAYMENT_SUPPLIER = 'תשלום ללא קבלה';
  const MANUAL_PAYMENT_SUPPLIER_OLD = 'תשלום מזומן/אשראי';
  const GENERAL_INVOICE_SUPPLIER = 'חשבוניות כלליות';
  const SMALL_INVOICE_SUPPLIER_OLD = 'חשבוניות קטנות';
  const Z_REPORT_SUPPLIER = 'דוח Z';
  const SALARY_SUPPLIER = 'משכורות';
  const DEFAULT_SUPPLIERS = [
    'ירקות',
    'דה מארט',
    'שתייה',
    'דגים',
    'לחם',
    'ביצים',
    'חד פעמי',
    GENERAL_INVOICE_SUPPLIER,
    SALARY_SUPPLIER,
    Z_REPORT_SUPPLIER,
    MANUAL_PAYMENT_SUPPLIER,
  ];
  const SUPPLIER_COLORS = {
    'ירקות': '#3f8f5b',
    'דה מארט': '#3a6ea8',
    'שתייה': '#2a9b8a',
    'דגים': '#2c4a7c',
    'לחם': '#c4892d',
    'ביצים': '#d4a017',
    'חד פעמי': '#6b7c8a',
    [GENERAL_INVOICE_SUPPLIER]: '#c45a3d',
    [SALARY_SUPPLIER]: '#7a4a3a',
    [Z_REPORT_SUPPLIER]: '#1e3354',
    [MANUAL_PAYMENT_SUPPLIER]: '#5a6b4e',
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
  let deleteStep = 'confirm';
  let deleteCodeBusy = false;
  let docsPane = 'list';
  let activeSupplier = '';
  let scanSupplier = '';
  let pendingSuppliers = [];
  let pendingPayMethod = '';
  let newThenScan = false;
  let moveDocId = null;
  let selectedYm = '';
  let reportMode = 'month';
  let reportFromYmd = '';
  let reportToYmd = '';
  let incomeByYm = {};
  let incomeBusyYm = '';
  let dayReportsByYm = {};
  let dayReportsBusyYm = '';
  let dayReportsByRange = {};
  let dayReportsBusyKey = '';
  let salaryPayments = [];
  let salaryLoaded = false;
  let salaryBusy = false;
  let pdfBusy = false;
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
    const key = canonicalSupplier(name);
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

  function canonicalSupplier(name) {
    const key = supplierKey(name);
    if (key === MANUAL_PAYMENT_SUPPLIER_OLD) return MANUAL_PAYMENT_SUPPLIER;
    if (key === SMALL_INVOICE_SUPPLIER_OLD) return GENERAL_INVOICE_SUPPLIER;
    return key;
  }

  function isManualPaymentSupplier(name) {
    return canonicalSupplier(name) === MANUAL_PAYMENT_SUPPLIER;
  }

  function isGeneralInvoiceSupplier(name) {
    return canonicalSupplier(name) === GENERAL_INVOICE_SUPPLIER;
  }

  function isZReportSupplier(name) {
    return supplierKey(name) === Z_REPORT_SUPPLIER;
  }

  function isSalarySupplier(name) {
    return supplierKey(name) === SALARY_SUPPLIER;
  }

  function isReservedSupplier(name) {
    return isManualPaymentSupplier(name) || isZReportSupplier(name) || isSalarySupplier(name);
  }

  function isInvoiceExportRow(row) {
    return hasDocumentFile(row)
      && !isZReportSupplier(row.supplier_name)
      && !isManualPaymentSupplier(row.supplier_name);
  }

  function hasDocumentFile(row) {
    return Boolean(String(row?.storage_path || '').trim());
  }

  function payMethodLabel(value) {
    if (value === 'cash') return 'מזומן';
    if (value === 'credit') return 'אשראי';
    if (value === 'bank') return 'העברה בנקאית';
    return '';
  }

  function isPayMethod(value) {
    return value === 'cash' || value === 'credit' || value === 'bank';
  }

  function normalizePayMethod(value) {
    return isPayMethod(value) ? value : '';
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

  function resetDeleteModal() {
    deleteStep = 'confirm';
    deleteCodeBusy = false;
    const wrap = document.getElementById('docs-delete-code-wrap');
    const hint = document.getElementById('docs-delete-code-hint');
    const input = document.getElementById('docs-delete-code');
    const err = document.getElementById('docs-delete-error');
    const yes = document.getElementById('docs-delete-yes');
    if (wrap) wrap.hidden = true;
    if (hint) hint.hidden = true;
    if (input) input.value = '';
    if (err) {
      err.hidden = true;
      err.textContent = '';
    }
    if (yes) {
      yes.disabled = false;
      yes.textContent = 'מחק';
    }
  }

  function setDeleteCodeError(message) {
    const err = document.getElementById('docs-delete-error');
    if (!err) return;
    err.textContent = message || '';
    err.hidden = !message;
  }

  function closeDeleteModal(ok) {
    resetDeleteModal();
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
    resetDeleteModal();
    if (deleteTextEl) {
      const hasFile = hasDocumentFile(row);
      deleteTextEl.textContent = label
        ? (hasFile
          ? `אתה בטוח? למחוק את החשבונית מ-${label} (${amount})? הקובץ יימחק לצמיתות.`
          : `אתה בטוח? למחוק את התשלום מ-${label} (${amount})?`)
        : 'אתה בטוח? הרשומה תימחק לצמיתות.';
    }
    openModal(deleteModal);
    releaseTrap(deleteTrap);
    deleteTrap = activateTrap(deleteModal);
    window.setTimeout(() => document.getElementById('docs-delete-yes')?.focus(), 50);
    return new Promise((resolve) => {
      if (typeof deleteResolver === 'function') deleteResolver(false);
      deleteResolver = resolve;
    });
  }

  async function confirmDeleteClick() {
    if (deleteCodeBusy) return;
    if (deleteStep !== 'code') {
      deleteStep = 'code';
      const wrap = document.getElementById('docs-delete-code-wrap');
      const hint = document.getElementById('docs-delete-code-hint');
      const input = document.getElementById('docs-delete-code');
      const yes = document.getElementById('docs-delete-yes');
      if (wrap) wrap.hidden = false;
      if (hint) hint.hidden = false;
      if (yes) yes.textContent = 'אישור מחיקה';
      setDeleteCodeError('');
      window.setTimeout(() => {
        input?.focus();
        if (typeof input?.select === 'function') input.select();
      }, 40);
      return;
    }
    const input = document.getElementById('docs-delete-code');
    const code = String(input?.value || '');
    if (!code.trim()) {
      setDeleteCodeError('הזינו קוד גישה');
      input?.focus();
      return;
    }
    const sb = getClient();
    if (!sb) {
      setDeleteCodeError('Supabase לא מחובר');
      return;
    }
    deleteCodeBusy = true;
    const yes = document.getElementById('docs-delete-yes');
    if (yes) yes.disabled = true;
    setDeleteCodeError('');
    try {
      const { data, error } = await sb.rpc('documents_vault_verify', { p_code: code });
      if (input) input.value = '';
      if (error) throw error;
      const res = data || {};
      if (!res.ok) {
        if (res.error === 'invalid_code') setDeleteCodeError('קוד שגוי');
        else if (res.error === 'code_not_set') setDeleteCodeError('הקוד עדיין לא הוגדר');
        else if (res.error === 'not_authenticated') setDeleteCodeError('יש להתחבר לאדמין');
        else setDeleteCodeError(res.error || 'שגיאה');
        return;
      }
      closeDeleteModal(true);
    } catch (err) {
      setDeleteCodeError(err?.message || 'אימות הקוד נכשל');
    } finally {
      deleteCodeBusy = false;
      if (yes && deleteStep === 'code' && deleteModal && !deleteModal.hidden) yes.disabled = false;
    }
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
    scanOverlay?.querySelector('.docs-scan-modal__panel')?.classList.toggle('is-form', step === 'form');
  }

  function resetForm() {
    if (!formEl) return;
    formEl.reset();
    const dateEl = document.getElementById('docs-field-date');
    if (dateEl) dateEl.value = todayYmd();
    const totalEl = document.getElementById('docs-field-total');
    if (totalEl) totalEl.value = '';
    const cashEl = document.getElementById('docs-field-cash');
    if (cashEl) cashEl.value = '';
    const creditEl = document.getElementById('docs-field-credit');
    if (creditEl) creditEl.value = '';
    syncZTotal();
    const notesEl = document.getElementById('docs-field-notes');
    if (notesEl) notesEl.value = '';
    pendingPayMethod = '';
    setPayMethodHighlight('');
    showFormError(formErrorEl, '');
  }

  function setManualFormVisible(on) {
    const wrap = document.getElementById('docs-manual-fields');
    if (wrap) wrap.hidden = !on;
    scanOverlay?.querySelector('.docs-scan-modal__panel')?.classList.toggle('is-manual', Boolean(on));
  }

  function setPayFieldsVisible(on) {
    const wrap = document.getElementById('docs-pay-fields');
    if (wrap) wrap.hidden = !on;
  }

  function setPayBankVisible(on) {
    const btn = document.querySelector('[data-docs-pay="bank"]');
    if (btn) btn.hidden = !on;
  }

  function setPayMethodHighlight(method) {
    document.querySelectorAll('[data-docs-pay]').forEach((btn) => {
      btn.classList.toggle('is-on', btn.getAttribute('data-docs-pay') === method);
    });
  }

  function activeRows() {
    return cache.filter((row) => row.status !== 'archived');
  }

  function rowsForSupplier(name) {
    const key = canonicalSupplier(name);
    if (isSalarySupplier(key)) return salaryDocRows();
    return activeRows().filter((row) => canonicalSupplier(row.supplier_name) === key && !isSalarySupplier(row.supplier_name));
  }

  function monthOf(row) {
    return String(row?.document_date || '').slice(0, 7);
  }

  function monthDocuments(ym) {
    const key = String(ym || '');
    return activeRows()
      .filter((row) => monthOf(row) === key)
      .sort((a, b) => {
        const rank = supplierRank(a.supplier_name) - supplierRank(b.supplier_name);
        if (rank) return rank;
        const names = supplierKey(a.supplier_name).localeCompare(supplierKey(b.supplier_name), 'he');
        if (names) return names;
        const dates = String(a.document_date || '').localeCompare(String(b.document_date || ''));
        if (dates) return dates;
        return String(a.created_at || '').localeCompare(String(b.created_at || ''));
      });
  }

  function setPdfButtonState(busy, label, buttonId, idleLabel) {
    const btn = document.getElementById(buttonId || 'docs-month-pdf');
    if (!btn) return;
    btn.disabled = Boolean(busy);
    btn.setAttribute('aria-busy', busy ? 'true' : 'false');
    btn.textContent = label || idleLabel || 'הפק PDF לחודש';
  }

  function roundMoney(amount) {
    return Math.round((Number(amount) || 0) * 100) / 100;
  }

  function encodeZSplit(cash, credit) {
    return `z:${roundMoney(cash)}|${roundMoney(credit)}`;
  }

  function parseZCategory(category) {
    const m = String(category || '').match(/^z:(\d+(?:\.\d+)?)\|(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    return { cash: Number(m[1]), credit: Number(m[2]) };
  }

  function zAmounts(row) {
    const parsed = parseZCategory(row?.category);
    if (parsed) {
      return {
        cash: roundMoney(parsed.cash),
        credit: roundMoney(parsed.credit),
        total: roundMoney(parsed.cash + parsed.credit),
        hasSplit: true,
      };
    }
    const rawCash = row?.amount_before_vat;
    const rawCredit = row?.vat_amount;
    const hasCash = rawCash != null && Number.isFinite(Number(rawCash));
    const hasCredit = rawCredit != null && Number.isFinite(Number(rawCredit));
    if (hasCash || hasCredit) {
      const cash = hasCash ? Number(rawCash) : 0;
      const credit = hasCredit ? Number(rawCredit) : 0;
      return {
        cash: roundMoney(cash),
        credit: roundMoney(credit),
        total: roundMoney(cash + credit),
        hasSplit: true,
      };
    }
    return {
      cash: 0,
      credit: 0,
      total: roundMoney(row?.amount_total),
      hasSplit: false,
    };
  }

  function sumZAmounts(rows) {
    return (rows || []).reduce((acc, row) => {
      const split = zAmounts(row);
      acc.cash = roundMoney(acc.cash + (split.hasSplit ? split.cash : 0));
      acc.credit = roundMoney(acc.credit + (split.hasSplit ? split.credit : 0));
      acc.total = roundMoney(acc.total + split.total);
      return acc;
    }, { cash: 0, credit: 0, total: 0 });
  }

  function zSumHtml(split) {
    return `
      <span><em>סה״כ מזומן</em><strong>${escapeHtml(formatMoney(split.cash))}</strong></span>
      <span><em>סה״כ אשראי</em><strong>${escapeHtml(formatMoney(split.credit))}</strong></span>
      <span><em>סה״כ כללי</em><strong>${escapeHtml(formatMoney(split.total))}</strong></span>
    `;
  }

  function readMoneyField(id) {
    const raw = String(document.getElementById(id)?.value || '').trim();
    if (!raw) return 0;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return null;
    return roundMoney(n);
  }

  function syncZTotal() {
    const el = document.getElementById('docs-z-total');
    if (!el) return;
    const cash = readMoneyField('docs-field-cash');
    const credit = readMoneyField('docs-field-credit');
    if (cash == null || credit == null) {
      el.textContent = 'סה״כ כללי —';
      return;
    }
    el.textContent = `סה״כ כללי ${formatMoney(cash + credit)}`;
  }

  function setZFormVisible(on) {
    const zWrap = document.getElementById('docs-z-fields');
    const totalField = document.getElementById('docs-total-field');
    if (zWrap) zWrap.hidden = !on;
    if (totalField) totalField.hidden = Boolean(on);
    scanOverlay?.querySelector('.docs-scan-modal__panel')?.classList.toggle('is-z', Boolean(on));
    if (on) syncZTotal();
  }

  function sumAmounts(rows) {
    return (rows || []).reduce((sum, row) => sum + (Number(row.amount_total) || 0), 0);
  }

  function supplierRank(name) {
    const idx = DEFAULT_SUPPLIERS.indexOf(canonicalSupplier(name));
    return idx >= 0 ? idx : DEFAULT_SUPPLIERS.length;
  }

  function buildSuppliers() {
    const map = new Map();
    DEFAULT_SUPPLIERS.forEach((name) => {
      map.set(name, { name, rows: [] });
    });
    activeRows().forEach((row) => {
      if (isSalarySupplier(row.supplier_name)) return;
      const name = canonicalSupplier(row.supplier_name);
      if (!name) return;
      if (!map.has(name)) map.set(name, { name, rows: [] });
      map.get(name).rows.push(row);
    });
    pendingSuppliers.forEach((name) => {
      const key = canonicalSupplier(name);
      if (key && !map.has(key)) map.set(key, { name: key, rows: [] });
    });
    const ym = activeYm();
    return [...map.values()].map((item) => {
      if (isSalarySupplier(item.name)) {
        const monthRows = salaryDocRows().filter((row) => monthOf(row) === ym);
        return {
          name: item.name,
          monthCount: monthRows.length,
          monthSum: sumAmounts(monthRows),
        };
      }
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
    const key = canonicalSupplier(name);
    if (!key) return;
    if (!pendingSuppliers.includes(key)) pendingSuppliers.push(key);
  }

  function isMissingSuppliersTable(err) {
    const msg = String(err?.message || err || '');
    return /business_document_suppliers/i.test(msg)
      || (/Could not find the table|relation .* does not exist/i.test(msg) && /supplier/i.test(msg));
  }

  function isMissingManualPaymentSupport(err) {
    const msg = String(err?.message || err || '');
    return /manual_payment|manual_file|storage_path|mime_type|file_size/i.test(msg)
      && /violat|check|not-null|not null|invalid/i.test(msg);
  }

  function isRlsSaveError(err) {
    const msg = String(err?.message || err?.code || '');
    return /row-level security|violates row-level|42501|PGRST301/i.test(msg);
  }

  function isSingleCoerceError(err) {
    const msg = String(err?.message || err?.code || '');
    return /PGRST116|Cannot coerce the result to a single JSON object|JSON object requested/i.test(msg);
  }

  function saveFailedError() {
    return new Error('השמירה לא נקלטה. הריצו supabase-business-documents-insert-fix.sql ואז נעלו ופתחו שוב את כספת המסמכים.');
  }

  async function currentAuthUserId(sb) {
    try {
      const { data } = await sb.auth.getUser();
      return data?.user?.id || null;
    } catch (_) {
      return null;
    }
  }

  async function insertBusinessDocument(sb, row, isUpdate) {
    const { data, error } = await sb.rpc('save_business_document', { p_row: row });
    if (error) {
      const missingFn = /save_business_document|Could not find the function|schema cache/i.test(String(error.message || ''));
      if (missingFn || isSingleCoerceError(error)) {
        const query = isUpdate
          ? sb.from('business_documents').update({
            document_date: row.document_date,
            amount_total: row.amount_total,
            amount_before_vat: row.amount_before_vat,
            vat_amount: row.vat_amount,
            supplier_name: row.supplier_name,
            notes: row.notes,
            category: row.category,
            status: row.status || 'saved',
          }).eq('id', row.id)
          : sb.from('business_documents').insert(row);
        const fallback = await query.select('*').maybeSingle();
        if (fallback.error) {
          if (isSingleCoerceError(fallback.error)) throw saveFailedError();
          throw fallback.error;
        }
        if (!fallback.data) throw saveFailedError();
        return fallback.data;
      }
      throw error;
    }
    const res = data || {};
    if (!res.ok) {
      const err = new Error(res.error || 'save_failed');
      err.code = res.error;
      throw err;
    }
    if (!res.row) throw saveFailedError();
    return res.row;
  }

  async function persistSupplier(name) {
    const key = canonicalSupplier(name);
    if (!key) return;
    rememberSupplier(key);
    const sb = getClient();
    if (!sb) throw new Error('Supabase לא מחובר');
    const { error } = await sb.from('business_document_suppliers').insert({ name: key });
    if (!error) return;
    if (/duplicate|unique/i.test(String(error.message || ''))) return;
    if (isMissingSuppliersTable(error)) {
      throw new Error('יש להריץ את supabase-business-documents-suppliers-and-manual.sql ב-SQL Editor של Supabase');
    }
    throw error;
  }

  async function loadCatalogSuppliers() {
    const sb = getClient();
    if (!sb) return;
    const { data, error } = await sb
      .from('business_document_suppliers')
      .select('name')
      .order('name', { ascending: true });
    if (error) {
      if (isMissingSuppliersTable(error)) return;
      throw error;
    }
    (data || []).forEach((row) => rememberSupplier(row.name));
  }

  function openFolder(name) {
    activeSupplier = canonicalSupplier(name);
    if (!activeSupplier) return;
    rememberSupplier(activeSupplier);
    docsPane = 'folder';
    openMonths.clear();
    openMonths.add(activeYm());
    applyLayout();
    renderAll();
    if (isSalarySupplier(activeSupplier)) loadSalaryPayments(true).catch(() => {});
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
    ensureReportRange();
    applyLayout();
    renderAll();
    syncPeriodInputs();
    loadRangeDayReports(reportFromYmd, reportToYmd).catch(() => {});
    loadSalaryPayments(true).catch(() => {});
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
          <span class="docs-chat__count">${item.monthCount} ${isManualPaymentSupplier(item.name) || isSalarySupplier(item.name) ? 'תשלומים' : (isZReportSupplier(item.name) ? 'דוחות' : 'חשבוניות')}</span>
        </span>
      </button>
    `;
    }).join('');
  }

  function renderFolder() {
    const titleEl = document.getElementById('docs-folder-title');
    const sumEl = document.getElementById('docs-folder-sum');
    const sumLabel = document.getElementById('docs-folder-sum-label');
    const monthsEl = document.getElementById('docs-folder-months');
    const emptyEl = document.getElementById('docs-folder-empty');
    const idleEl = document.getElementById('docs-folder-idle');
    const activeEl = document.getElementById('docs-folder-active');
    const name = activeSupplier;
    if (idleEl) idleEl.hidden = true;
    if (activeEl) activeEl.hidden = !name;
    if (!name) {
      if (titleEl) titleEl.textContent = '';
      if (sumEl) {
        sumEl.classList.remove('is-z');
        sumEl.textContent = '€0';
      }
      if (sumLabel) sumLabel.textContent = 'סה״כ החודש';
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
    const scanBtn = document.querySelector('#docs-folder-active [data-docs-scan]');
    const fileBtn = document.querySelector('#docs-folder-active [data-docs-pick-file]');
    const payBtn = document.getElementById('docs-add-payment');
    const copyPayBtn = document.getElementById('docs-folder-copy-pay');
    const zPdfBtn = document.getElementById('docs-folder-z-pdf');
    const manual = isManualPaymentSupplier(name);
    const zReport = isZReportSupplier(name);
    const salary = isSalarySupplier(name);
    if (sumEl) {
      sumEl.classList.toggle('is-z', zReport);
      if (zReport) sumEl.innerHTML = zSumHtml(sumZAmounts(monthRows));
      else sumEl.textContent = formatMoney(sumAmounts(monthRows));
    }
    if (sumLabel) sumLabel.textContent = salary ? 'משכורות ששולמו בשעות עובדים' : 'סה״כ החודש';
    if (scanBtn) {
      scanBtn.hidden = manual || salary;
      scanBtn.textContent = zReport ? 'סרוק דוח Z' : 'סרוק חשבונית';
    }
    if (fileBtn) fileBtn.hidden = manual || salary;
    if (payBtn) payBtn.hidden = !manual;
    if (copyPayBtn) copyPayBtn.hidden = !manual;
    if (zPdfBtn) zPdfBtn.hidden = !zReport;
    if (emptyEl) {
      emptyEl.textContent = salary
        ? 'אין משכורות ששולמו — רושמים אותן בשעות עובדים (בנק/מזומן)'
        : (manual
          ? 'אין תשלומים עדיין — הוסיפו את הראשון'
          : (zReport ? 'אין דוחות Z עדיין — סרקו את הראשון' : 'אין חשבוניות עדיין — סרקו את הראשונה'));
    }
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
      const monthSplit = zReport ? sumZAmounts(items) : null;
      const monthTotal = zReport
        ? `<span class="docs-month__total is-z">${zSumHtml(monthSplit)}</span>`
        : `<span class="docs-month__total">סה״כ ${escapeHtml(formatMoney(sumAmounts(items)))}</span>`;
      return `
        <section class="docs-month${open ? ' is-open' : ''}" data-docs-month="${escapeHtml(key)}">
          <button type="button" class="docs-month__head" data-docs-month-toggle="${escapeHtml(key)}">
            <strong class="docs-month__name">${escapeHtml(key === 'unknown' ? 'ללא תאריך' : monthLabel(key))}</strong>
            ${monthTotal}
          </button>
          <div class="docs-month__body">
            ${items.length ? items.map((row) => {
              const split = zReport ? zAmounts(row) : null;
              if (salary) {
                const who = String(row.notes || '').trim() || 'עובד';
                const pay = row.category === 'bank' ? 'בנק' : 'מזומן';
                return `
              <button type="button" class="docs-inv docs-inv--salary" data-docs-open="${escapeHtml(row.id)}">
                <span class="docs-inv__main">
                  <strong class="docs-inv__who">${escapeHtml(who)}</strong>
                  <span class="docs-inv__meta">${escapeHtml(pay)} · ${escapeHtml(formatDate(row.document_date))}</span>
                </span>
                <strong class="docs-inv__amount">${escapeHtml(formatMoney(row.amount_total))}</strong>
                <span class="docs-inv__chev" aria-hidden="true">‹</span>
              </button>`;
              }
              const amountHtml = zReport
                ? (split.hasSplit
                  ? `<span class="docs-inv__z">
                    <span>מזומן ${escapeHtml(formatMoney(split.cash))}</span>
                    <span>אשראי ${escapeHtml(formatMoney(split.credit))}</span>
                    <strong>סה״כ ${escapeHtml(formatMoney(split.total))}</strong>
                  </span>`
                  : `<strong class="docs-inv__amount">${escapeHtml(formatMoney(split.total))}</strong>`)
                : `<strong class="docs-inv__amount">${escapeHtml(formatMoney(row.amount_total))}</strong>`;
              const method = !zReport ? payMethodLabel(row.category) : '';
              const note = !zReport ? String(row.notes || '').trim() : '';
              const meta = [method, note].filter(Boolean).join(' · ');
              const metaHtml = meta ? `<span class="docs-inv__meta">${escapeHtml(meta)}</span>` : '';
              return `
              <button type="button" class="docs-inv${zReport ? ' docs-inv--z' : ''}" data-docs-open="${escapeHtml(row.id)}">
                <span class="docs-inv__main">
                  <span class="docs-inv__date">${escapeHtml(formatDate(row.document_date))}</span>
                  ${metaHtml}
                </span>
                ${amountHtml}
                <span class="docs-inv__chev" aria-hidden="true">‹</span>
              </button>`;
            }).join('') : `<p class="docs-month__empty">${salary ? 'אין משכורות ששולמו בחודש זה' : (manual ? 'אין תשלומים בחודש זה' : (zReport ? 'אין דוחות Z בחודש זה' : 'אין חשבוניות בחודש זה'))}</p>`}
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

  function monthYmdBounds(ym) {
    const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
    if (!m) return null;
    const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
    return {
      start: `${m[1]}-${m[2]}-01`,
      end: `${m[1]}-${m[2]}-${String(last).padStart(2, '0')}`,
    };
  }

  function ymOfYmd(ymd) {
    return String(ymd || '').slice(0, 7);
  }

  function reportRangeKey(fromYmd, toYmd) {
    return `${fromYmd || reportFromYmd}_${toYmd || reportToYmd}`;
  }

  function inReportRange(ymd) {
    const d = String(ymd || '').slice(0, 10);
    if (!reportFromYmd || !reportToYmd || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    return d >= reportFromYmd && d <= reportToYmd;
  }

  function periodLabel() {
    if (!reportFromYmd || !reportToYmd) return '';
    const fromYm = ymOfYmd(reportFromYmd);
    const toYm = ymOfYmd(reportToYmd);
    const fromBounds = monthYmdBounds(fromYm);
    const toBounds = monthYmdBounds(toYm);
    const fullMonths = fromBounds && toBounds
      && reportFromYmd === fromBounds.start
      && reportToYmd === toBounds.end;
    if (fullMonths) {
      return fromYm === toYm ? monthLabel(fromYm) : `${monthLabel(fromYm)} – ${monthLabel(toYm)}`;
    }
    return `${formatDateFull(reportFromYmd)} – ${formatDateFull(reportToYmd)}`;
  }

  function setReportRange(fromYmd, toYmd) {
    reportFromYmd = fromYmd;
    reportToYmd = toYmd;
  }

  function defaultReportRange() {
    const bounds = monthYmdBounds(activeYm() || currentYm());
    if (!bounds) return;
    setReportRange(bounds.start, bounds.end);
  }

  function ensureReportRange() {
    if (!reportFromYmd || !reportToYmd) defaultReportRange();
  }

  function syncPeriodInputs() {
    ensureReportRange();
    const today = todayYmd();
    const thisYm = currentYm();
    const fromMonth = document.getElementById('docs-period-from-month');
    const toMonth = document.getElementById('docs-period-to-month');
    const fromDate = document.getElementById('docs-period-from-date');
    const toDate = document.getElementById('docs-period-to-date');
    if (fromMonth) {
      fromMonth.value = ymOfYmd(reportFromYmd);
      fromMonth.max = thisYm;
    }
    if (toMonth) {
      toMonth.value = ymOfYmd(reportToYmd);
      toMonth.max = thisYm;
    }
    if (fromDate) {
      fromDate.value = reportFromYmd;
      fromDate.max = today;
    }
    if (toDate) {
      toDate.value = reportToYmd;
      toDate.max = today;
    }
    const monthFields = document.getElementById('docs-period-month-fields');
    const dateFields = document.getElementById('docs-period-date-fields');
    if (monthFields) monthFields.hidden = reportMode !== 'month';
    if (dateFields) dateFields.hidden = reportMode !== 'date';
    document.querySelectorAll('[data-docs-period-mode]').forEach((btn) => {
      btn.classList.toggle('is-on', btn.getAttribute('data-docs-period-mode') === reportMode);
    });
    const applied = document.getElementById('docs-period-applied');
    if (applied) applied.textContent = periodLabel();
  }

  function showPeriodError(message) {
    const el = document.getElementById('docs-period-error');
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || '';
  }

  function applyReportPeriod(event) {
    if (event) event.preventDefault();
    showPeriodError('');
    let from = '';
    let to = '';
    if (reportMode === 'month') {
      const fromYm = String(document.getElementById('docs-period-from-month')?.value || '').trim();
      const toYm = String(document.getElementById('docs-period-to-month')?.value || '').trim();
      const fromBounds = monthYmdBounds(fromYm);
      const toBounds = monthYmdBounds(toYm);
      if (!fromBounds || !toBounds) {
        showPeriodError('בחרו חודש התחלה וחודש סיום');
        return;
      }
      from = fromBounds.start;
      to = toBounds.end;
    } else {
      from = String(document.getElementById('docs-period-from-date')?.value || '').trim();
      to = String(document.getElementById('docs-period-to-date')?.value || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        showPeriodError('בחרו תאריך התחלה ותאריך סיום');
        return;
      }
    }
    const today = todayYmd();
    if (to > today) to = today;
    if (from > today) from = today;
    if (from > to) {
      showPeriodError('תאריך ההתחלה אחרי תאריך הסיום');
      return;
    }
    setReportRange(from, to);
    syncPeriodInputs();
    renderReport();
    loadRangeDayReports(from, to).catch(() => {});
  }

  function setReportMode(mode) {
    reportMode = mode === 'date' ? 'date' : 'month';
    syncPeriodInputs();
  }

  function emptyDayReportTotals() {
    return { cash: 0, credit: 0, tip: 0, total: 0, days: 0, loaded: true };
  }

  function sumDayReports(rows) {
    return (rows || []).reduce((acc, row) => {
      const cash = Number(row.cash) || 0;
      const credit = Number(row.credit) || 0;
      const tip = Number(row.tip) || 0;
      acc.cash = roundMoney(acc.cash + cash);
      acc.credit = roundMoney(acc.credit + credit);
      acc.tip = roundMoney(acc.tip + tip);
      acc.total = roundMoney(acc.total + cash + credit);
      acc.days += 1;
      return acc;
    }, { cash: 0, credit: 0, tip: 0, total: 0, days: 0, loaded: true });
  }

  function monthZRows(ym) {
    return monthDocuments(ym).filter((row) => isZReportSupplier(row.supplier_name));
  }

  function monthExpenseRows(ym) {
    return monthDocuments(ym)
      .filter((row) => !isZReportSupplier(row.supplier_name) && !isSalarySupplier(row.supplier_name))
      .concat(salaryDocRows().filter((row) => monthOf(row) === ym));
  }

  function periodDocuments() {
    ensureReportRange();
    return activeRows().filter((row) => inReportRange(row.document_date));
  }

  function periodZRows() {
    return periodDocuments().filter((row) => isZReportSupplier(row.supplier_name));
  }

  function periodExpenseRows() {
    return periodDocuments()
      .filter((row) => !isZReportSupplier(row.supplier_name) && !isSalarySupplier(row.supplier_name))
      .concat(salaryDocRows().filter((row) => inReportRange(row.document_date)));
  }

  function salaryEmployeeName(row) {
    return String(row?.employee_name || '').trim() || 'עובד';
  }

  function salaryDocRows() {
    return (salaryPayments || []).map((row) => ({
      id: `salary:${row.id}`,
      supplier_name: SALARY_SUPPLIER,
      document_date: row.paid_on,
      amount_total: Number(row.amount) || 0,
      category: row.method === 'bank' ? 'bank' : 'cash',
      notes: salaryEmployeeName(row),
      document_type: 'salary_payment',
      source: 'salary',
      storage_path: null,
      status: 'saved',
      created_at: row.created_at || row.paid_on,
    }));
  }

  async function loadSalaryPayments(force) {
    if (!unlocked || salaryBusy) return;
    if (!force && salaryLoaded) return;
    const sb = getClient();
    if (!sb) {
      salaryPayments = [];
      salaryLoaded = true;
      return;
    }
    salaryBusy = true;
    try {
      const { data, error } = await sb.rpc('documents_salary_payments');
      if (error) throw error;
      salaryPayments = (Array.isArray(data) ? data : []).map((row) => ({
        id: row.id,
        paid_on: row.paid_on,
        amount: row.amount,
        method: row.method,
        created_at: row.created_at,
        employee_name: String(row.employee_name || '').trim(),
      }));
      salaryLoaded = true;
    } catch (err) {
      console.error('[documents] salary', err);
      const msg = String(err?.message || '');
      if (/documents_salary_payments|Could not find the function|schema cache/i.test(msg)) {
        showError('להצגת שמות העובדים במשכורות הריצו supabase-documents-salary-payments.sql ב-Supabase');
        try {
          const plain = await sb
            .from('staff_salary_payments')
            .select('id, paid_on, amount, method, created_at')
            .order('paid_on', { ascending: false })
            .order('created_at', { ascending: false });
          if (!plain.error) {
            salaryPayments = (Array.isArray(plain.data) ? plain.data : []).map((row) => ({
              ...row,
              employee_name: '',
            }));
          }
        } catch (_) { /* keep empty */ }
      } else {
        salaryPayments = [];
      }
      salaryLoaded = true;
    } finally {
      salaryBusy = false;
    }
    renderAll();
  }

  function sumPayCategory(rows, category) {
    return roundMoney(sumAmounts((rows || []).filter((row) => row.category === category)));
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

  async function loadMonthDayReports(ym, force) {
    if (!ym || dayReportsBusyYm === ym) return;
    if (!force && dayReportsByYm[ym] != null) return;
    const sb = getClient();
    const bounds = monthYmdBounds(ym);
    if (!sb || !bounds) {
      dayReportsByYm[ym] = emptyDayReportTotals();
      return;
    }
    dayReportsBusyYm = ym;
    try {
      const { data, error } = await sb
        .from('till_day_reports')
        .select('business_date, cash, credit, tip')
        .gte('business_date', bounds.start)
        .lte('business_date', bounds.end)
        .order('business_date', { ascending: true });
      if (error) throw error;
      dayReportsByYm[ym] = sumDayReports(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[documents] till_day_reports', err);
      dayReportsByYm[ym] = emptyDayReportTotals();
    } finally {
      if (dayReportsBusyYm === ym) dayReportsBusyYm = '';
    }
  }

  async function loadRangeDayReports(fromYmd, toYmd, force) {
    const from = fromYmd || reportFromYmd;
    const to = toYmd || reportToYmd;
    const key = reportRangeKey(from, to);
    if (!from || !to || from > to || dayReportsBusyKey === key) return;
    if (!force && dayReportsByRange[key] != null) {
      if (reportRangeKey() === key) renderReport();
      return;
    }
    const sb = getClient();
    if (!sb) {
      dayReportsByRange[key] = emptyDayReportTotals();
      if (reportRangeKey() === key) renderReport();
      return;
    }
    dayReportsBusyKey = key;
    try {
      const { data, error } = await sb
        .from('till_day_reports')
        .select('business_date, cash, credit, tip')
        .gte('business_date', from)
        .lte('business_date', to)
        .order('business_date', { ascending: true });
      if (error) throw error;
      dayReportsByRange[key] = sumDayReports(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[documents] till_day_reports range', err);
      dayReportsByRange[key] = emptyDayReportTotals();
    } finally {
      if (dayReportsBusyKey === key) dayReportsBusyKey = '';
    }
    if (reportRangeKey() === key) renderReport();
  }

  function expenseBreakdown() {
    const map = new Map();
    DEFAULT_SUPPLIERS.forEach((name) => {
      if (!isZReportSupplier(name)) map.set(name, { name, sum: 0, count: 0 });
    });
    periodExpenseRows().forEach((row) => {
      const name = canonicalSupplier(row.supplier_name);
      if (!name || isZReportSupplier(name)) return;
      if (!map.has(name)) map.set(name, { name, sum: 0, count: 0 });
      const item = map.get(name);
      item.sum += Number(row.amount_total) || 0;
      item.count += 1;
    });
    return [...map.values()]
      .map((item) => ({ name: item.name, sum: roundMoney(item.sum), count: item.count }))
      .filter((item) => DEFAULT_SUPPLIERS.includes(item.name) || item.sum > 0 || item.count > 0)
      .sort((a, b) => {
        const rank = supplierRank(a.name) - supplierRank(b.name);
        if (rank) return rank;
        return a.name.localeCompare(b.name, 'he');
      });
  }

  function renderMonthNav() {
    const ym = activeYm();
    const labelEl = document.getElementById('docs-month-label');
    const nextBtn = document.getElementById('docs-month-next');
    if (labelEl) labelEl.textContent = monthLabel(ym);
    if (nextBtn) nextBtn.disabled = ym >= currentYm();
  }

  function renderReport() {
    ensureReportRange();
    const zSplit = sumZAmounts(periodZRows());
    const expenseRows = periodExpenseRows();
    const cashExpenses = sumPayCategory(expenseRows, 'cash');
    const creditExpenses = sumPayCategory(expenseRows, 'credit');
    const bankExpenses = sumPayCategory(expenseRows, 'bank');
    const expenseTotal = roundMoney(sumAmounts(expenseRows));
    const otherExpenses = roundMoney(expenseTotal - cashExpenses - creditExpenses - bankExpenses);
    const daily = dayReportsByRange[reportRangeKey()];
    const dailyLoaded = Boolean(daily?.loaded);
    const tips = dailyLoaded ? daily.tip : 0;
    const result = roundMoney(zSplit.total - expenseTotal);
    const breakdown = expenseBreakdown();
    const applied = document.getElementById('docs-period-applied');
    if (applied) applied.textContent = periodLabel();

    const salesEl = document.getElementById('docs-fin-sales');
    const cashEl = document.getElementById('docs-fin-cash');
    const creditEl = document.getElementById('docs-fin-credit');
    const tipsEl = document.getElementById('docs-fin-tips');
    const expensesEl = document.getElementById('docs-fin-expenses');
    const resultEl = document.getElementById('docs-fin-result');
    const expCashEl = document.getElementById('docs-fin-exp-cash');
    const expCreditEl = document.getElementById('docs-fin-exp-credit');
    const expBankEl = document.getElementById('docs-fin-exp-bank');
    const expOtherEl = document.getElementById('docs-fin-exp-other');
    const listEl = document.getElementById('docs-expense-break');

    if (salesEl) salesEl.textContent = formatMoney(zSplit.total);
    if (cashEl) cashEl.textContent = formatMoney(zSplit.cash);
    if (creditEl) creditEl.textContent = formatMoney(zSplit.credit);
    if (tipsEl) tipsEl.textContent = dailyLoaded ? formatMoney(tips) : '…';
    if (expensesEl) expensesEl.textContent = formatMoney(expenseTotal);
    if (resultEl) resultEl.textContent = formatMoney(result);
    if (expCashEl) expCashEl.textContent = formatMoney(cashExpenses);
    if (expCreditEl) expCreditEl.textContent = formatMoney(creditExpenses);
    if (expBankEl) expBankEl.textContent = formatMoney(bankExpenses);
    if (expOtherEl) expOtherEl.textContent = formatMoney(otherExpenses);
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
  }

  async function downloadMonthExcel() {
    try {
      ensureReportRange();
      const key = reportRangeKey();
      if (dayReportsByRange[key] == null) {
        await loadRangeDayReports(reportFromYmd, reportToYmd);
      }
      const api = global.LechaimDocsMonthlyXlsx;
      if (typeof api?.downloadMonthlyReportXlsx !== 'function') {
        showError('יצירת הקובץ לא זמינה');
        return;
      }
      const zSplit = sumZAmounts(periodZRows());
      const expenseRows = periodExpenseRows();
      const cashExpenses = sumPayCategory(expenseRows, 'cash');
      const creditExpenses = sumPayCategory(expenseRows, 'credit');
      const bankExpenses = sumPayCategory(expenseRows, 'bank');
      const expense = roundMoney(sumAmounts(expenseRows));
      const otherExpenses = roundMoney(expense - cashExpenses - creditExpenses - bankExpenses);
      const daily = dayReportsByRange[key] || emptyDayReportTotals();
      const breakdown = expenseBreakdown();
      const label = periodLabel() || `${reportFromYmd}_${reportToYmd}`;
      const fileStamp = reportFromYmd === reportToYmd
        ? reportFromYmd
        : `${reportFromYmd}_${reportToYmd}`;
      api.downloadMonthlyReportXlsx(`lechaim-finance-${fileStamp}.xlsx`, {
        title: `סיכום כספי - ${label}`,
        sales: zSplit.total,
        cash: zSplit.cash,
        credit: zSplit.credit,
        tips: daily.tip,
        expense,
        cashExpenses,
        creditExpenses,
        bankExpenses,
        otherExpenses,
        result: roundMoney(zSplit.total - expense),
        suppliers: breakdown.map((item) => ({ name: item.name, sum: item.sum })),
      });
      showToast('הקובץ ירד');
    } catch (err) {
      console.error('[documents] xlsx', err);
      showError(err?.message || 'יצירת האקסל נכשלה');
    }
  }

  async function downloadDocumentsPdf(rows, filename, emptyMessage, buttonId, idleLabel) {
    if (pdfBusy) return;
    if (!rows.length) {
      showError(emptyMessage);
      return;
    }
    const api = global.LechaimDocsMonthlyPdf;
    if (typeof api?.buildMonthlyDocumentsPdf !== 'function' || typeof api?.downloadPdf !== 'function') {
      showError('יצירת ה-PDF לא זמינה');
      return;
    }
    pdfBusy = true;
    showError('');
    setPdfButtonState(true, `מכין PDF… 0/${rows.length}`, buttonId, idleLabel);
    try {
      const bytes = await api.buildMonthlyDocumentsPdf({
        count: rows.length,
        onProgress: (done, total) => {
          setPdfButtonState(true, `מכין PDF… ${done}/${total}`, buttonId, idleLabel);
        },
        getItem: async (index) => {
          const row = rows[index];
          setPdfButtonState(true, `טוען ${index + 1}/${rows.length}`, buttonId, idleLabel);
          const url = await signedUrl(row.storage_path);
          const res = await fetch(url);
          if (!res.ok) {
            throw new Error(
              `לא ניתן לטעון את ${row.supplier_name || 'המסמך'} מתאריך ${formatDateFull(row.document_date)}`
            );
          }
          return {
            mime: row.mime_type || '',
            bytes: new Uint8Array(await res.arrayBuffer()),
          };
        },
      });
      api.downloadPdf(filename, bytes);
      showToast('ה-PDF ירד');
    } catch (err) {
      showError(err?.message || 'יצירת ה-PDF נכשלה');
    } finally {
      pdfBusy = false;
      setPdfButtonState(false, idleLabel, buttonId, idleLabel);
    }
  }

  function monthInvoiceDocuments(ym) {
    return monthDocuments(ym).filter(isInvoiceExportRow);
  }

  function monthZDocuments(ym) {
    return monthDocuments(ym).filter((row) => isZReportSupplier(row.supplier_name) && hasDocumentFile(row));
  }

  function monthManualPayments(ym) {
    return monthDocuments(ym).filter((row) => isManualPaymentSupplier(row.supplier_name));
  }

  async function downloadMonthPdf() {
    const ym = activeYm();
    const label = monthLabel(ym);
    await downloadDocumentsPdf(
      monthInvoiceDocuments(ym),
      `חשבוניות_${label.replace(/\s+/g, '_')}.pdf`,
      'אין חשבוניות עם תמונה בחודש שנבחר',
      'docs-month-pdf',
      'הפק PDF לחודש'
    );
  }

  async function downloadZReportPdf() {
    const ym = activeYm();
    const label = monthLabel(ym);
    await downloadDocumentsPdf(
      monthZDocuments(ym),
      `דוח_Z_${label.replace(/\s+/g, '_')}.pdf`,
      'אין דוח Z עם תמונה בחודש שנבחר',
      'docs-folder-z-pdf',
      'PDF דוח Z'
    );
  }

  function buildManualPaymentsText(ym) {
    const rows = monthManualPayments(ym).slice().sort((a, b) => {
      const dates = String(a.document_date || '').localeCompare(String(b.document_date || ''));
      if (dates) return dates;
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });
    if (!rows.length) return '';
    let cash = 0;
    let credit = 0;
    let bank = 0;
    const lines = [`תשלום ללא קבלה — ${monthLabel(ym)}`, ''];
    rows.forEach((row) => {
      const amount = Number(row.amount_total) || 0;
      if (row.category === 'cash') cash += amount;
      if (row.category === 'credit') credit += amount;
      if (row.category === 'bank') bank += amount;
      const method = payMethodLabel(row.category) || 'תשלום';
      const note = String(row.notes || '').trim();
      lines.push(
        [formatDateFull(row.document_date), method, formatMoney(amount), note]
          .filter(Boolean)
          .join('  ')
      );
    });
    lines.push(
      '',
      `סה״כ מזומן ${formatMoney(cash)}`,
      `סה״כ אשראי ${formatMoney(credit)}`,
      `סה״כ העברה בנקאית ${formatMoney(bank)}`,
      `סה״כ ${formatMoney(cash + credit + bank)}`
    );
    return lines.join('\n');
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) { /* fall through */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (_) {
      return false;
    }
  }

  async function copyManualPaymentsText() {
    const text = buildManualPaymentsText(activeYm());
    if (!text) {
      showError('אין תשלומים ללא קבלה בחודש שנבחר');
      return;
    }
    showError('');
    const ok = await copyText(text);
    if (ok) showToast('תשלומים ללא קבלה הועתקו');
    else showError('לא ניתן להעתיק את הטקסט');
  }

  function renderAll() {
    if (!selectedYm) selectedYm = currentYm();
    renderMonthNav();
    renderSuppliers();
    renderFolder();
    renderReport();
    applyLayout();
  }

  function closeScanOverlay() {
    revokePreviewUrl();
    pendingFile = null;
    editingId = null;
    pendingPayMethod = '';
    setManualFormVisible(false);
    setPayFieldsVisible(false);
    setPayBankVisible(true);
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
    const supplier = canonicalSupplier(scanSupplier || activeSupplier || '');
    const manual = isManualPaymentSupplier(supplier);
    const general = isGeneralInvoiceSupplier(supplier);
    const zReport = isZReportSupplier(supplier);
    if (formTitleEl) {
      formTitleEl.textContent = editingId
        ? 'עריכה'
        : (manual ? MANUAL_PAYMENT_SUPPLIER : (zReport ? 'דוח Z' : (supplier || 'חשבונית')));
    }
    const hint = document.getElementById('docs-form-supplier');
    if (hint) hint.hidden = true;
    setManualFormVisible(manual || general);
    setPayFieldsVisible(!zReport);
    setPayBankVisible(!zReport && !general);
    setZFormVisible(zReport && !manual);
    setScanStep('form');
    window.setTimeout(() => (
      (manual || general)
        ? document.getElementById('docs-field-notes')?.focus()
        : (zReport
          ? document.getElementById('docs-field-cash')?.focus()
          : document.getElementById('docs-field-total')?.focus())
    ), 80);
  }

  function openManualPaymentForm() {
    scanSupplier = MANUAL_PAYMENT_SUPPLIER;
    rememberSupplier(MANUAL_PAYMENT_SUPPLIER);
    editingId = null;
    pendingFile = null;
    revokePreviewUrl();
    resetForm();
    setManualFormVisible(true);
    goToForm();
    openScanOverlay();
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
    const editBtn = document.getElementById('docs-view-edit');
    const deleteBtn = document.getElementById('docs-view-delete');
    const downloadBtn = document.getElementById('docs-view-download');
    const moveBtn = document.getElementById('docs-view-move');
    if (editBtn) editBtn.hidden = false;
    if (deleteBtn) deleteBtn.hidden = false;
    if (downloadBtn) downloadBtn.hidden = false;
    if (moveBtn) moveBtn.hidden = false;
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
    const suppliers = buildSuppliers().filter((item) => (
      !isManualPaymentSupplier(item.name)
      && !isSalarySupplier(item.name)
    ));
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
    const key = canonicalSupplier(name);
    if (!key) {
      showError('בחרו ספק תחילה');
      return;
    }
    scanSupplier = key;
    rememberSupplier(key);
    if (isSalarySupplier(key)) {
      showError('משכורות מגיעות מתשלומים שנרשמו בשעות עובדים');
      return;
    }
    if (isManualPaymentSupplier(key)) {
      openManualPaymentForm();
      return;
    }
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

  function findRow(id) {
    return cache.find((item) => item.id === id)
      || salaryDocRows().find((item) => item.id === id)
      || null;
  }

  async function openDocument(id) {
    const row = findRow(id);
    if (!row) return;
    showError('');
    const downloadBtn = document.getElementById('docs-view-download');
    const moveBtn = document.getElementById('docs-view-move');
    const editBtn = document.getElementById('docs-view-edit');
    const deleteBtn = document.getElementById('docs-view-delete');
    const salary = row.source === 'salary' || isSalarySupplier(row.supplier_name);
    try {
      const folder = canonicalSupplier(row.supplier_name);
      if (viewTitleEl) viewTitleEl.textContent = salary ? (row.notes || 'משכורת') : (folder || 'חשבונית');
      if (viewMetaEl) {
        viewMetaEl.textContent = salary
          ? [
            row.notes || 'עובד',
            formatDateFull(row.document_date),
            formatMoney(row.amount_total),
            row.category === 'bank' ? 'בנק' : 'מזומן',
          ].filter(Boolean).join(' · ')
          : [
            folder,
            formatDateFull(row.document_date),
            formatMoney(row.amount_total),
            isZReportSupplier(row.supplier_name)
              ? `מזומן ${formatMoney(zAmounts(row).cash)} · אשראי ${formatMoney(zAmounts(row).credit)}`
              : payMethodLabel(row.category),
            row.notes || '',
          ].filter(Boolean).join(' · ');
      }
      if (downloadBtn) downloadBtn.hidden = salary || !hasDocumentFile(row);
      if (moveBtn) moveBtn.hidden = salary || isManualPaymentSupplier(row.supplier_name);
      if (editBtn) editBtn.hidden = salary;
      if (deleteBtn) deleteBtn.hidden = salary;
      if (viewFrameEl) {
        viewFrameEl.innerHTML = '';
        if (salary || !hasDocumentFile(row)) {
          const box = document.createElement('p');
          box.className = 'docs-view-note';
          box.textContent = salary
            ? `${row.notes || 'עובד'} · ${row.category === 'bank' ? 'בנק' : 'מזומן'} · ${formatMoney(row.amount_total)}`
            : (row.notes
              ? `${payMethodLabel(row.category) || 'תשלום'} · ${row.notes}`
              : (payMethodLabel(row.category) || 'תשלום בלי תמונה'));
          viewFrameEl.appendChild(box);
        } else {
          const url = await signedUrl(row.storage_path);
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
    if (!row || !hasDocumentFile(row)) return;
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
    const row = findRow(id);
    if (!row || row.source === 'salary' || isSalarySupplier(row.supplier_name)) return;
    editingId = id;
    pendingFile = null;
    scanSupplier = canonicalSupplier(row.supplier_name);
    revokePreviewUrl();
    resetForm();
    const dateEl = document.getElementById('docs-field-date');
    const totalEl = document.getElementById('docs-field-total');
    const notesEl = document.getElementById('docs-field-notes');
    if (dateEl) dateEl.value = row.document_date || todayYmd();
    if (totalEl) totalEl.value = row.amount_total ?? '';
    if (notesEl) notesEl.value = row.notes || '';
    const cashEl = document.getElementById('docs-field-cash');
    const creditEl = document.getElementById('docs-field-credit');
    if (isZReportSupplier(row.supplier_name)) {
      const split = zAmounts(row);
      if (cashEl) cashEl.value = split.hasSplit || split.total ? String(split.cash) : '';
      if (creditEl) creditEl.value = split.hasSplit || split.total ? String(split.credit) : '';
      if (!split.hasSplit && split.total && cashEl && creditEl) {
        cashEl.value = '';
        creditEl.value = '';
        if (totalEl) totalEl.value = split.total;
      }
      syncZTotal();
    } else {
      if (cashEl) cashEl.value = '';
      if (creditEl) creditEl.value = '';
    }
    pendingPayMethod = normalizePayMethod(row.category);
    setPayMethodHighlight(pendingPayMethod);
    goToForm();
    openScanOverlay();
  }

  async function deleteDocument(id) {
    const row = findRow(id);
    if (!row || row.source === 'salary' || isSalarySupplier(row.supplier_name)) return;
    const ok = await askDeleteConfirm(row);
    if (!ok) return;
    const sb = getClient();
    if (!sb) {
      showError('Supabase לא מחובר');
      return;
    }
    try {
      const path = String(row?.storage_path || '').trim();
      const bucket = String(row?.storage_bucket || BUCKET).trim() || BUCKET;
      if (path) {
        const { error: storageError } = await sb.storage.from(bucket).remove([path]);
        if (storageError) {
          const msg = String(storageError.message || storageError.error || '');
          if (!/not found|not_found|does not exist/i.test(msg)) throw storageError;
        }
      }
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
      const msg = String(err?.message || '');
      if (/Direct deletion from storage/i.test(msg)) {
        showError('המחיקה דורשת עדכון SQL — הריצו supabase-business-documents-delete-fix.sql ב-Supabase.');
      } else {
        showError(msg || 'המחיקה נכשלה');
      }
    }
  }

  async function moveDocument(id, newSupplier) {
    const row = cache.find((item) => item.id === id);
    if (!row) return;
    const target = canonicalSupplier(newSupplier);
    if (!target) return;
    if (canonicalSupplier(row.supplier_name) === target) {
      showToast('כבר באותו ספק');
      return;
    }
    if (isSalarySupplier(row.supplier_name) || isSalarySupplier(target)) {
      showError('משכורות מגיעות משעות עובדים ולא ניתנות להעברה');
      return;
    }
    if (isManualPaymentSupplier(row.supplier_name) || isManualPaymentSupplier(target)) {
      showError('תשלום ללא קבלה נשאר בתיקייה שלו');
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
    const notes = String(document.getElementById('docs-field-notes')?.value || '').trim();
    return {
      date: date || null,
      total: raw && Number.isFinite(total) ? total : null,
      notes,
      method: normalizePayMethod(pendingPayMethod),
      cash: readMoneyField('docs-field-cash'),
      credit: readMoneyField('docs-field-credit'),
    };
  }

  async function saveDocument(event) {
    event.preventDefault();
    if (busy) return;
    const simple = readSimpleForm();
    const supplier = canonicalSupplier(scanSupplier || activeSupplier);
    if (!supplier) {
      showFormError(formErrorEl, 'חסר ספק');
      return;
    }
    if (isSalarySupplier(supplier)) {
      showFormError(formErrorEl, 'משכורות מגיעות משעות עובדים');
      return;
    }
    if (!simple.date) {
      showFormError(formErrorEl, 'בחרו תאריך');
      return;
    }
    const manual = isManualPaymentSupplier(supplier);
    const general = isGeneralInvoiceSupplier(supplier);
    const zReport = isZReportSupplier(supplier);
    if (zReport) {
      if (simple.cash == null || simple.credit == null) {
        showFormError(formErrorEl, 'הזינו סכום במזומן ובאשראי');
        return;
      }
      simple.total = roundMoney(simple.cash + simple.credit);
    } else if (simple.total == null || simple.total < 0) {
      showFormError(formErrorEl, 'הזינו סכום סופי');
      return;
    }
    if ((manual || general) && !simple.notes) {
      showFormError(formErrorEl, 'כתבו על מה יצא התשלום');
      return;
    }
    if (general && simple.method !== 'cash' && simple.method !== 'credit') {
      showFormError(formErrorEl, 'בחרו מזומן או אשראי');
      return;
    }
    if (!zReport && !simple.method) {
      showFormError(formErrorEl, 'בחרו מזומן, אשראי או העברה בנקאית');
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
      const userId = await currentAuthUserId(sb);
      if (!userId) {
        showFormError(formErrorEl, 'יש להתחבר לאדמין');
        return;
      }
      if (editingId) {
        const existing = cache.find((item) => item.id === editingId);
        const zSplit = zReport ? encodeZSplit(simple.cash, simple.credit) : '';
        const data = await insertBusinessDocument(sb, {
          id: editingId,
          document_date: simple.date,
          amount_total: simple.total,
          amount_before_vat: zReport ? simple.cash : existing?.amount_before_vat,
          vat_amount: zReport ? simple.credit : existing?.vat_amount,
          supplier_name: supplier,
          notes: (manual || general) ? simple.notes : (existing?.notes || ''),
          category: zReport ? zSplit : simple.method,
          status: 'saved',
        }, true);
        upsertCache(data);
        renderAll();
        closeScanOverlay();
        showToast('עודכן');
        return;
      }
      if (manual) {
        const id = global.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const row = {
          id,
          storage_bucket: BUCKET,
          storage_path: null,
          original_filename: '',
          mime_type: '',
          file_size_bytes: null,
          document_type: 'manual_payment',
          category: simple.method,
          supplier_name: MANUAL_PAYMENT_SUPPLIER,
          document_number: '',
          document_date: simple.date,
          currency: 'EUR',
          amount_before_vat: null,
          vat_amount: null,
          amount_total: simple.total,
          notes: simple.notes,
          status: 'saved',
          ocr_status: 'none',
          ocr_raw: null,
          created_by: userId,
        };
        const data = await insertBusinessDocument(sb, row);
        upsertCache(data);
        await persistSupplier(MANUAL_PAYMENT_SUPPLIER).catch(() => {});
        openFolder(MANUAL_PAYMENT_SUPPLIER);
        closeScanOverlay();
        showToast('✓ נשמר');
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
        category: zReport ? encodeZSplit(simple.cash, simple.credit) : simple.method,
        supplier_name: supplier,
        document_number: '',
        document_date: simple.date,
        currency: 'EUR',
        amount_before_vat: zReport ? simple.cash : null,
        vat_amount: zReport ? simple.credit : null,
        amount_total: simple.total,
        notes: general ? simple.notes : '',
        status: 'saved',
        ocr_status: 'none',
        ocr_raw: null,
        created_by: userId,
      };
      let data;
      try {
        data = await insertBusinessDocument(sb, row);
      } catch (insErr) {
        try { await sb.storage.from(BUCKET).remove([path]); } catch (_) { /* keep going */ }
        throw insErr;
      }
      upsertCache(data);
      rememberSupplier(supplier);
      persistSupplier(supplier).catch(() => {});
      openFolder(supplier);
      closeScanOverlay();
      showToast('✓ נשמר');
    } catch (err) {
      console.error('[documents] save', err);
      if (isMissingManualPaymentSupport(err) || isMissingSuppliersTable(err)) {
        showFormError(formErrorEl, 'יש להריץ את supabase-business-documents-suppliers-and-manual.sql ב-SQL Editor של Supabase');
      } else if (err?.code === 'not_unlocked' || err?.code === 'not_authenticated') {
        showFormError(formErrorEl, 'אין הרשאה לשמור. נעלו ופתחו שוב את כספת המסמכים.');
      } else if (isRlsSaveError(err) || isSingleCoerceError(err)) {
        showFormError(formErrorEl, 'אין הרשאה לשמור. הריצו supabase-business-documents-insert-fix.sql ואז נעלו ופתחו שוב את הכספת.');
      } else {
        showFormError(formErrorEl, err?.message || 'השמירה נכשלה');
      }
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
    dayReportsByYm = {};
    dayReportsBusyYm = '';
    salaryPayments = [];
    salaryLoaded = false;
    salaryBusy = false;
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
      await loadCatalogSuppliers();
      await loadRows();
      await loadSalaryPayments(true);
      startRealtime();
    } catch (err) {
      console.error('[documents] unlock', err);
      showFormError(vaultFormError, err?.message || 'הכניסה נכשלה');
    } finally {
      busy = false;
    }
  }

  async function submitNewSupplier(event) {
    event.preventDefault();
    const name = supplierKey(newNameInput?.value);
    if (!name) {
      showFormError(newFormError, 'הזינו שם ספק');
      return;
    }
    if (isReservedSupplier(name) || DEFAULT_SUPPLIERS.includes(canonicalSupplier(name))) {
      showFormError(newFormError, 'השם הזה כבר שמור במערכת');
      return;
    }
    const thenScan = newThenScan;
    try {
      await persistSupplier(name);
    } catch (err) {
      showFormError(newFormError, err?.message || 'לא ניתן לשמור את הספק');
      return;
    }
    closeNewModal();
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
        downloadMonthExcel().catch(() => {});
        return;
      }
      if (event.target.closest('#docs-month-pdf')) {
        downloadMonthPdf().catch(() => {});
        return;
      }
      if (event.target.closest('#docs-folder-z-pdf')) {
        downloadZReportPdf().catch(() => {});
        return;
      }
      if (event.target.closest('#docs-folder-copy-pay')) {
        copyManualPaymentsText().catch(() => {});
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
    document.getElementById('docs-field-cash')?.addEventListener('input', syncZTotal);
    document.getElementById('docs-field-credit')?.addEventListener('input', syncZTotal);

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

    newForm?.addEventListener('submit', (event) => {
      submitNewSupplier(event).catch(() => {});
    });
    document.getElementById('docs-period-form')?.addEventListener('submit', (event) => {
      applyReportPeriod(event);
    });
    document.querySelectorAll('[data-docs-period-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setReportMode(btn.getAttribute('data-docs-period-mode') || 'month');
      });
    });
    document.getElementById('docs-add-payment')?.addEventListener('click', () => {
      openManualPaymentForm();
    });
    document.querySelectorAll('[data-docs-pay]').forEach((btn) => {
      btn.addEventListener('click', () => {
        pendingPayMethod = btn.getAttribute('data-docs-pay') || '';
        setPayMethodHighlight(pendingPayMethod);
      });
    });
    document.getElementById('docs-new-cancel')?.addEventListener('click', closeNewModal);
    document.getElementById('docs-new-backdrop')?.addEventListener('click', closeNewModal);

    document.getElementById('docs-delete-yes')?.addEventListener('click', () => {
      confirmDeleteClick().catch(() => {});
    });
    document.getElementById('docs-delete-code')?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      confirmDeleteClick().catch(() => {});
    });
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
      await loadCatalogSuppliers();
      await loadRows();
      await loadSalaryPayments(true);
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
