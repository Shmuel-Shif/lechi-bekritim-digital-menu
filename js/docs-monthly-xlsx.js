/**
 * LECHAIM — Client-side .xlsx for documents monthly report.
 * ZIP STORE (no compression). Isolated from till / orders.
 */
(function (root) {
  'use strict';

  const CRC_TABLE = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    CRC_TABLE[i] = c >>> 0;
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function u16(n) {
    const b = new Uint8Array(2);
    b[0] = n & 0xff;
    b[1] = (n >>> 8) & 0xff;
    return b;
  }

  function u32(n) {
    const b = new Uint8Array(4);
    b[0] = n & 0xff;
    b[1] = (n >>> 8) & 0xff;
    b[2] = (n >>> 16) & 0xff;
    b[3] = (n >>> 24) & 0xff;
    return b;
  }

  function concat(parts) {
    const size = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(size);
    let offset = 0;
    parts.forEach((p) => {
      out.set(p, offset);
      offset += p.length;
    });
    return out;
  }

  function utf8(str) {
    return new TextEncoder().encode(str);
  }

  function xmlSafe(str) {
    return String(str == null ? '' : str).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }

  function xmlEscape(str) {
    return xmlSafe(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function zipStore(files) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    files.forEach((file) => {
      const nameBytes = utf8(file.name);
      const data = file.data;
      const crc = crc32(data);
      const local = concat([
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0), nameBytes, data,
      ]);
      const central = concat([
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset),
        nameBytes,
      ]);
      locals.push(local);
      centrals.push(central);
      offset += local.length;
    });
    const centralBlob = concat(centrals);
    const eocd = concat([
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(centralBlob.length), u32(offset), u16(0),
    ]);
    return concat([...locals, centralBlob, eocd]);
  }

  function money(n) {
    const v = Number(n);
    return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
  }

  function createSharedStrings() {
    const list = [];
    const indexOf = new Map();
    function add(text) {
      const value = xmlSafe(text);
      if (indexOf.has(value)) return indexOf.get(value);
      const idx = list.length;
      indexOf.set(value, idx);
      list.push(value);
      return idx;
    }
    function xml() {
      const items = list.map((item) => `<si><t xml:space="preserve">${xmlEscape(item)}</t></si>`).join('');
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${list.length}" uniqueCount="${list.length}">${items}</sst>`;
    }
    return { add, xml };
  }

  function sCell(sst, ref, text, style) {
    const s = style != null ? ` s="${style}"` : '';
    return `<c r="${ref}" t="s"${s}><v>${sst.add(text)}</v></c>`;
  }

  function numCell(ref, value, style) {
    const s = style != null ? ` s="${style}"` : '';
    return `<c r="${ref}" t="n"${s}><v>${money(value)}</v></c>`;
  }

  function buildMonthlyReportXlsxBytes(payload) {
    const sst = createSharedStrings();
    const title = payload?.title || 'סיכום כספי';
    const sales = money(payload?.sales != null ? payload.sales : payload?.income);
    const cash = money(payload?.cash);
    const credit = money(payload?.credit);
    const tips = money(payload?.tips);
    const expense = money(payload?.expense);
    const cashExpenses = money(payload?.cashExpenses);
    const creditExpenses = money(payload?.creditExpenses);
    const bankExpenses = money(payload?.bankExpenses);
    const otherExpenses = money(
      payload?.otherExpenses != null
        ? payload.otherExpenses
        : (expense - cashExpenses - creditExpenses - bankExpenses)
    );
    const result = money(payload?.result != null ? payload.result : (sales - expense));
    const rows = Array.isArray(payload?.suppliers) ? payload.suppliers : [];

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`;

    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

    const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <workbookPr/>
  <sheets>
    <sheet name="Summary" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

    const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="&quot;€&quot;#,##0.00"/>
  </numFmts>
  <fonts count="4">
    <font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="16"/><color rgb="FF1E3354"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FF1E3354"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1E3354"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF3EDE3"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFE5DDD0"/></left>
      <right style="thin"><color rgb="FFE5DDD0"/></right>
      <top style="thin"><color rgb="FFE5DDD0"/></top>
      <bottom style="thin"><color rgb="FFE5DDD0"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;

    const xmlRows = [];
    xmlRows.push(`<row r="1">${sCell(sst, 'A1', title, 1)}</row>`);
    xmlRows.push('<row r="2"/>');
    xmlRows.push(`<row r="3">${sCell(sst, 'A3', 'סה״כ מכירות')}${numCell('B3', sales, 3)}</row>`);
    xmlRows.push(`<row r="4">${sCell(sst, 'A4', 'מזומן')}${numCell('B4', cash, 3)}</row>`);
    xmlRows.push(`<row r="5">${sCell(sst, 'A5', 'אשראי')}${numCell('B5', credit, 3)}</row>`);
    xmlRows.push(`<row r="6">${sCell(sst, 'A6', 'טיפים')}${numCell('B6', tips, 3)}</row>`);
    xmlRows.push(`<row r="7">${sCell(sst, 'A7', 'סה״כ הוצאות')}${numCell('B7', expense, 3)}</row>`);
    xmlRows.push('<row r="8"/>');
    xmlRows.push(`<row r="9">${sCell(sst, 'A9', 'מכירות פחות הוצאות', 4)}${numCell('B9', result, 4)}</row>`);
    xmlRows.push('<row r="10"/>');
    xmlRows.push(`<row r="11">${sCell(sst, 'A11', 'הוצאות מזומן')}${numCell('B11', cashExpenses, 3)}</row>`);
    xmlRows.push(`<row r="12">${sCell(sst, 'A12', 'הוצאות אשראי')}${numCell('B12', creditExpenses, 3)}</row>`);
    xmlRows.push(`<row r="13">${sCell(sst, 'A13', 'הוצאות בנקאיות')}${numCell('B13', bankExpenses, 3)}</row>`);
    xmlRows.push(`<row r="14">${sCell(sst, 'A14', 'הוצאות ללא אמצעי תשלום')}${numCell('B14', otherExpenses, 3)}</row>`);
    xmlRows.push('<row r="15"/>');
    xmlRows.push(`<row r="16">${sCell(sst, 'A16', 'ספק', 2)}${sCell(sst, 'B16', 'סה״כ', 2)}</row>`);

    rows.forEach((row, idx) => {
      const r = 17 + idx;
      xmlRows.push(`<row r="${r}">${sCell(sst, `A${r}`, row.name || '—')}${numCell(`B${r}`, row.sum, 3)}</row>`);
    });

    const lastRow = Math.max(16, 16 + rows.length);
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:B${lastRow}"/>
  <sheetViews>
    <sheetView workbookViewId="0" rightToLeft="1"/>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>
    <col min="1" max="1" width="32" customWidth="1"/>
    <col min="2" max="2" width="18" customWidth="1"/>
  </cols>
  <sheetData>
    ${xmlRows.join('\n    ')}
  </sheetData>
</worksheet>`;

    return zipStore([
      { name: '[Content_Types].xml', data: utf8(contentTypes) },
      { name: '_rels/.rels', data: utf8(rels) },
      { name: 'xl/workbook.xml', data: utf8(workbook) },
      { name: 'xl/_rels/workbook.xml.rels', data: utf8(workbookRels) },
      { name: 'xl/styles.xml', data: utf8(styles) },
      { name: 'xl/sharedStrings.xml', data: utf8(sst.xml()) },
      { name: 'xl/worksheets/sheet1.xml', data: utf8(sheet) },
    ]);
  }

  function downloadMonthlyReportXlsx(filename, payload) {
    const bytes = buildMonthlyReportXlsxBytes(payload);
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const blob = new Blob([copy], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'lechaim-finance.xlsx';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    return bytes;
  }

  const api = { buildMonthlyReportXlsxBytes, downloadMonthlyReportXlsx };
  root.LechaimDocsMonthlyXlsx = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
