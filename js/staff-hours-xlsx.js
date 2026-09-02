/**
 * LECHAIM — Client-side .xlsx builder for staff payroll summary.
 * ZIP STORE (no compression). No backend. Isolated from orders / print.
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

  function xmlEscape(str) {
    return String(str == null ? '' : str)
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
        u32(0x04034b50),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        nameBytes,
        data,
      ]);
      const central = concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes,
      ]);
      locals.push(local);
      centrals.push(central);
      offset += local.length;
    });
    const centralBlob = concat(centrals);
    const eocd = concat([
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(files.length),
      u16(files.length),
      u32(centralBlob.length),
      u32(offset),
      u16(0),
    ]);
    return concat([...locals, centralBlob, eocd]);
  }

  function colLetter(n) {
    let s = '';
    let x = n;
    while (x > 0) {
      const m = (x - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      x = Math.floor((x - 1) / 26);
    }
    return s;
  }

  function inlineCell(ref, text, style) {
    const s = style ? ` s="${style}"` : '';
    return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
  }

  function numCell(ref, value, style) {
    const s = style ? ` s="${style}"` : '';
    return `<c r="${ref}" t="n"${s}><v>${value}</v></c>`;
  }

  function buildPayrollXlsxBytes(payload) {
    const period = payload?.period || '';
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

    const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="סיכום" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

    const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2">
    <numFmt numFmtId="164" formatCode="0.00"/>
    <numFmt numFmtId="165" formatCode="&quot;€&quot;#,##0.00"/>
  </numFmts>
  <fonts count="4">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="16"/><name val="Calibri"/><color rgb="FF1E3354"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF1E3354"/></font>
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
  <cellStyleXfs count="1"><xf/></cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="165" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;

    const headers = ['עובד', 'תפקיד', 'ימי עבודה', 'שעות בפועל', 'שעות במסגרת', 'שעות מעבר', '€/שעה', 'תשלום במסגרת', 'תשלום מחוץ למסגרת', 'סה״כ'];
    const xmlRows = [];

    xmlRows.push(`<row r="1" ht="24" customHeight="1">${inlineCell('A1', 'סיכום שעות עובדים', 1)}</row>`);
    xmlRows.push(`<row r="2">${inlineCell('A2', 'Lechaim', 1)}</row>`);
    xmlRows.push(`<row r="3">${inlineCell('A3', `תקופה: ${period}`)}</row>`);
    xmlRows.push('<row r="4"/>');

    xmlRows.push(`<row r="5" ht="20" customHeight="1">${headers.map((h, i) => inlineCell(`${colLetter(i + 1)}5`, h, 2)).join('')}</row>`);

    rows.forEach((row, idx) => {
      const r = 6 + idx;
      const cells = [
        inlineCell(`A${r}`, row.name || '—'),
        inlineCell(`B${r}`, row.position || '—'),
        numCell(`C${r}`, row.days || 0, 7),
        numCell(`D${r}`, row.hours || 0, 3),
        numCell(`E${r}`, row.inFrame || 0, 3),
        numCell(`F${r}`, row.overtime || 0, 3),
        row.rateMissing ? inlineCell(`G${r}`, 'לא הוגדר') : numCell(`G${r}`, row.rate, 4),
        row.payMissing ? inlineCell(`H${r}`, 'לא הוגדר') : numCell(`H${r}`, row.payInFrame || 0, 4),
        row.payMissing ? inlineCell(`I${r}`, 'לא הוגדר') : numCell(`I${r}`, row.payOvertime || 0, 4),
        row.payMissing ? inlineCell(`J${r}`, 'לא הוגדר') : numCell(`J${r}`, row.pay, 4),
      ];
      xmlRows.push(`<row r="${r}">${cells.join('')}</row>`);
    });

    const total = payload?.total || {};
    const totalRow = 6 + rows.length;
    xmlRows.push(`<row r="${totalRow}" ht="20" customHeight="1">${[
      inlineCell(`A${totalRow}`, 'סה״כ על הכל', 5),
      inlineCell(`B${totalRow}`, '', 5),
      numCell(`C${totalRow}`, total.days || 0, 7),
      numCell(`D${totalRow}`, total.hours || 0, 3),
      numCell(`E${totalRow}`, total.inFrame || 0, 3),
      numCell(`F${totalRow}`, total.overtime || 0, 3),
      inlineCell(`G${totalRow}`, '', 5),
      total.payMissing && !total.payInFrame ? inlineCell(`H${totalRow}`, 'לא הוגדר', 5) : numCell(`H${totalRow}`, total.payInFrame || 0, 6),
      total.payMissing && !total.payOvertime ? inlineCell(`I${totalRow}`, 'לא הוגדר', 5) : numCell(`I${totalRow}`, total.payOvertime || 0, 6),
      total.payMissing && !total.pay ? inlineCell(`J${totalRow}`, 'לא הוגדר', 5) : numCell(`J${totalRow}`, total.pay || 0, 6),
    ].join('')}</row>`);

    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView workbookViewId="0" rightToLeft="1"/>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>
    <col min="1" max="1" width="22" customWidth="1"/>
    <col min="2" max="2" width="18" customWidth="1"/>
    <col min="3" max="3" width="14" customWidth="1"/>
    <col min="4" max="4" width="16" customWidth="1"/>
    <col min="5" max="5" width="16" customWidth="1"/>
    <col min="6" max="6" width="14" customWidth="1"/>
    <col min="7" max="7" width="12" customWidth="1"/>
    <col min="8" max="8" width="18" customWidth="1"/>
    <col min="9" max="9" width="22" customWidth="1"/>
    <col min="10" max="10" width="16" customWidth="1"/>
  </cols>
  <sheetData>
    ${xmlRows.join('\n    ')}
  </sheetData>
  <mergeCells count="3">
    <mergeCell ref="A1:J1"/>
    <mergeCell ref="A2:J2"/>
    <mergeCell ref="A3:J3"/>
  </mergeCells>
</worksheet>`;

    return zipStore([
      { name: '[Content_Types].xml', data: utf8(contentTypes) },
      { name: '_rels/.rels', data: utf8(rels) },
      { name: 'xl/workbook.xml', data: utf8(workbook) },
      { name: 'xl/_rels/workbook.xml.rels', data: utf8(workbookRels) },
      { name: 'xl/styles.xml', data: utf8(styles) },
      { name: 'xl/worksheets/sheet1.xml', data: utf8(sheet) },
    ]);
  }

  function downloadPayrollXlsx(filename, payload) {
    const bytes = buildPayrollXlsxBytes(payload);
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'staff-hours.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    return bytes;
  }

  const api = { buildPayrollXlsxBytes, downloadPayrollXlsx };
  root.LechaimStaffPayrollXlsx = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
