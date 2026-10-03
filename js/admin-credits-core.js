/**
 * LECHAIM — Pure helpers for document income credits (זיכויים).
 * Browser + Node (tests). No DOM / network.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.LechaimAdminCreditsCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const CREDIT_SUPPLIER = 'זיכויים';
  const CREDIT_DOCUMENT_TYPE = 'income_credit';
  const PAY_METHODS = ['cash', 'credit', 'bank'];

  function isCreditSupplier(name) {
    return String(name || '').trim() === CREDIT_SUPPLIER;
  }

  function isCreditDocument(row) {
    if (!row || typeof row !== 'object') return false;
    if (String(row.document_type || '') === CREDIT_DOCUMENT_TYPE) return true;
    return isCreditSupplier(row.supplier_name);
  }

  function normalizePayMethod(value) {
    const method = String(value || '').trim().toLowerCase();
    return PAY_METHODS.includes(method) ? method : '';
  }

  function payMethodLabel(value) {
    const method = normalizePayMethod(value);
    if (method === 'cash') return 'מזומן';
    if (method === 'credit') return 'אשראי';
    if (method === 'bank') return 'חשבון בנק';
    return '';
  }

  function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function validateCreditInput(input) {
    const date = String(input?.document_date || input?.date || '').trim();
    const amount = Number(input?.amount_total != null ? input.amount_total : input?.amount);
    const notes = String(input?.notes != null ? input.notes : (input?.description || '')).trim();
    const method = normalizePayMethod(input?.category || input?.payment_method || input?.method);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { ok: false, error: 'חסר תאריך' };
    }
    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false, error: 'חסר סכום' };
    }
    if (!notes) {
      return { ok: false, error: 'חסר תיאור' };
    }
    if (!method) {
      return { ok: false, error: 'בחרו אופן קבלת הכסף' };
    }
    return {
      ok: true,
      credit: {
        document_date: date,
        amount_total: roundMoney(amount),
        notes: notes.slice(0, 2000),
        category: method,
        supplier_name: CREDIT_SUPPLIER,
        document_type: CREDIT_DOCUMENT_TYPE,
      },
    };
  }

  function buildCreditDocument(input, userId) {
    const checked = validateCreditInput(input);
    if (!checked.ok) return checked;
    const id = String(input?.id || '').trim();
    const storagePath = input?.storage_path == null ? null : String(input.storage_path).trim() || null;
    const originalFilename = storagePath
      ? String(input?.original_filename || '').trim()
      : '';
    const mimeType = storagePath ? String(input?.mime_type || '').trim() : '';
    const fileSize = storagePath && Number.isFinite(Number(input?.file_size_bytes))
      ? Number(input.file_size_bytes)
      : null;
    return {
      ok: true,
      row: {
        id: id || undefined,
        storage_bucket: 'business-documents',
        storage_path: storagePath,
        original_filename: originalFilename,
        mime_type: mimeType,
        file_size_bytes: fileSize,
        document_type: CREDIT_DOCUMENT_TYPE,
        category: checked.credit.category,
        supplier_name: CREDIT_SUPPLIER,
        document_number: '',
        document_date: checked.credit.document_date,
        currency: 'EUR',
        amount_before_vat: null,
        vat_amount: null,
        amount_total: checked.credit.amount_total,
        notes: checked.credit.notes,
        status: 'saved',
        ocr_status: 'none',
        ocr_raw: null,
        created_by: userId || null,
      },
    };
  }

  function sumCreditsByMethod(rows) {
    const out = { cash: 0, credit: 0, bank: 0, total: 0 };
    (rows || []).forEach((row) => {
      if (!isCreditDocument(row)) return;
      if (String(row.status || '') === 'archived') return;
      const method = normalizePayMethod(row.category);
      if (!method) return;
      const amount = roundMoney(row.amount_total);
      out[method] = roundMoney(out[method] + amount);
      out.total = roundMoney(out.total + amount);
    });
    return out;
  }

  function excludeCreditsFromExpenses(rows) {
    return (rows || []).filter((row) => !isCreditDocument(row));
  }

  function reportIncomeWithCredits(zSales, creditRows) {
    const z = {
      cash: roundMoney(zSales?.cash),
      credit: roundMoney(zSales?.credit),
      total: roundMoney(zSales?.total != null
        ? zSales.total
        : (Number(zSales?.cash) || 0) + (Number(zSales?.credit) || 0)),
    };
    const credits = sumCreditsByMethod(creditRows);
    return {
      sales: z.total,
      salesCash: z.cash,
      salesCredit: z.credit,
      credits,
      incomeCash: roundMoney(z.cash + credits.cash),
      incomeCredit: roundMoney(z.credit + credits.credit),
      incomeBank: credits.bank,
      incomeTotal: roundMoney(z.total + credits.total),
    };
  }

  function creditDisplayMeta(row) {
    if (!isCreditDocument(row)) return null;
    return {
      kindLabel: 'זיכוי',
      date: String(row.document_date || ''),
      amount: roundMoney(row.amount_total),
      description: String(row.notes || '').trim(),
      paymentLabel: payMethodLabel(row.category),
      paymentMethod: normalizePayMethod(row.category),
    };
  }

  return {
    CREDIT_SUPPLIER,
    CREDIT_DOCUMENT_TYPE,
    PAY_METHODS,
    isCreditSupplier,
    isCreditDocument,
    normalizePayMethod,
    payMethodLabel,
    validateCreditInput,
    buildCreditDocument,
    sumCreditsByMethod,
    excludeCreditsFromExpenses,
    reportIncomeWithCredits,
    creditDisplayMeta,
  };
});
