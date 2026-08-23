/**
 * LECHAIM — Admin staff hours (time clock + monthly summary)
 * Isolated module — does not touch orders / tables / shabbat / butcher.
 */
(function (global) {
  'use strict';

  const TZ = 'Europe/Athens';
  const EMP_COLS = 'id, name_en, position, hourly_rate, bank_account, bank_name, active, created_at, updated_at';
  const PUNCH_SOUNDS = [
    'assets/audio/welcome.mp3',
    'assets/audio/thank-you.mp3',
  ];
  let punchAudio = null;

  const viewEl = document.getElementById('admin-view-staff-hours');
  const errorEl = document.getElementById('staff-hours-error');
  const toastEl = document.getElementById('staff-hours-toast');

  const pinInput = document.getElementById('staff-clock-pin');
  const clockInBtn = document.getElementById('staff-clock-in');
  const clockOutBtn = document.getElementById('staff-clock-out');
  const openNowEl = document.getElementById('staff-open-now');

  const employeesTable = document.getElementById('staff-employees-table');
  const employeeNewBtn = document.getElementById('staff-employee-new');
  const employeeModal = document.getElementById('staff-employee-modal');
  const employeeBackdrop = document.getElementById('staff-employee-backdrop');
  const employeeForm = document.getElementById('staff-employee-form');
  const employeeFormError = document.getElementById('staff-employee-form-error');
  const employeeCancel = document.getElementById('staff-employee-cancel');
  const employeeModalTitle = document.getElementById('staff-employee-modal-title');
  const employeePinLabel = document.getElementById('staff-employee-pin-label');

  const shiftsTable = document.getElementById('staff-shifts-table');
  const shiftsMonth = document.getElementById('staff-shifts-month');
  const shiftsPin = document.getElementById('staff-shifts-pin');
  const shiftsLoadBtn = document.getElementById('staff-shifts-load');
  const shiftsPrintBtn = document.getElementById('staff-shifts-print');
  const shiftsViewedEl = document.getElementById('staff-shifts-viewed');
  const shiftNewBtn = document.getElementById('staff-shift-new');
  const shiftModal = document.getElementById('staff-shift-modal');
  const shiftBackdrop = document.getElementById('staff-shift-backdrop');
  const shiftForm = document.getElementById('staff-shift-form');
  const shiftFormError = document.getElementById('staff-shift-form-error');
  const shiftCancel = document.getElementById('staff-shift-cancel');
  const shiftModalTitle = document.getElementById('staff-shift-modal-title');
  const shiftEmployeeSelect = document.getElementById('staff-shift-employee');

  const summaryMonth = document.getElementById('staff-summary-month');
  const summaryPin = document.getElementById('staff-summary-pin');
  const summaryLoadBtn = document.getElementById('staff-summary-load');
  const summaryPrintBtn = document.getElementById('staff-summary-print');
  const summaryViewedEl = document.getElementById('staff-summary-viewed');
  const summaryRange = document.getElementById('staff-summary-range');
  const summaryTable = document.getElementById('staff-summary-table');

  let client = null;
  let started = false;
  let currentPanel = 'clock';
  let employeesCache = [];
  let shiftsCache = [];
  let shiftsViewEmployee = null;
  let summaryViewEmployee = null;
  let empFocusTrap = null;
  let shiftFocusTrap = null;
  let toastTimer = null;
  let busy = false;

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

  function formatMoney(amount) {
    const n = Number(amount) || 0;
    return `€${n.toLocaleString('en-US', {
      minimumFractionDigits: n % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function formatHours(hours) {
    const n = Number(hours) || 0;
    return n.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  /** Local calendar parts in Europe/Athens */
  function athensParts(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (Number.isNaN(d.getTime())) return null;
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const map = {};
    fmt.formatToParts(d).forEach((part) => {
      if (part.type !== 'literal') map[part.type] = part.value;
    });
    return {
      year: map.year,
      month: map.month,
      day: map.day,
      hour: map.hour === '24' ? '00' : map.hour,
      minute: map.minute,
      ymd: `${map.year}-${map.month}-${map.day}`,
      hm: `${map.hour === '24' ? '00' : map.hour}:${map.minute}`,
    };
  }

  function formatDateTimeAthens(value) {
    const p = athensParts(value);
    if (!p) return '—';
    return `${p.day}/${p.month}/${p.year} ${p.hm}`;
  }

  function formatTimeAthens(value) {
    const p = athensParts(value);
    if (!p) return '—';
    return p.hm;
  }

  function formatDateAthens(value) {
    const p = athensParts(value);
    if (!p) return '—';
    return `${p.day}/${p.month}/${p.year}`;
  }

  function currentMonthValue() {
    const p = athensParts(new Date());
    return p ? `${p.year}-${p.month}` : '';
  }

  function monthRange(ym) {
    const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (!year || month < 1 || month > 12) return null;
    const startLocal = athensMonthStartIso(year, month, 1);
    const endLocal = month === 12
      ? athensMonthStartIso(year + 1, 1, 1)
      : athensMonthStartIso(year, month + 1, 1);
    return {
      year,
      month,
      startIso: startLocal,
      endIso: endLocal,
      label: `01/${pad2(month)}/${year} – ${pad2(daysInMonth(year, month))}/${pad2(month)}/${year}`,
    };
  }

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  /**
   * Build an ISO timestamptz for YYYY-MM-01 00:00 in Europe/Athens.
   * Uses binary search on UTC instant matching Athens wall time.
   */
  function athensMonthStartIso(year, month, day) {
    const y = year;
    const mo = month;
    const d = day || 1;
    const target = `${y}-${pad2(mo)}-${pad2(d)} 00:00`;
    let lo = Date.UTC(y, mo - 1, d, -3, 0, 0);
    let hi = Date.UTC(y, mo - 1, d, 3, 0, 0);
    for (let i = 0; i < 40; i += 1) {
      const mid = Math.floor((lo + hi) / 2);
      const p = athensParts(new Date(mid));
      const wall = `${p.year}-${p.month}-${p.day} ${p.hm}`;
      if (wall >= target) hi = mid;
      else lo = mid + 1;
    }
    return new Date(hi).toISOString();
  }

  /** Combine Athens date + time into ISO timestamptz */
  function athensDateTimeToIso(ymd, hm) {
    const dm = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const tm = String(hm || '').match(/^(\d{2}):(\d{2})$/);
    if (!dm || !tm) return null;
    const year = Number(dm[1]);
    const month = Number(dm[2]);
    const day = Number(dm[3]);
    const hour = Number(tm[1]);
    const minute = Number(tm[2]);
    const target = `${dm[1]}-${dm[2]}-${dm[3]} ${tm[1]}:${tm[2]}`;
    let lo = Date.UTC(year, month - 1, day, hour - 4, minute, 0);
    let hi = Date.UTC(year, month - 1, day, hour + 4, minute, 0);
    for (let i = 0; i < 48; i += 1) {
      const mid = Math.floor((lo + hi) / 2);
      const p = athensParts(new Date(mid));
      const wall = `${p.year}-${p.month}-${p.day} ${p.hm}`;
      if (wall >= target) hi = mid;
      else lo = mid + 1;
    }
    return new Date(hi).toISOString();
  }

  function calcHours(clockIn, clockOut) {
    if (!clockIn || !clockOut) return null;
    const a = new Date(clockIn).getTime();
    const b = new Date(clockOut).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
    return Math.round(((b - a) / 3600000) * 100) / 100;
  }

  function buildMonthlySummary(employees, shifts, ym) {
    const range = monthRange(ym);
    if (!range) {
      return { range: null, rows: [], total: emptyTotal(), openWarnings: [] };
    }
    const startMs = new Date(range.startIso).getTime();
    const endMs = new Date(range.endIso).getTime();

    const byEmp = new Map();
    employees.forEach((emp) => {
      byEmp.set(emp.id, {
        employee: emp,
        days: new Set(),
        hours: 0,
        pay: 0,
        openShifts: [],
      });
    });

    shifts.forEach((shift) => {
      const inMs = new Date(shift.clock_in).getTime();
      if (!Number.isFinite(inMs) || inMs < startMs || inMs >= endMs) return;
      let bucket = byEmp.get(shift.employee_id);
      if (!bucket) {
        bucket = {
          employee: {
            id: shift.employee_id,
            name_en: '—',
            position: '',
            hourly_rate: shift.hourly_rate_snapshot,
            bank_account: '',
            bank_name: '',
          },
          days: new Set(),
          hours: 0,
          pay: 0,
          openShifts: [],
        };
        byEmp.set(shift.employee_id, bucket);
      }
      const parts = athensParts(shift.clock_in);
      if (!shift.clock_out) {
        bucket.openShifts.push(shift);
        return;
      }
      const hours = calcHours(shift.clock_in, shift.clock_out);
      if (hours == null) return;
      const rate = Number(shift.hourly_rate_snapshot) || 0;
      bucket.hours += hours;
      bucket.pay += hours * rate;
      if (parts?.ymd) bucket.days.add(parts.ymd);
    });

    const rows = Array.from(byEmp.values())
      .filter((row) => row.days.size > 0 || row.hours > 0 || row.openShifts.length > 0)
      .map((row) => ({
        name: row.employee.name_en || '—',
        position: row.employee.position || '',
        totalPay: Math.round(row.pay * 100) / 100,
        days: row.days.size,
        hours: Math.round(row.hours * 100) / 100,
        rate: Number(row.employee.hourly_rate) || 0,
        bankAccount: row.employee.bank_account || '',
        bankName: row.employee.bank_name || '',
        hasOpen: row.openShifts.length > 0,
        openCount: row.openShifts.length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en'));

    const total = {
      employees: rows.filter((r) => r.days > 0 || r.hours > 0).length,
      days: rows.reduce((s, r) => s + r.days, 0),
      hours: Math.round(rows.reduce((s, r) => s + r.hours, 0) * 100) / 100,
      pay: Math.round(rows.reduce((s, r) => s + r.totalPay, 0) * 100) / 100,
    };

    return { range, rows, total };
  }

  function emptyTotal() {
    return { employees: 0, days: 0, hours: 0, pay: 0 };
  }

  /* Exported for automated checks */
  const StaffHoursMath = {
    calcHours,
    buildMonthlySummary,
    monthRange,
    athensParts,
  };

  function setPanel(panel) {
    currentPanel = panel || 'clock';
    viewEl?.querySelectorAll('[data-staff-panel]').forEach((btn) => {
      const on = btn.getAttribute('data-staff-panel') === currentPanel;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    viewEl?.querySelectorAll('[data-staff-panel-view]').forEach((el) => {
      el.hidden = el.getAttribute('data-staff-panel-view') !== currentPanel;
    });
  }

  async function loadEmployees() {
    const sb = getClient();
    if (!sb) throw new Error('Supabase לא מחובר');
    const { data, error } = await sb
      .from('staff_employees')
      .select(EMP_COLS)
      .order('name_en', { ascending: true });
    if (error) throw error;
    employeesCache = Array.isArray(data) ? data : [];
    return employeesCache;
  }

  async function loadShiftsForMonth(ym, employeeId) {
    const range = monthRange(ym);
    if (!range || !employeeId) {
      shiftsCache = [];
      return shiftsCache;
    }
    const sb = getClient();
    if (!sb) throw new Error('Supabase לא מחובר');
    const { data, error } = await sb
      .from('staff_shifts')
      .select('id, employee_id, clock_in, clock_out, hourly_rate_snapshot, notes, created_at, updated_at')
      .eq('employee_id', employeeId)
      .gte('clock_in', range.startIso)
      .lt('clock_in', range.endIso)
      .order('clock_in', { ascending: true });
    if (error) throw error;
    shiftsCache = Array.isArray(data) ? data : [];
    return shiftsCache;
  }


  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text || '').trim()));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async function findEmployeeByPin(pin) {
    if (!/^\d{4,12}$/.test(String(pin || '').trim())) {
      throw new Error('הזינו קוד עובד תקין (4–12 ספרות)');
    }
    const sb = getClient();
    if (!sb) throw new Error('Supabase לא מחובר');
    const lookup = await sha256Hex(pin);
    const { data, error } = await sb
      .from('staff_employees')
      .select(EMP_COLS)
      .eq('pin_lookup', lookup)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('לא נמצא עובד עם הקוד הזה');
    return data;
  }

  async function loadOpenShifts() {
    const sb = getClient();
    if (!sb) throw new Error('Supabase is not connected');
    const { data, error } = await sb
      .from('staff_shifts')
      .select('id, employee_id, clock_in, clock_out, hourly_rate_snapshot')
      .is('clock_out', null)
      .order('clock_in', { ascending: false });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  function employeeName(id) {
    const emp = employeesCache.find((row) => row.id === id);
    return emp?.name_en || '—';
  }

  function fillEmployeeSelects() {
    if (!shiftEmployeeSelect) return;
    const prev = shiftEmployeeSelect.value;
    shiftEmployeeSelect.innerHTML = employeesCache
      .filter((e) => e.active !== false)
      .concat(employeesCache.filter((e) => e.active === false))
      .filter((e, i, arr) => arr.findIndex((x) => x.id === e.id) === i)
      .map((emp) => (
        `<option value="${escapeHtml(emp.id)}">${escapeHtml(emp.name_en)}${emp.active === false ? ' (לא פעיל)' : ''}</option>`
      ))
      .join('');
    if (prev) shiftEmployeeSelect.value = prev;
  }

  function setViewedLabel(el, emp) {
    if (!el) return;
    if (!emp) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = `${emp.name_en}${emp.position ? ` · ${emp.position}` : ''}`;
  }

  function renderOpenNow(openShifts) {
    if (!openNowEl) return;
    if (!openShifts.length) {
      openNowEl.innerHTML = '<p class="staff-muted">No one is clocked in right now</p>';
      return;
    }
    openNowEl.innerHTML = `
      <h3 class="staff-panel__subtitle">Clocked in now</h3>
      <ul class="staff-open-cards">
        ${openShifts.map((shift) => `
          <li class="staff-open-card">
            <strong dir="ltr">${escapeHtml(employeeName(shift.employee_id))}</strong>
            <span>Clock in: ${escapeHtml(formatTimeAthens(shift.clock_in))}</span>
            <span class="staff-badge staff-badge--open">On shift</span>
          </li>
        `).join('')}
      </ul>
    `;
  }

  function showConfirm(message, yesLabel) {
    if (typeof global.LechaimAdminTables?.showConfirmModal === 'function') {
      return global.LechaimAdminTables.showConfirmModal(message, {
        yesLabel: yesLabel || 'כן',
        noLabel: 'לא',
      });
    }
    return Promise.resolve(window.confirm(String(message || '')));
  }

  function renderEmployees() {
    if (!employeesTable) return;
    if (!employeesCache.length) {
      employeesTable.innerHTML = '<p class="staff-muted">אין עובדים עדיין. הוסיפו עובד חדש.</p>';
      return;
    }
    employeesTable.innerHTML = `
      <table class="staff-table">
        <thead>
          <tr>
            <th>שם</th>
            <th>תפקיד</th>
            <th>שכר לשעה</th>
            <th>מספר חשבון בנק</th>
            <th>שם בנק</th>
            <th>סטטוס</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${employeesCache.map((emp) => `
            <tr>
              <td dir="ltr">${escapeHtml(emp.name_en)}</td>
              <td dir="ltr">${escapeHtml(emp.position || '')}</td>
              <td dir="ltr">${escapeHtml(formatMoney(emp.hourly_rate))}</td>
              <td dir="ltr">${escapeHtml(emp.bank_account || '')}</td>
              <td dir="ltr">${escapeHtml(emp.bank_name || '')}</td>
              <td>${emp.active ? '<span class="staff-badge staff-badge--ok">פעיל</span>' : '<span class="staff-badge">לא פעיל</span>'}</td>
              <td class="staff-actions-cell">
                <button type="button" class="admin-btn admin-btn--ghost staff-btn-sm" data-edit-employee="${escapeHtml(emp.id)}">ערוך</button>
                <button type="button" class="admin-btn admin-btn--danger staff-btn-sm" data-delete-employee="${escapeHtml(emp.id)}">מחק</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  /** Days 1..last to show in the shifts grid for a YYYY-MM value (Athens calendar). */
  function shiftsGridDayLimit(ym) {
    const range = monthRange(ym);
    if (!range) return null;
    const today = athensParts(new Date());
    if (!today) return null;
    const todayYm = `${today.year}-${today.month}`;
    const lastDayOfMonth = daysInMonth(range.year, range.month);
    let lastDay = lastDayOfMonth;
    if (ym === todayYm) {
      lastDay = Number(today.day);
    } else if (ym > todayYm) {
      lastDay = 0;
    }
    return { range, lastDay, lastDayOfMonth };
  }

  function weekdayHe(ymd) {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    const names = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
    /* Noon UTC avoids DST edge for weekday-only use */
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
    return names[d.getUTCDay()] || '';
  }

  function renderShifts() {
    if (!shiftsTable) return;
    if (!shiftsViewEmployee) {
      if (shiftsPrintBtn) shiftsPrintBtn.hidden = true;
      setViewedLabel(shiftsViewedEl, null);
      shiftsTable.innerHTML = '<p class="staff-muted">הזינו קוד עובד ולחצו «הצג» כדי לפתוח את טבלת הימים</p>';
      return;
    }
    setViewedLabel(shiftsViewedEl, shiftsViewEmployee);
    if (shiftsPrintBtn) shiftsPrintBtn.hidden = !shiftsCache.length;

    const ym = shiftsMonth?.value || currentMonthValue();
    const limit = shiftsGridDayLimit(ym);
    if (!limit || limit.lastDay < 1) {
      shiftsTable.innerHTML = '<p class="staff-muted">אין ימים להצגה בחודש שנבחר (עתידי)</p>';
      return;
    }

    const byDay = new Map();
    for (let day = 1; day <= limit.lastDay; day += 1) {
      const ymd = `${limit.range.year}-${pad2(limit.range.month)}-${pad2(day)}`;
      byDay.set(ymd, []);
    }
    shiftsCache.forEach((shift) => {
      const p = athensParts(shift.clock_in);
      if (!p?.ymd || !byDay.has(p.ymd)) return;
      byDay.get(p.ymd).push(shift);
    });

    const rowsHtml = [];
    byDay.forEach((dayShifts, ymd) => {
      const dayNum = ymd.slice(-2);
      const dateLabel = `${dayNum}/${pad2(limit.range.month)}/${limit.range.year}`;
      const dow = weekdayHe(ymd);
      if (!dayShifts.length) {
        rowsHtml.push(`
          <tr class="is-empty-day">
            <td dir="ltr">
              <span class="staff-day-label">${escapeHtml(dateLabel)}</span>
              <span class="staff-day-dow">${escapeHtml(dow)}</span>
            </td>
            <td colspan="4" class="staff-empty-cell">אין משמרת</td>
            <td><span class="staff-badge">ריק</span></td>
            <td class="staff-actions-cell">
              <button type="button" class="admin-btn admin-btn--primary staff-btn-sm" data-add-shift-day="${escapeHtml(ymd)}">הוסף</button>
            </td>
          </tr>
        `);
        return;
      }
      dayShifts.forEach((shift, idx) => {
        const open = !shift.clock_out;
        const hours = open ? null : calcHours(shift.clock_in, shift.clock_out);
        rowsHtml.push(`
          <tr class="${open ? 'is-open-shift' : ''}">
            <td dir="ltr">
              ${idx === 0 ? `
                <span class="staff-day-label">${escapeHtml(dateLabel)}</span>
                <span class="staff-day-dow">${escapeHtml(dow)}</span>
              ` : '<span class="staff-day-label staff-day-label--repeat">↳</span>'}
            </td>
            <td dir="ltr">${escapeHtml(formatTimeAthens(shift.clock_in))}</td>
            <td dir="ltr">${open ? '—' : escapeHtml(formatTimeAthens(shift.clock_out))}</td>
            <td dir="ltr">${open ? '—' : escapeHtml(formatHours(hours))}</td>
            <td dir="ltr">${escapeHtml(formatMoney(shift.hourly_rate_snapshot))}</td>
            <td>${open
              ? '<span class="staff-badge staff-badge--open">פתוחה</span>'
              : '<span class="staff-badge staff-badge--ok">סגורה</span>'}</td>
            <td class="staff-actions-cell">
              <button type="button" class="admin-btn admin-btn--ghost staff-btn-sm" data-edit-shift="${escapeHtml(shift.id)}">ערוך</button>
              ${idx === dayShifts.length - 1
                ? `<button type="button" class="admin-btn admin-btn--soft staff-btn-sm" data-add-shift-day="${escapeHtml(ymd)}">+ עוד</button>
                   <button type="button" class="admin-btn admin-btn--danger staff-btn-sm" data-reset-shift-day="${escapeHtml(ymd)}">אפס יום</button>`
                : ''}
            </td>
          </tr>
        `);
      });
    });

    shiftsTable.innerHTML = `
      <p class="staff-grid-caption">ימים 1–${limit.lastDay} מתוך ${limit.lastDayOfMonth} בחודש · מלאו ימים ריקים או ערכו קיימים</p>
      <table class="staff-table staff-table--days">
        <thead>
          <tr>
            <th>תאריך</th>
            <th>כניסה</th>
            <th>יציאה</th>
            <th>שעות</th>
            <th>שכר/שעה</th>
            <th>סטטוס</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml.join('')}
        </tbody>
      </table>
    `;
  }

  function renderSummary() {
    if (!summaryTable) return;
    if (!summaryViewEmployee) {
      if (summaryPrintBtn) summaryPrintBtn.hidden = true;
      setViewedLabel(summaryViewedEl, null);
      if (summaryRange) summaryRange.textContent = '';
      summaryTable.innerHTML = '';
      return;
    }

    const ym = summaryMonth?.value || currentMonthValue();
    const { range, rows, total } = buildMonthlySummary([summaryViewEmployee], shiftsCache, ym);
    const row = rows[0] || null;
    setViewedLabel(summaryViewedEl, summaryViewEmployee);
    if (summaryRange) {
      summaryRange.textContent = range ? range.label : '';
    }
    if (summaryPrintBtn) summaryPrintBtn.hidden = !shiftsCache.length;

    if (!row) {
      summaryTable.innerHTML = '<p class="staff-muted">אין נתונים לעובד זה בחודש שנבחר</p>';
      return;
    }

    summaryTable.innerHTML = `
      <table class="staff-table staff-table--summary">
        <thead>
          <tr>
            <th>שם</th>
            <th>תפקיד</th>
            <th>סכום כולל</th>
            <th>ימים</th>
            <th>שעות</th>
            <th>כמה לשעה</th>
            <th>מספר חשבון בנק</th>
            <th>שם בנק</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td dir="ltr">
              ${escapeHtml(row.name)}
              ${row.hasOpen ? `
                <div class="staff-open-warning" role="status">
                  ⚠️ יש משמרת פתוחה — לא נכללת בחישוב
                </div>
              ` : ''}
            </td>
            <td dir="ltr">${escapeHtml(row.position)}</td>
            <td dir="ltr">${escapeHtml(formatMoney(row.totalPay))}</td>
            <td dir="ltr">${escapeHtml(String(row.days))}</td>
            <td dir="ltr">${escapeHtml(formatHours(row.hours))}</td>
            <td dir="ltr">${escapeHtml(formatMoney(row.rate))}</td>
            <td dir="ltr">${escapeHtml(row.bankAccount)}</td>
            <td dir="ltr">${escapeHtml(row.bankName)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="staff-total-row">
            <td><strong>סה״כ</strong></td>
            <td>1 עובד</td>
            <td dir="ltr"><strong>${escapeHtml(formatMoney(total.pay))}</strong></td>
            <td dir="ltr"><strong>${escapeHtml(String(total.days))}</strong></td>
            <td dir="ltr"><strong>${escapeHtml(formatHours(total.hours))}</strong></td>
            <td colspan="3"></td>
          </tr>
        </tfoot>
      </table>
    `;
  }

  function formatDateShortAthens(value) {
    const p = athensParts(value);
    if (!p) return '—';
    return `${p.day}/${p.month}/${String(p.year).slice(-2)}`;
  }

  function padCell(value, width, align) {
    const s = String(value == null ? '' : value);
    if (s.length >= width) return s.slice(0, width);
    const space = ' '.repeat(width - s.length);
    return align === 'left' ? s + space : space + s;
  }

  function buildStaffHoursTicket(emp, shifts) {
    /* LTR columns: Date | In | Out | Hours */
    const wDate = 8;
    const wTime = 5;
    const wHours = 5;
    const gap = '  ';

    const header = [
      padCell('Date', wDate, 'left'),
      padCell('In', wTime, 'left'),
      padCell('Out', wTime, 'left'),
      padCell('Hours', wHours, 'left'),
    ].join(gap);

    const rows = [];
    let totalHours = 0;

    shifts.forEach((shift) => {
      const date = formatDateShortAthens(shift.clock_in);
      const timeIn = formatTimeAthens(shift.clock_in);
      if (!shift.clock_out) {
        rows.push([
          padCell(date, wDate, 'left'),
          padCell(timeIn, wTime, 'left'),
          padCell('-', wTime, 'left'),
          padCell('-', wHours, 'left'),
        ].join(gap));
        return;
      }
      const hours = calcHours(shift.clock_in, shift.clock_out) || 0;
      totalHours += hours;
      rows.push([
        padCell(date, wDate, 'left'),
        padCell(timeIn, wTime, 'left'),
        padCell(formatTimeAthens(shift.clock_out), wTime, 'left'),
        padCell(formatHours(hours), wHours, 'left'),
      ].join(gap));
    });

    const totalLabel = `Total: ${formatHours(Math.round(totalHours * 100) / 100)}`;

    /*
     * Bar printer presents the last printed lines at the top of the torn slip.
     * Build reading-order top→bottom, then reverse so Total ends at the bottom.
     */
    const readingOrder = [];
    if (emp?.name_en) readingOrder.push(emp.name_en);
    readingOrder.push('');
    readingOrder.push(header);
    rows.forEach((row) => readingOrder.push(row));
    readingOrder.push('------------------------');
    readingOrder.push(totalLabel);

    return `${readingOrder.reverse().join('\n')}\n`;
  }

  async function printEmployeeShifts(emp, shifts) {
    if (!emp || !shifts?.length) {
      showError('אין משמרות להדפסה');
      return;
    }
    const ticket = buildStaffHoursTicket(emp, shifts);
    const ok = await global.LechaimPrintEngine?.printRawTicket?.(ticket, 'bar');
    if (!ok) {
      showError('ההדפסה נכשלה — בדקו את שירות המדפסת (בר)');
      return;
    }
    showToast('הודפס במדפסת הבר');
  }

  async function refreshAll() {
    showError('');
    try {
      await loadEmployees();
      fillEmployeeSelects();
      const ymShifts = shiftsMonth?.value || currentMonthValue();
      const ymSummary = summaryMonth?.value || currentMonthValue();
      if (shiftsMonth && !shiftsMonth.value) shiftsMonth.value = ymShifts;
      if (summaryMonth && !summaryMonth.value) summaryMonth.value = ymSummary;

      if (currentPanel === 'shifts') {
        renderShifts();
      } else if (currentPanel === 'summary') {
        renderSummary();
      } else if (currentPanel === 'clock') {
        const open = await loadOpenShifts();
        renderOpenNow(open);
      } else if (currentPanel === 'employees') {
        renderEmployees();
      }
    } catch (err) {
      console.error('[staff-hours] refresh failed', err);
      const msg = err?.message || 'הטעינה נכשלה';
      if (/relation .* does not exist|Could not find the table/i.test(msg)) {
        showError('יש להריץ קודם את supabase-staff-hours.sql ב-SQL Editor של Supabase');
      } else {
        showError(msg);
      }
    }
  }

  async function loadShiftsView() {
    showError('');
    try {
      const emp = await findEmployeeByPin(shiftsPin?.value || '');
      shiftsViewEmployee = emp;
      if (!employeesCache.some((row) => row.id === emp.id)) {
        employeesCache = [...employeesCache, emp];
      }
      await loadShiftsForMonth(shiftsMonth?.value || currentMonthValue(), emp.id);
      renderShifts();
      showToast(`מוצגות משמרות של ${emp.name_en}`);
    } catch (err) {
      shiftsViewEmployee = null;
      shiftsCache = [];
      renderShifts();
      showError(err?.message || 'שגיאה');
    }
  }

  async function loadSummaryView() {
    showError('');
    try {
      const emp = await findEmployeeByPin(summaryPin?.value || '');
      summaryViewEmployee = emp;
      if (!employeesCache.some((row) => row.id === emp.id)) {
        employeesCache = [...employeesCache, emp];
      }
      await loadShiftsForMonth(summaryMonth?.value || currentMonthValue(), emp.id);
      renderSummary();
      showToast(`מוצג סיכום של ${emp.name_en}`);
    } catch (err) {
      summaryViewEmployee = null;
      shiftsCache = [];
      renderSummary();
      showError(err?.message || 'שגיאה');
    }
  }

  function openEmployeeModal(emp) {
    if (!employeeModal || !employeeForm) return;
    showFormError(employeeFormError, '');
    const idEl = document.getElementById('staff-employee-id');
    const nameEl = document.getElementById('staff-employee-name');
    const posEl = document.getElementById('staff-employee-position');
    const rateEl = document.getElementById('staff-employee-rate');
    const pinEl = document.getElementById('staff-employee-pin');
    const bankAcc = document.getElementById('staff-employee-bank-account');
    const bankName = document.getElementById('staff-employee-bank-name');
    const activeEl = document.getElementById('staff-employee-active');

    if (idEl) idEl.value = emp?.id || '';
    if (nameEl) nameEl.value = emp?.name_en || '';
    if (posEl) posEl.value = emp?.position || '';
    if (rateEl) rateEl.value = emp?.hourly_rate != null ? String(emp.hourly_rate) : '';
    if (pinEl) {
      pinEl.value = '';
      pinEl.required = !emp;
    }
    if (employeePinLabel) {
      employeePinLabel.textContent = emp ? 'קוד אישי חדש (אופציונלי)' : 'קוד אישי *';
    }
    if (bankAcc) bankAcc.value = emp?.bank_account || '';
    if (bankName) bankName.value = emp?.bank_name || '';
    if (activeEl) activeEl.checked = emp ? emp.active !== false : true;
    if (employeeModalTitle) employeeModalTitle.textContent = emp ? 'עריכת עובד' : 'עובד חדש';

    employeeModal.hidden = false;
    employeeModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    if (typeof empFocusTrap === 'function') empFocusTrap();
    const release = global.LechaimFocusTrap?.activate?.(employeeModal);
    empFocusTrap = typeof release === 'function' ? release : null;
    nameEl?.focus();
  }

  function closeEmployeeModal() {
    if (!employeeModal) return;
    if (typeof empFocusTrap === 'function') empFocusTrap();
    empFocusTrap = null;
    employeeModal.hidden = true;
    employeeModal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.admin-modal:not([hidden])')) {
      document.body.classList.remove('admin-modal-open');
    }
  }

  function openShiftModal(shift, presets = null) {
    if (!shiftModal || !shiftForm) return;
    showFormError(shiftFormError, '');
    fillEmployeeSelects();
    const idEl = document.getElementById('staff-shift-id');
    const dateEl = document.getElementById('staff-shift-date');
    const inEl = document.getElementById('staff-shift-in');
    const outEl = document.getElementById('staff-shift-out');

    if (idEl) idEl.value = shift?.id || '';
    if (shiftEmployeeSelect) {
      const preferredEmp = shift?.employee_id
        || presets?.employeeId
        || shiftsViewEmployee?.id
        || employeesCache.find((e) => e.active)?.id
        || '';
      shiftEmployeeSelect.value = preferredEmp;
    }
    if (shift) {
      const pin = athensParts(shift.clock_in);
      if (dateEl) dateEl.value = pin?.ymd || '';
      if (inEl) inEl.value = pin?.hm || '';
      if (outEl) {
        if (shift.clock_out) {
          const pout = athensParts(shift.clock_out);
          outEl.value = pout?.hm || '';
        } else {
          outEl.value = '';
        }
      }
      if (shiftModalTitle) shiftModalTitle.textContent = 'עריכת משמרת';
    } else {
      const now = athensParts(new Date());
      if (dateEl) dateEl.value = presets?.ymd || now?.ymd || '';
      if (inEl) inEl.value = presets?.timeIn || '14:00';
      if (outEl) outEl.value = presets?.timeOut || '22:00';
      if (shiftModalTitle) shiftModalTitle.textContent = 'משמרת חדשה';
    }

    shiftModal.hidden = false;
    shiftModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    if (typeof shiftFocusTrap === 'function') shiftFocusTrap();
    const release = global.LechaimFocusTrap?.activate?.(shiftModal);
    shiftFocusTrap = typeof release === 'function' ? release : null;
    if (!shift) {
      inEl?.focus();
    }
  }

  function closeShiftModal() {
    if (!shiftModal) return;
    if (typeof shiftFocusTrap === 'function') shiftFocusTrap();
    shiftFocusTrap = null;
    shiftModal.hidden = true;
    shiftModal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.admin-modal:not([hidden])')) {
      document.body.classList.remove('admin-modal-open');
    }
  }

  function mapRpcError(err) {
    const msg = String(err?.message || err || '');
    if (/pin_taken/i.test(msg)) return 'הקוד הזה כבר בשימוש אצל עובד אחר';
    if (/pin_required|invalid_pin|pin_digits/i.test(msg)) return 'קוד אישי לא תקין (4–12 ספרות)';
    if (/name_required/i.test(msg)) return 'יש למלא שם';
    if (/not_authenticated/i.test(msg)) return 'יש להתחבר לאדמין';
    if (/employee_not_found/i.test(msg)) return 'עובד לא נמצא';
    return msg || 'שגיאה';
  }

  async function deleteEmployee(emp) {
    if (!emp?.id || busy) return;
    const ok = await showConfirm(
      `למחוק את ${emp.name_en}?\nכל המשמרות שלו יימחקו גם.`,
      'מחק'
    );
    if (!ok) return;

    const sb = getClient();
    if (!sb) {
      showError('Supabase לא מחובר');
      return;
    }

    busy = true;
    showError('');
    try {
      const { error: shiftsErr } = await sb
        .from('staff_shifts')
        .delete()
        .eq('employee_id', emp.id);
      if (shiftsErr) throw shiftsErr;

      const { error: empErr } = await sb
        .from('staff_employees')
        .delete()
        .eq('id', emp.id);
      if (empErr) throw empErr;

      if (shiftsViewEmployee?.id === emp.id) {
        shiftsViewEmployee = null;
        shiftsCache = [];
        renderShifts();
      }
      if (summaryViewEmployee?.id === emp.id) {
        summaryViewEmployee = null;
        shiftsCache = [];
        renderSummary();
      }

      showToast(`${emp.name_en} נמחק`);
      await loadEmployees();
      fillEmployeeSelects();
      renderEmployees();
    } catch (err) {
      console.error('[staff-hours] delete employee', err);
      showError(err?.message || 'לא ניתן למחוק את העובד');
    } finally {
      busy = false;
    }
  }

  async function saveEmployee(event) {
    event.preventDefault();
    if (busy) return;
    showFormError(employeeFormError, '');
    const id = document.getElementById('staff-employee-id')?.value || null;
    const name = document.getElementById('staff-employee-name')?.value?.trim() || '';
    const position = document.getElementById('staff-employee-position')?.value?.trim() || '';
    const rate = Number(document.getElementById('staff-employee-rate')?.value);
    const pin = document.getElementById('staff-employee-pin')?.value?.trim() || '';
    const bankAccount = document.getElementById('staff-employee-bank-account')?.value?.trim() || '';
    const bankName = document.getElementById('staff-employee-bank-name')?.value?.trim() || '';
    const active = Boolean(document.getElementById('staff-employee-active')?.checked);

    if (!name) {
      showFormError(employeeFormError, 'שם באנגלית חובה');
      return;
    }
    if (!Number.isFinite(rate) || rate < 0) {
      showFormError(employeeFormError, 'שכר לשעה לא תקין');
      return;
    }
    if (!id && (!pin || pin.length < 4)) {
      showFormError(employeeFormError, 'קוד אישי חובה (4–12 ספרות)');
      return;
    }
    if (pin && !/^\d{4,12}$/.test(pin)) {
      showFormError(employeeFormError, 'הקוד חייב להיות 4–12 ספרות בלבד');
      return;
    }

    const sb = getClient();
    if (!sb) {
      showFormError(employeeFormError, 'Supabase לא מחובר');
      return;
    }

    busy = true;
    try {
      const { error } = await sb.rpc('staff_upsert_employee', {
        p_id: id || null,
        p_name_en: name,
        p_position: position,
        p_hourly_rate: rate,
        p_bank_account: bankAccount,
        p_bank_name: bankName,
        p_active: active,
        p_pin: pin || null,
      });
      if (error) throw error;
      closeEmployeeModal();
      showToast(id ? 'העובד עודכן' : 'העובד נוצר');
      await loadEmployees();
      fillEmployeeSelects();
      renderEmployees();
    } catch (err) {
      console.error('[staff-hours] save employee', err);
      showFormError(employeeFormError, mapRpcError(err));
    } finally {
      busy = false;
    }
  }

  async function resetShiftDay(ymd) {
    if (!ymd || !shiftsViewEmployee?.id || busy) return;
    const dayShifts = shiftsCache.filter((shift) => athensParts(shift.clock_in)?.ymd === ymd);
    if (!dayShifts.length) {
      showToast('אין משמרות לאיפוס ביום זה');
      return;
    }
    const label = formatDateAthens(dayShifts[0].clock_in);
    const ok = await showConfirm(
      `לאפס את ${label}?\nכל המשמרות של ${shiftsViewEmployee.name_en} ביום זה יימחקו.`,
      'אפס יום'
    );
    if (!ok) return;

    const sb = getClient();
    if (!sb) {
      showError('Supabase לא מחובר');
      return;
    }

    busy = true;
    showError('');
    try {
      const ids = dayShifts.map((s) => s.id).filter(Boolean);
      const { error } = await sb
        .from('staff_shifts')
        .delete()
        .in('id', ids);
      if (error) throw error;
      showToast(`${label} אופס`);
      await loadShiftsForMonth(shiftsMonth?.value || currentMonthValue(), shiftsViewEmployee.id);
      renderShifts();
    } catch (err) {
      console.error('[staff-hours] reset day', err);
      showError(err?.message || 'לא ניתן לאפס את היום');
    } finally {
      busy = false;
    }
  }

  async function saveShift(event) {
    event.preventDefault();
    if (busy) return;
    showFormError(shiftFormError, '');
    const id = document.getElementById('staff-shift-id')?.value || '';
    const employeeId = shiftEmployeeSelect?.value || '';
    const date = document.getElementById('staff-shift-date')?.value || '';
    const timeIn = document.getElementById('staff-shift-in')?.value || '';
    const timeOut = document.getElementById('staff-shift-out')?.value || '';

    if (!employeeId || !date || !timeIn) {
      showFormError(shiftFormError, 'חובה לבחור עובד, תאריך ושעת כניסה');
      return;
    }
    const clockInIso = athensDateTimeToIso(date, timeIn);
    if (!clockInIso) {
      showFormError(shiftFormError, 'תאריך / שעת כניסה לא תקינים');
      return;
    }
    let clockOutIso = null;
    if (timeOut) {
      let outDate = date;
      if (timeOut <= timeIn) {
        const parts = String(date).split('-').map(Number);
        const next = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + 1));
        outDate = `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
      }
      clockOutIso = athensDateTimeToIso(outDate, timeOut);
      if (!clockOutIso) {
        showFormError(shiftFormError, 'שעת יציאה לא תקינה');
        return;
      }
      if (new Date(clockOutIso) < new Date(clockInIso)) {
        showFormError(shiftFormError, 'שעת יציאה חייבת להיות אחרי שעת כניסה');
        return;
      }
    }

    const emp = employeesCache.find((row) => row.id === employeeId);
    const sb = getClient();
    if (!sb) {
      showFormError(shiftFormError, 'Supabase לא מחובר');
      return;
    }

    busy = true;
    try {
      if (id) {
        const { error } = await sb
          .from('staff_shifts')
          .update({
            employee_id: employeeId,
            clock_in: clockInIso,
            clock_out: clockOutIso,
          })
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await sb
          .from('staff_shifts')
          .insert({
            employee_id: employeeId,
            clock_in: clockInIso,
            clock_out: clockOutIso,
            hourly_rate_snapshot: Number(emp?.hourly_rate) || 0,
          });
        if (error) throw error;
      }
      closeShiftModal();
      showToast('המשמרת נשמרה');
      if (currentPanel === 'shifts' && shiftsViewEmployee) {
        await loadShiftsForMonth(shiftsMonth?.value || currentMonthValue(), shiftsViewEmployee.id);
        renderShifts();
      } else if (currentPanel === 'summary' && summaryViewEmployee) {
        await loadShiftsForMonth(summaryMonth?.value || currentMonthValue(), summaryViewEmployee.id);
        renderSummary();
      }
      if (currentPanel === 'clock') {
        renderOpenNow(await loadOpenShifts());
      }
    } catch (err) {
      console.error('[staff-hours] save shift', err);
      const msg = String(err?.message || '');
      if (/staff_shifts_one_open_per_employee|duplicate key/i.test(msg)) {
        showFormError(shiftFormError, 'לעובד זה כבר יש משמרת פתוחה — סגרו אותה או ערכו אותה');
      } else {
        showFormError(shiftFormError, msg || 'לא ניתן לשמור');
      }
    } finally {
      busy = false;
    }
  }

  function playPunchSuccessSound() {
    const src = PUNCH_SOUNDS[Math.floor(Math.random() * PUNCH_SOUNDS.length)];
    try {
      if (punchAudio) {
        punchAudio.pause();
      }
      punchAudio = new Audio(src);
      const play = punchAudio.play();
      if (play && typeof play.catch === 'function') play.catch(() => {});
    } catch (_) {
      /* Punch already succeeded — sound is optional */
    }
  }

  async function punch(action) {
    if (busy) return;
    const pin = pinInput?.value?.trim() || '';
    if (!/^\d{4,12}$/.test(pin)) {
      showError('Enter a valid code (4–12 digits)');
      return;
    }
    const sb = getClient();
    if (!sb) {
      showError('Supabase is not connected');
      return;
    }
    busy = true;
    showError('');
    try {
      const { data, error } = await sb.rpc('staff_clock', {
        p_pin: pin,
        p_action: action,
      });
      if (error) throw error;
      const res = data || {};
      if (!res.ok) {
        if (res.error === 'already_clocked_in') {
          showError(
            `${res.employee_name || ''} · Clock in: ${formatTimeAthens(res.clock_in)} · Status: already on shift — cannot clock in again`
          );
        } else if (res.error === 'not_clocked_in') {
          showError(`${res.employee_name || ''}: no open shift to clock out`);
        } else if (res.error === 'invalid_pin') {
          showError('Wrong code');
        } else if (res.error === 'inactive') {
          showError(`${res.employee_name || ''}: employee is inactive`);
        } else {
          showError(res.error || 'Error');
        }
        return;
      }

      if (pinInput) pinInput.value = '';
      playPunchSuccessSound();
      if (res.action === 'in') {
        showToast(`${res.employee_name || ''} · Clock in ${formatTimeAthens(res.clock_in)}`);
      } else {
        showToast(
          `${res.employee_name || ''} · Clock out ${formatTimeAthens(res.clock_out)} · ${formatHours(res.hours)} hours`
        );
      }
      renderOpenNow(await loadOpenShifts());
    } catch (err) {
      console.error('[staff-hours] punch', err);
      showError(mapRpcError(err));
    } finally {
      busy = false;
    }
  }

  function bindEvents() {
    viewEl?.querySelector('.staff-hours-subtabs')?.addEventListener('click', async (event) => {
      const btn = event.target.closest('[data-staff-panel]');
      if (!btn) return;
      setPanel(btn.getAttribute('data-staff-panel'));
      await refreshAll();
    });

    clockInBtn?.addEventListener('click', () => { void punch('in'); });
    clockOutBtn?.addEventListener('click', () => { void punch('out'); });
    pinInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void punch('in');
      }
    });

    employeeNewBtn?.addEventListener('click', () => openEmployeeModal(null));
    employeeCancel?.addEventListener('click', closeEmployeeModal);
    employeeBackdrop?.addEventListener('click', closeEmployeeModal);
    employeeForm?.addEventListener('submit', (event) => { void saveEmployee(event); });

    employeesTable?.addEventListener('click', (event) => {
      const editBtn = event.target.closest('[data-edit-employee]');
      if (editBtn) {
        const emp = employeesCache.find((row) => row.id === editBtn.getAttribute('data-edit-employee'));
        if (emp) openEmployeeModal(emp);
        return;
      }
      const deleteBtn = event.target.closest('[data-delete-employee]');
      if (deleteBtn) {
        const emp = employeesCache.find((row) => row.id === deleteBtn.getAttribute('data-delete-employee'));
        if (emp) void deleteEmployee(emp);
      }
    });

    shiftNewBtn?.addEventListener('click', () => {
      openShiftModal(null, {
        employeeId: shiftsViewEmployee?.id || null,
        ymd: athensParts(new Date())?.ymd || null,
      });
    });
    shiftCancel?.addEventListener('click', closeShiftModal);
    shiftBackdrop?.addEventListener('click', closeShiftModal);
    shiftForm?.addEventListener('submit', (event) => { void saveShift(event); });

    shiftsTable?.addEventListener('click', (event) => {
      const editBtn = event.target.closest('[data-edit-shift]');
      if (editBtn) {
        const shift = shiftsCache.find((row) => row.id === editBtn.getAttribute('data-edit-shift'));
        if (shift) openShiftModal(shift);
        return;
      }
      const resetBtn = event.target.closest('[data-reset-shift-day]');
      if (resetBtn) {
        void resetShiftDay(resetBtn.getAttribute('data-reset-shift-day') || '');
        return;
      }
      const addBtn = event.target.closest('[data-add-shift-day]');
      if (addBtn) {
        openShiftModal(null, {
          employeeId: shiftsViewEmployee?.id || null,
          ymd: addBtn.getAttribute('data-add-shift-day') || null,
          timeIn: '14:00',
          timeOut: '22:00',
        });
      }
    });

    shiftsMonth?.addEventListener('change', async () => {
      if (!shiftsViewEmployee) {
        renderShifts();
        return;
      }
      await loadShiftsForMonth(shiftsMonth.value, shiftsViewEmployee.id);
      renderShifts();
    });
    shiftsLoadBtn?.addEventListener('click', () => { void loadShiftsView(); });
    shiftsPin?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void loadShiftsView();
      }
    });
    shiftsPrintBtn?.addEventListener('click', () => {
      void printEmployeeShifts(shiftsViewEmployee, shiftsCache);
    });

    summaryMonth?.addEventListener('change', async () => {
      if (!summaryViewEmployee) {
        renderSummary();
        return;
      }
      await loadShiftsForMonth(summaryMonth.value, summaryViewEmployee.id);
      renderSummary();
    });
    summaryLoadBtn?.addEventListener('click', () => { void loadSummaryView(); });
    summaryPin?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void loadSummaryView();
      }
    });
    summaryPrintBtn?.addEventListener('click', () => {
      void printEmployeeShifts(summaryViewEmployee, shiftsCache);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (employeeModal && !employeeModal.hidden) {
        closeEmployeeModal();
        return;
      }
      if (shiftModal && !shiftModal.hidden) {
        closeShiftModal();
      }
    });
  }

  async function start() {
    if (!viewEl) return;
    if (!started) {
      bindEvents();
      started = true;
      if (shiftsMonth && !shiftsMonth.value) shiftsMonth.value = currentMonthValue();
      if (summaryMonth && !summaryMonth.value) summaryMonth.value = currentMonthValue();
    }
    if (viewEl.hidden) return;
    setPanel(currentPanel);
    await refreshAll();
  }

  global.LechaimAdminStaffHours = {
    start,
    StaffHoursMath,
  };
})(window);
