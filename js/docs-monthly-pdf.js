/**
 * LECHAIM — Client-side monthly documents PDF.
 * Uses pdf-lib (loaded on demand). Isolated from till / orders / print.
 */
(function (root) {
  'use strict';

  const PDF_LIB_SRC = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
  const A4 = { w: 595.28, h: 841.89 };
  let loadingLib = null;

  function loadPdfLib() {
    if (root.PDFLib && typeof root.PDFLib.PDFDocument?.create === 'function') {
      return Promise.resolve(root.PDFLib);
    }
    if (loadingLib) return loadingLib;
    loadingLib = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = PDF_LIB_SRC;
      script.async = true;
      script.onload = () => {
        if (!root.PDFLib || typeof root.PDFLib.PDFDocument?.create !== 'function') {
          loadingLib = null;
          reject(new Error('ספריית PDF לא נטענה'));
          return;
        }
        resolve(root.PDFLib);
      };
      script.onerror = () => {
        loadingLib = null;
        reject(new Error('לא ניתן לטעון את ספריית ה-PDF'));
      };
      document.head.appendChild(script);
    });
    return loadingLib;
  }

  function yieldUi() {
    return new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });
  }

  async function imageBytesToJpeg(bytes, mime) {
    const blob = new Blob([bytes], { type: mime || 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('לא ניתן לקרוא את התמונה'));
        el.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      if (!canvas.width || !canvas.height) throw new Error('תמונה לא תקינה');
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const jpeg = await new Promise((resolve, reject) => {
        canvas.toBlob((out) => {
          if (!out) reject(new Error('המרת התמונה נכשלה'));
          else resolve(out);
        }, 'image/jpeg', 0.92);
      });
      return new Uint8Array(await jpeg.arrayBuffer());
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function addFittedImagePage(pdf, image) {
    const landscape = image.width > image.height;
    const pageW = landscape ? A4.h : A4.w;
    const pageH = landscape ? A4.w : A4.h;
    const page = pdf.addPage([pageW, pageH]);
    const margin = 18;
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;
    const scale = Math.min(maxW / image.width, maxH / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    page.drawImage(image, {
      x: (pageW - w) / 2,
      y: (pageH - h) / 2,
      width: w,
      height: h,
    });
  }

  async function embedImage(pdf, bytes, mime) {
    const type = String(mime || '').toLowerCase();
    if (type === 'image/jpeg' || type === 'image/jpg') {
      try {
        return await pdf.embedJpg(bytes);
      } catch (_) {
        const jpeg = await imageBytesToJpeg(bytes, 'image/jpeg');
        return pdf.embedJpg(jpeg);
      }
    }
    if (type === 'image/png') {
      try {
        return await pdf.embedPng(bytes);
      } catch (_) {
        const jpeg = await imageBytesToJpeg(bytes, 'image/png');
        return pdf.embedJpg(jpeg);
      }
    }
    const jpeg = await imageBytesToJpeg(bytes, type || 'image/webp');
    return pdf.embedJpg(jpeg);
  }

  async function buildMonthlyDocumentsPdf(opts) {
    const getItem = opts?.getItem;
    const count = Number(opts?.count) || 0;
    const onProgress = typeof opts?.onProgress === 'function' ? opts.onProgress : null;
    if (typeof getItem !== 'function' || count < 1) {
      throw new Error('אין מסמכים לייצוא');
    }

    const PDFLib = await loadPdfLib();
    const pdf = await PDFLib.PDFDocument.create();

    for (let i = 0; i < count; i += 1) {
      if (onProgress) onProgress(i + 1, count, 'build');
      const item = await getItem(i);
      const mime = String(item?.mime || '').toLowerCase();
      const bytes = item?.bytes;
      if (!bytes || !bytes.length) {
        throw new Error(item?.error || 'מסמך ריק');
      }
      if (mime === 'application/pdf') {
        const src = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
        const copied = await pdf.copyPages(src, src.getPageIndices());
        copied.forEach((page) => pdf.addPage(page));
      } else {
        const image = await embedImage(pdf, bytes, mime);
        addFittedImagePage(pdf, image);
      }
      await yieldUi();
    }

    if (pdf.getPageCount() < 1) throw new Error('אין מסמכים בחודש שנבחר');
    return pdf.save();
  }

  function downloadPdf(filename, bytes) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'documents.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  const api = { loadPdfLib, buildMonthlyDocumentsPdf, downloadPdf };
  root.LechaimDocsMonthlyPdf = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
