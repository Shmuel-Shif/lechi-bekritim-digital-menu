/**
 * LECHAIM — Admin Dashboard V2
 * V1 today/LIVE stay on existing till + board snapshots.
 * Week/month use one slim range query (plus previous period in the same window) and client-side charts.
 */
(function () {
  'use strict';

  const GO_LIVE_YMD = '2026-08-10';
  const WEEKDAYS_HE = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת'];
  const root = document.getElementById('admin-view-dashboard');
  const periodsEl = document.getElementById('dash-periods');
  const bannerEl = document.getElementById('dash-banner');
  const trendTitleEl = document.getElementById('dash-trend-title');
  const trendMetaEl = document.getElementById('dash-trend-meta');
  const trendChartEl = document.getElementById('dash-trend-chart');
  const trendLegendEl = document.getElementById('dash-trend-legend');
  const mixChartEl = document.getElementById('dash-mix-chart');
  const typesChartEl = document.getElementById('dash-types-chart');
  const topChartEl = document.getElementById('dash-top-chart');
  const liveGridEl = document.getElementById('dash-live-grid');
  const ordersTitleEl = document.getElementById('dash-orders-title');
  const ordersChartEl = document.getElementById('dash-orders-chart');
  const tipsChartEl = document.getElementById('dash-tips-chart');
  const weekCompareBody = document.getElementById('dash-week-compare-body');
  const strongDaysBody = document.getElementById('dash-strong-days-body');
  const peakHoursBody = document.getElementById('dash-peak-hours-body');
  const tooltipEl = document.getElementById('dash-tooltip');
  const clockTimeEl = document.getElementById('dash-clock-time');
  const clockDateEl = document.getElementById('dash-clock-date');
  const coreGaugeEl = document.getElementById('dash-core-gauge');
  const ringsEl = document.getElementById('dash-rings');
  const kitchenBody = document.getElementById('dash-kitchen-body');
  const tablesBody = document.getElementById('dash-tables-body');
  const deliveryBody = document.getElementById('dash-delivery-body');
  const pickupBody = document.getElementById('dash-pickup-body');

  const TYPE_META = {
    table: { label: 'שולחן', color: '#2d6a9f' },
    delivery: { label: 'משלוח', color: '#c45a2d' },
    pickup: { label: 'איסוף', color: '#2f7d6d' },
    butcher: { label: 'חנות בשר', color: '#8b3a3a' },
    shabbat: { label: 'הזמנות שבת', color: '#6b4ea0' },
  };

  const LIVE_CARDS = [
    { key: 'openTables', label: 'שולחנות פתוחים', icon: '🟢', tone: 'tables' },
    { key: 'activeDeliveries', label: 'משלוחים פעילים', icon: '🚚', tone: 'delivery' },
    { key: 'activePickups', label: 'איסופים פעילים', icon: '📦', tone: 'pickup' },
    { key: 'butcherOrders', label: 'הזמנות חנות בשר', icon: '🥩', tone: 'butcher' },
    { key: 'waiterCalls', label: 'קריאות מלצרים', icon: '🔔', tone: 'waiter' },
    { key: 'waitingDishes', label: 'מנות ממתינות', icon: '🍽️', tone: 'wait' },
    { key: 'readyDishes', label: 'מנות מוכנות', icon: '✅', tone: 'ready' },
  ];

  let bound = false;
  let active = false;
  let period = 'today';
  let loadSeq = 0;
  let unsubTill = null;
  let unsubBoard = null;
  let lastModel = null;
  let kpiState = Object.create(null);
  const rangeStore = [];
  const inflight = new Map();

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function toLocalYmd(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function todayYmd() {
    return toLocalYmd(new Date());
  }

  function yesterdayYmd() {
    return addDaysYmd(todayYmd(), -1);
  }

  function addDaysYmd(ymd, days) {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return ymd;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setDate(d.getDate() + days);
    return toLocalYmd(d);
  }

  function minYmd(a, b) {
    return String(a) < String(b) ? a : b;
  }

  function maxYmd(a, b) {
    return String(a) > String(b) ? a : b;
  }

  function parseYmd(ymd) {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function weekdayIndex(ymd) {
    const d = parseYmd(ymd);
    return d ? d.getDay() : 0;
  }

  function weekdayHe(ymd) {
    return WEEKDAYS_HE[weekdayIndex(ymd)] || '';
  }

  function eachYmd(start, end) {
    const out = [];
    let cursor = start;
    while (cursor && cursor <= end) {
      out.push(cursor);
      cursor = addDaysYmd(cursor, 1);
    }
    return out;
  }

  function weekRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - start.getDay());
    return { start: toLocalYmd(start), end: todayYmd() };
  }

  function weekDaysFull(anchorStart) {
    const start = anchorStart || weekRange().start;
    return eachYmd(start, addDaysYmd(start, 6));
  }

  function monthRange() {
    const now = new Date();
    return {
      start: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`,
      end: todayYmd(),
    };
  }

  function addMonthsStart(ymd, delta) {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return ymd;
    const d = new Date(Number(m[1]), Number(m[2]) - 1 + delta, 1);
    return toLocalYmd(d);
  }

  function lastDayOfMonth(startYmd) {
    const m = String(startYmd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return startYmd;
    return toLocalYmd(new Date(Number(m[1]), Number(m[2]), 0));
  }

  function isoHour(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.getHours();
  }

  function isoYmd(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return toLocalYmd(d);
  }

  function TillMath() {
    return window.LechaimAdminTill?.TillMath || null;
  }

  function isPaidClose(row) {
    const method = String(row?.payment_method || '').toLowerCase();
    return method === 'cash' || method === 'credit' || method === 'split';
  }

  function rowCash(row) {
    const math = TillMath();
    if (math?.sessionCashAmount) return math.sessionCashAmount(row);
    const n = Number(row?.paid_cash);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }

  function rowCredit(row) {
    const math = TillMath();
    if (math?.sessionCreditAmount) return math.sessionCreditAmount(row);
    const n = Number(row?.paid_credit);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }

  function rowTip(row) {
    const math = TillMath();
    if (math?.sessionTipAmount) return math.sessionTipAmount(row);
    const n = Number(row?.paid_tip);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }

  function rowSales(row) {
    if (!isPaidClose(row)) return 0;
    const math = TillMath();
    const value = rowCash(row) + rowCredit(row);
    return math?.roundMoney ? math.roundMoney(value) : Math.round(value * 100) / 100;
  }

  function roundMoney(amount) {
    const math = TillMath();
    if (math?.roundMoney) return math.roundMoney(amount);
    return Math.round((Number(amount) || 0) * 100) / 100;
  }

  function formatMoney(amount) {
    const n = Number(amount) || 0;
    return `€${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
  }

  function formatCount(n) {
    return String(Math.round(Number(n) || 0));
  }

  function formatPct(pct) {
    return `${Math.abs(Number(pct) || 0).toFixed(1)}%`;
  }

  function summarizeRows(rows) {
    const math = TillMath();
    if (math?.buildSummary) {
      const sums = math.buildSummary(rows);
      const paid = (rows || []).filter(isPaidClose);
      return {
        cash: roundMoney(sums.cash),
        credit: roundMoney(sums.credit),
        tip: roundMoney(sums.tip),
        sales: roundMoney((Number(sums.cash) || 0) + (Number(sums.credit) || 0)),
        orders: paid.length,
      };
    }
    let cash = 0;
    let credit = 0;
    let tip = 0;
    let orders = 0;
    (rows || []).forEach((row) => {
      if (!isPaidClose(row)) return;
      cash += rowCash(row);
      credit += rowCredit(row);
      tip += rowTip(row);
      orders += 1;
    });
    return {
      cash: roundMoney(cash),
      credit: roundMoney(credit),
      tip: roundMoney(tip),
      sales: roundMoney(cash + credit),
      orders,
    };
  }

  function withAvg(summary) {
    const next = summary || { cash: 0, credit: 0, tip: 0, sales: 0, orders: 0 };
    next.avg = next.orders ? roundMoney(next.sales / next.orders) : 0;
    return next;
  }

  function deltaOf(current, previous) {
    const cur = Number(current) || 0;
    const prev = Number(previous);
    if (!Number.isFinite(prev) || prev <= 0) return null;
    const pct = ((cur - prev) / prev) * 100;
    if (!Number.isFinite(pct)) return null;
    const dir = pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat';
    return { pct, dir };
  }

  function classifyDashType(row) {
    const classified = window.LechaimOrderTypes?.classifyOrderType?.(row?.order_type, 'admin-dashboard')
      ?? (() => {
        const raw = String(row?.order_type || '');
        if (raw === 'takeaway') return 'takeaway';
        if (raw === 'butcher') return 'butcher';
        if (raw === 'dine_in' || raw === 'dinein') return 'dine_in';
        if (raw === 'shabbat') return 'shabbat';
        return null;
      })();
    if (classified === 'dine_in') return 'table';
    if (classified === 'butcher') return 'butcher';
    if (classified === 'shabbat') return 'shabbat';
    if (classified === 'takeaway') {
      return String(row?.fulfillment_type || '') === 'delivery' ? 'delivery' : 'pickup';
    }
    return null;
  }

  function typeBuckets(rows) {
    const counts = Object.create(null);
    let total = 0;
    (rows || []).forEach((row) => {
      if (!isPaidClose(row)) return;
      const key = classifyDashType(row);
      if (!key || !TYPE_META[key]) return;
      counts[key] = (counts[key] || 0) + 1;
      total += 1;
    });
    return Object.keys(counts).map((key) => ({
      key,
      label: TYPE_META[key].label,
      color: TYPE_META[key].color,
      value: counts[key],
      pct: total ? Math.round((counts[key] / total) * 100) : 0,
    })).sort((a, b) => b.value - a.value);
  }

  function hourWindow(rows) {
    let minH = 10;
    let maxH = 23;
    (rows || []).forEach((row) => {
      const h = isoHour(row?.closed_at);
      if (h == null) return;
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    });
    const hours = [];
    for (let h = minH; h <= maxH; h += 1) hours.push(h);
    return hours;
  }

  function hourlySeries(rows, hours) {
    const sales = hours.map(() => 0);
    const orders = hours.map(() => 0);
    const tips = hours.map(() => 0);
    const index = new Map(hours.map((h, i) => [h, i]));
    (rows || []).forEach((row) => {
      if (!isPaidClose(row)) return;
      const h = isoHour(row.closed_at);
      if (h == null || !index.has(h)) return;
      const i = index.get(h);
      sales[i] = roundMoney(sales[i] + rowSales(row));
      tips[i] = roundMoney(tips[i] + rowTip(row));
      orders[i] += 1;
    });
    return { sales, orders, tips };
  }

  function dailySeries(rows, days) {
    const sales = days.map(() => 0);
    const orders = days.map(() => 0);
    const tips = days.map(() => 0);
    const index = new Map(days.map((d, i) => [d, i]));
    (rows || []).forEach((row) => {
      if (!isPaidClose(row)) return;
      const day = isoYmd(row.closed_at);
      if (!day || !index.has(day)) return;
      const i = index.get(day);
      sales[i] = roundMoney(sales[i] + rowSales(row));
      tips[i] = roundMoney(tips[i] + rowTip(row));
      orders[i] += 1;
    });
    return { sales, orders, tips };
  }

  function filterRowsByDay(rows, start, end) {
    return (rows || []).filter((row) => {
      const day = isoYmd(row?.closed_at);
      return day && day >= start && day <= end;
    });
  }

  function topProducts(products) {
    return (products || [])
      .map((row) => ({
        name: String(row?.name || row?.productId || 'מוצר').trim() || 'מוצר',
        qty: Math.max(0, Number(row?.qty) || 0),
        amount: row?.amount == null && row?.sales == null && row?.total == null
          ? null
          : Number(row.amount ?? row.sales ?? row.total),
      }))
      .filter((row) => row.qty > 0)
      .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, 'he'))
      .slice(0, 10);
  }

  function parallelPrevRange(kind) {
    if (kind === 'today') {
      const y = yesterdayYmd();
      return { start: y, end: y };
    }
    if (kind === 'yesterday') {
      const d = addDaysYmd(yesterdayYmd(), -1);
      return { start: d, end: d };
    }
    if (kind === 'week') {
      const cur = weekRange();
      const len = eachYmd(cur.start, cur.end).length;
      const prevEnd = addDaysYmd(cur.start, -1);
      const prevStart = addDaysYmd(prevEnd, -(len - 1));
      return { start: prevStart, end: prevEnd };
    }
    const cur = monthRange();
    const len = eachYmd(cur.start, cur.end).length;
    const prevStart = addMonthsStart(cur.start, -1);
    const prevMonthEnd = lastDayOfMonth(prevStart);
    const prevEnd = minYmd(addDaysYmd(prevStart, len - 1), prevMonthEnd);
    return { start: prevStart, end: prevEnd };
  }

  function neededWindow(kind) {
    if (kind === 'today') return parallelPrevRange('today');
    if (kind === 'yesterday') {
      const prev = parallelPrevRange('yesterday');
      return { start: prev.start, end: yesterdayYmd() };
    }
    if (kind === 'week') {
      const cur = weekRange();
      const prevStart = addDaysYmd(cur.start, -7);
      return { start: prevStart, end: cur.end };
    }
    const cur = monthRange();
    return { start: addMonthsStart(cur.start, -1), end: cur.end };
  }

  function coveringRows(start, end) {
    for (let i = 0; i < rangeStore.length; i += 1) {
      const slot = rangeStore[i];
      if (slot.start <= start && slot.end >= end) {
        return filterRowsByDay(slot.rows, start, end);
      }
    }
    return null;
  }

  function rememberRange(start, end, rows) {
    rangeStore.push({ start, end, rows: Array.isArray(rows) ? rows : [] });
  }

  function tillRowsForDate(ymd) {
    const snap = window.LechaimAdminTill?.getDashboardSnapshot?.();
    if (snap?.today?.date === ymd && Array.isArray(snap.today.rows)) return snap.today.rows;
    if (snap?.date === ymd && Array.isArray(snap.rows)) return snap.rows;
    return null;
  }

  async function fetchRangeRows(start, end) {
    const tillHit = start === end ? tillRowsForDate(start) : null;
    if (tillHit) return tillHit;
    const covered = coveringRows(start, end);
    if (covered) return covered;
    const key = `${start}:${end}`;
    if (inflight.has(key)) return inflight.get(key);
    const work = (async () => {
      const queryStart = maxYmd(start, GO_LIVE_YMD);
      if (queryStart > end) {
        rememberRange(start, end, []);
        return [];
      }
      const api = window.LechaimSupabaseOrders;
      if (typeof api?.getClosedSessionsRange !== 'function') {
        throw new Error('range-missing');
      }
      const rows = await api.getClosedSessionsRange(queryStart, end);
      const list = Array.isArray(rows) ? rows : [];
      rememberRange(queryStart, end, list);
      return filterRowsByDay(list, start, end);
    })();
    inflight.set(key, work);
    try {
      return await work;
    } finally {
      inflight.delete(key);
    }
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setBanner(message) {
    if (!bannerEl) return;
    if (!message) {
      bannerEl.hidden = true;
      bannerEl.textContent = '';
      return;
    }
    bannerEl.hidden = false;
    bannerEl.textContent = message;
  }

  function setLoading(on) {
    root?.classList.toggle('is-loading', Boolean(on));
  }

  function setPeriodAttr() {
    if (root) root.setAttribute('data-period', period);
  }

  function showTooltip(html, event) {
    if (!tooltipEl) return;
    tooltipEl.innerHTML = html;
    tooltipEl.hidden = false;
    const pad = 14;
    const x = event?.clientX || 0;
    const y = event?.clientY || 0;
    const box = tooltipEl.getBoundingClientRect();
    let left = x - box.width / 2;
    let top = y - box.height - 16;
    left = Math.max(pad, Math.min(left, window.innerWidth - box.width - pad));
    top = Math.max(pad, top);
    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
  }

  function hideTooltip() {
    if (!tooltipEl) return;
    tooltipEl.hidden = true;
  }

  function prefersReducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  }

  function animateValue(key, el, next, kind) {
    if (!el) return;
    const target = Number(next) || 0;
    const prev = kpiState[key];
    kpiState[key] = target;
    const write = (value) => {
      el.textContent = kind === 'money' ? formatMoney(value) : formatCount(value);
    };
    if (prev == null || prefersReducedMotion() || Math.abs(target - prev) < 0.005) {
      write(target);
      return;
    }
    const from = prev;
    const startedAt = performance.now();
    const duration = 420;
    function frame(now) {
      const t = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      write(from + (target - from) * eased);
      if (t < 1 && kpiState[key] === target) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function liveSnapshot() {
    return window.LechaimAdminTables?.getLiveSnapshot?.() || {
      openTables: 0,
      tableTotal: 0,
      tables: [],
      activeDeliveries: 0,
      activePickups: 0,
      butcherOrders: 0,
      waiterCalls: 0,
      waitingDishes: 0,
      readyDishes: 0,
      kitchenActive: 0,
      activeOrders: 0,
    };
  }

  function renderClock() {
    const now = new Date();
    if (clockTimeEl) {
      clockTimeEl.textContent = now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    }
    if (clockDateEl) {
      clockDateEl.textContent = now.toLocaleDateString('he-IL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
    }
  }

  function sparkFromModel(model) {
    if (!model?.rows) return [];
    if (model.mode === 'week') return dailySeries(model.rows, model.weekDays || weekDaysFull()).sales;
    if (model.mode === 'daily') return dailySeries(model.rows, model.days || []).sales;
    return hourlySeries(model.rows, hourWindow(model.rows)).sales;
  }

  function paintSpark(svg, values, color) {
    if (!svg) return;
    const list = (values || []).map((n) => Number(n) || 0);
    if (list.length < 2 || list.every((n) => n <= 0)) {
      svg.innerHTML = '';
      return;
    }
    const max = Math.max(...list, 0.01);
    const w = 120;
    const h = 28;
    const pts = list.map((value, i) => {
      const x = i * (w / (list.length - 1));
      const y = h - 3 - (value / max) * (h - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    svg.innerHTML = `<polyline fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" points="${pts}"></polyline>`;
  }

  function setSat(key, value, hot) {
    const node = root?.querySelector(`[data-sat="${key}"]`);
    if (!node) return;
    const val = node.querySelector('[data-sat-value]');
    if (val) val.textContent = formatCount(value);
    node.classList.toggle('is-hot', Boolean(hot));
  }

  function renderCoreGauge(live) {
    if (!coreGaugeEl) return;
    const total = Math.max(0, Number(live.tableTotal) || 0);
    const open = Number(live.openTables) || 0;
    const active = Number(live.activeOrders) || 0;
    const busy = active > 0 || open > 0
      || (Number(live.kitchenActive) || 0) > 0
      || (Number(live.activeDeliveries) || 0) > 0
      || (Number(live.activePickups) || 0) > 0;
    const liveR = 100;
    const innerR = 72;
    const liveCirc = 2 * Math.PI * liveR;
    const innerCirc = 2 * Math.PI * innerR;
    const liveArc = (busy ? 0.9 : 0.28) * liveCirc;
    const innerPct = total > 0 ? Math.min(1, active / Math.max(total, 1)) : (active > 0 ? 0.7 : 0.12);
    const innerArc = innerPct * innerCirc;
    const valueEl = coreGaugeEl.querySelector('.dash-gauge-value');
    const liveArcEl = coreGaugeEl.querySelector('.dash-gauge-live');
    const innerArcEl = coreGaugeEl.querySelector('.dash-gauge-arc');
    const svg = coreGaugeEl.querySelector('svg');
    if (valueEl && liveArcEl && innerArcEl && svg?.querySelector('.dash-gauge-spin')) {
      valueEl.textContent = formatCount(active);
      liveArcEl.style.setProperty('--arc', liveArc.toFixed(2));
      liveArcEl.style.setProperty('--gap', (liveCirc - liveArc).toFixed(2));
      innerArcEl.style.setProperty('--arc', innerArc.toFixed(2));
      innerArcEl.style.setProperty('--gap', (innerCirc - innerArc).toFixed(2));
      svg.classList.toggle('is-live', busy);
      coreGaugeEl.classList.toggle('is-live', busy);
    } else {
      coreGaugeEl.classList.toggle('is-live', busy);
      coreGaugeEl.innerHTML = `<svg class="dash-gauge-svg${busy ? ' is-live' : ''}" viewBox="0 0 240 240" role="img" aria-label="הזמנות פעילות">
        <defs>
          <linearGradient id="ccGauge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#3ee0c2"/>
            <stop offset="100%" stop-color="#c4a06a"/>
          </linearGradient>
          <linearGradient id="ccLive" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#3dd68c"/>
            <stop offset="100%" stop-color="#4da3ff"/>
          </linearGradient>
        </defs>
        <circle class="dash-gauge-spin" cx="120" cy="120" r="112"></circle>
        <circle class="dash-gauge-live-track" cx="120" cy="120" r="${liveR}"></circle>
        <circle class="dash-gauge-live" cx="120" cy="120" r="${liveR}" style="--arc:${liveArc.toFixed(2)}; --gap:${(liveCirc - liveArc).toFixed(2)}"></circle>
        <circle class="dash-gauge-track" cx="120" cy="120" r="${innerR}"></circle>
        <circle class="dash-gauge-arc" cx="120" cy="120" r="${innerR}" style="--arc:${innerArc.toFixed(2)}; --gap:${(innerCirc - innerArc).toFixed(2)}"></circle>
        <text class="dash-gauge-kicker" x="120" y="96">חי</text>
        <text class="dash-gauge-label" x="120" y="118">פעילות</text>
        <text class="dash-gauge-value" x="120" y="154">${escapeHtml(formatCount(active))}</text>
      </svg>`;
    }
    setSat('tables', open, open > 0);
    setSat('kitchen', live.kitchenActive || ((live.waitingDishes || 0) + (live.readyDishes || 0)), (live.kitchenActive || 0) > 0);
    setSat('delivery', live.activeDeliveries, live.activeDeliveries > 0);
    setSat('pickup', live.activePickups, live.activePickups > 0);
  }

  function ringMarkup(item) {
    const r = 54;
    const circ = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(1, Number(item.pct) || 0));
    const arc = pct * circ;
    return `<article class="dash-ring dash-ring--${escapeHtml(item.key || 'mod')}">
      <svg viewBox="0 0 140 140" aria-hidden="true">
        <circle class="dash-ring-spin" cx="70" cy="70" r="64"></circle>
        <circle class="dash-ring-track" cx="70" cy="70" r="${r}"></circle>
        <circle class="dash-ring-arc" cx="70" cy="70" r="${r}" stroke="${item.color}" style="--arc:${arc.toFixed(2)}; --gap:${(circ - arc).toFixed(2)}"></circle>
      </svg>
      <h3>${escapeHtml(item.label)}</h3>
      <strong>${escapeHtml(item.display)}</strong>
    </article>`;
  }

  function renderControlRings(summary, live, compare, rebuild) {
    if (!ringsEl) return;
    const sales = Number(summary?.sales) || 0;
    const cash = Number(summary?.cash) || 0;
    const orders = Number(summary?.orders) || 0;
    const prevOrders = Number(compare?.orders) || 0;
    const kitchen = Number(live.kitchenActive) || ((Number(live.waitingDishes) || 0) + (Number(live.readyDishes) || 0));
    const ready = Number(live.readyDishes) || 0;
    const tableTotal = Number(live.tableTotal) || 0;
    const open = Number(live.openTables) || 0;
    if (!rebuild && ringsEl.children.length === 5) {
      const displays = [
        formatMoney(sales),
        formatCount(orders),
        tableTotal ? `${formatCount(open)}/${formatCount(tableTotal)}` : formatCount(open),
        formatCount(kitchen),
        formatCount(live.activeDeliveries),
      ];
      ringsEl.querySelectorAll('.dash-ring strong').forEach((el, i) => {
        if (displays[i] != null) el.textContent = displays[i];
      });
      return;
    }
    ringsEl.innerHTML = [
      ringMarkup({
        key: 'sales',
        label: 'מכירות',
        display: formatMoney(sales),
        pct: sales > 0 ? cash / sales : 0,
        color: '#c4a06a',
      }),
      ringMarkup({
        key: 'orders',
        label: 'הזמנות',
        display: formatCount(orders),
        pct: prevOrders > 0 ? Math.min(1, orders / Math.max(orders, prevOrders)) : (orders > 0 ? 1 : 0),
        color: '#9b7dff',
      }),
      ringMarkup({
        key: 'tables',
        label: 'שולחנות',
        display: tableTotal ? `${formatCount(open)}/${formatCount(tableTotal)}` : formatCount(open),
        pct: tableTotal > 0 ? open / tableTotal : 0,
        color: '#3dd68c',
      }),
      ringMarkup({
        key: 'kitchen',
        label: 'מטבח',
        display: formatCount(kitchen),
        pct: kitchen > 0 ? ready / kitchen : 0,
        color: '#ff8a4c',
      }),
      ringMarkup({
        key: 'delivery',
        label: 'משלוחים',
        display: formatCount(live.activeDeliveries),
        pct: (Number(live.activeDeliveries) || 0) > 0 ? 1 : 0,
        color: '#4da3ff',
      }),
    ].join('');
  }

  function kitchenOrb(label, value, pct, kind, hot, warn) {
    const r = 26;
    const circ = 2 * Math.PI * r;
    const p = Math.max(0, Math.min(1, Number(pct) || 0));
    const arc = p * circ;
    return `<div class="dash-orb dash-orb--${kind}${hot ? ' is-hot' : ''}${warn ? ' is-warn' : ''}">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle class="dash-orb-track" cx="32" cy="32" r="${r}"></circle>
        <circle class="dash-orb-arc" cx="32" cy="32" r="${r}" style="--arc:${arc.toFixed(2)}; --gap:${(circ - arc).toFixed(2)}"></circle>
      </svg>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(formatCount(value))}</strong>
    </div>`;
  }

  function renderKitchenMonitor(live) {
    if (!kitchenBody) return;
    const waiting = Number(live.waitingDishes) || 0;
    const ready = Number(live.readyDishes) || 0;
    const active = Number(live.kitchenActive) || (waiting + ready);
    const denom = Math.max(active, 1);
    const warn = waiting > ready && waiting > 0;
    kitchenBody.innerHTML = `<div class="dash-kitchen${warn ? ' is-warn' : ''}">
      ${kitchenOrb('מוכן', ready, ready / denom, 'ready', ready > 0)}
      ${kitchenOrb('ממתין', waiting, waiting / denom, 'wait', waiting > 0, warn)}
      ${kitchenOrb('פעיל', active, active > 0 ? 1 : 0.12, 'active', active > 0)}
    </div>`;
  }

  function renderTableActivity(live) {
    if (!tablesBody) return;
    const tables = Array.isArray(live.tables) ? live.tables : [];
    if (!tables.length) {
      tablesBody.innerHTML = emptyChart('אין שולחנות בלוח', 'ברגע שהלוח החי יטען תופיע פעילות השולחנות');
      return;
    }
    tablesBody.innerHTML = `<div class="dash-table-grid">${tables.map((row) => {
      const status = row.status === 'waiter' ? 'waiter' : (row.status === 'active' ? 'active' : 'free');
      const num = row.tableNumber == null ? '' : String(row.tableNumber);
      return `<span class="dash-node dash-node--${status}" data-status="${status}" title="${escapeHtml(num)}">${escapeHtml(num)}</span>`;
    }).join('')}</div>
    <p class="dash-table-legend">
      <i class="dash-node--free"></i> פנוי
      <i class="dash-node--active"></i> פעיל
      <i class="dash-node--waiter"></i> קריאת מלצר
    </p>`;
  }

  function renderFulfillment(live) {
    const d = Number(live.activeDeliveries) || 0;
    const p = Number(live.activePickups) || 0;
    if (deliveryBody) {
      deliveryBody.innerHTML = `<div class="dash-run${d > 0 ? ' is-hot' : ''}"><span>ערוץ חי</span><strong>${escapeHtml(formatCount(d))}</strong><em>משלוחים פעילים</em></div>`;
    }
    if (pickupBody) {
      pickupBody.innerHTML = `<div class="dash-run${p > 0 ? ' is-hot' : ''}"><span>ערוץ חי</span><strong>${escapeHtml(formatCount(p))}</strong><em>איסופים פעילים</em></div>`;
    }
  }

  function renderLiveLayer(live, summary, compare, rebuild) {
    renderClock();
    renderCoreGauge(live);
    renderControlRings(summary || lastModel?.summary || { sales: 0, cash: 0, credit: 0, tip: 0, orders: 0 }, live, compare || lastModel?.compare, rebuild);
    renderKitchenMonitor(live);
    renderTableActivity(live);
    renderFulfillment(live);
  }

  function emptyChart(title, text) {
    return `<div class="dash-empty">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(text)}</span>
    </div>`;
  }

  function skeletonChart() {
    return `<div class="dash-skel" aria-hidden="true"></div>`;
  }

  function niceMax(value) {
    const n = Number(value) || 0;
    if (n <= 0) return 1;
    const pad = n * 1.18;
    const pow = Math.pow(10, Math.floor(Math.log10(pad)));
    return Math.ceil(pad / pow) * pow;
  }

  function axisLabel(value, kind) {
    if (kind === 'money') return formatMoney(value);
    return formatCount(value);
  }

  function bindHits(el, handler) {
    el.querySelectorAll('.dash-hit').forEach((hit) => {
      hit.addEventListener('pointerenter', (event) => handler(hit, event));
      hit.addEventListener('pointermove', (event) => handler(hit, event));
      hit.addEventListener('pointerleave', hideTooltip);
    });
  }

  function renderCartesian(el, labels, values, options) {
    if (!el) return;
    const kind = options.kind || 'money';
    const accent = options.accent || '#c4a06a';
    const compareAccent = options.compareAccent || '#2d4a73';
    const mode = options.mode || 'area';
    const compareValues = Array.isArray(options.compareValues) ? options.compareValues : null;
    const avgValue = Number.isFinite(options.avgValue) ? options.avgValue : null;
    if (trendLegendEl && options.legendEl === trendLegendEl) {
      if (options.legendHtml) {
        trendLegendEl.hidden = false;
        trendLegendEl.innerHTML = options.legendHtml;
      } else {
        trendLegendEl.hidden = true;
        trendLegendEl.innerHTML = '';
      }
    }
    if (!labels.length) {
      el.innerHTML = emptyChart(options.emptyTitle || 'אין נתונים', options.emptyText || 'עדיין אין סגירות בתקופה הזו');
      return;
    }
    const all = values.concat(compareValues || []).concat(avgValue == null ? [] : [avgValue]);
    const max = niceMax(Math.max(0, ...all));
    const w = 840;
    const h = options.height || 300;
    const pad = { top: 22, right: 18, bottom: 42, left: 58 };
    const innerW = w - pad.left - pad.right;
    const innerH = h - pad.top - pad.bottom;
    const step = labels.length > 1 ? innerW / (labels.length - (mode === 'bar' ? 0 : 1)) : innerW;
    const groupW = innerW / Math.max(labels.length, 1);
    const barW = mode === 'bar'
      ? Math.max(7, Math.min(compareValues ? 18 : 36, groupW * (compareValues ? 0.28 : 0.55)))
      : 0;
    function pointX(i) {
      return mode === 'bar'
        ? pad.left + (i + 0.5) * groupW
        : pad.left + i * (labels.length > 1 ? innerW / (labels.length - 1) : 0);
    }
    function pointY(value) {
      return pad.top + innerH - (innerH * (Number(value) || 0) / max);
    }
    const points = values.map((value, i) => ({
      x: pointX(i),
      y: pointY(value),
      value: Number(value) || 0,
      compare: compareValues ? Number(compareValues[i]) || 0 : null,
      label: labels[i],
    }));
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const area = points.length
      ? `${line} L${points[points.length - 1].x.toFixed(1)},${(pad.top + innerH).toFixed(1)} L${points[0].x.toFixed(1)},${(pad.top + innerH).toFixed(1)} Z`
      : '';
    const grids = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const y = pad.top + innerH * (1 - t);
      return `<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${w - pad.right}" y2="${y.toFixed(1)}" class="dash-grid"></line>
        <text x="${pad.left - 8}" y="${y + 4}" class="dash-axis dash-axis--y">${escapeHtml(axisLabel(max * t, kind))}</text>`;
    }).join('');
    const xLabels = points.map((p, i) => {
      const show = labels.length <= 14 || i % Math.ceil(labels.length / 12) === 0 || i === labels.length - 1;
      return show
        ? `<text x="${p.x.toFixed(1)}" y="${h - 14}" class="dash-axis dash-axis--x">${escapeHtml(p.label)}</text>`
        : '';
    }).join('');
    let series = '';
    if (mode === 'bar') {
      series = points.map((p, i) => {
        const bh = Math.max(0, pad.top + innerH - p.y);
        if (compareValues) {
          const cx = p.x - barW - 2;
          const px = p.x + 2;
          const cy = pointY(p.compare);
          const ch = Math.max(0, pad.top + innerH - cy);
          return `<rect class="dash-bar dash-bar--compare" data-i="${i}" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" width="${barW.toFixed(1)}" height="${ch.toFixed(1)}" rx="6"></rect>
            <rect class="dash-bar" data-i="${i}" x="${px.toFixed(1)}" y="${p.y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="6"></rect>`;
        }
        return `<rect class="dash-bar" data-i="${i}" x="${(p.x - barW / 2).toFixed(1)}" y="${p.y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="7"></rect>`;
      }).join('');
    } else {
      series = `<path class="dash-area" d="${area}"></path>
         <path class="dash-line" d="${line}"></path>
         ${points.map((p, i) => `<circle class="dash-dot" data-i="${i}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5"></circle>`).join('')}`;
    }
    const avgY = avgValue == null ? '' : (() => {
      const y = pointY(avgValue);
      return `<line class="dash-avg" x1="${pad.left}" y1="${y.toFixed(1)}" x2="${w - pad.right}" y2="${y.toFixed(1)}"></line>
        <text class="dash-avg-label" x="${w - pad.right}" y="${(y - 6).toFixed(1)}">ממוצע ${escapeHtml(axisLabel(avgValue, kind))}</text>`;
    })();
    const hits = points.map((p, i) => {
      const hw = mode === 'bar' ? Math.max(barW + 16, groupW) : Math.max(18, innerW / Math.max(labels.length, 1));
      return `<rect class="dash-hit" data-i="${i}" x="${(p.x - hw / 2).toFixed(1)}" y="${pad.top}" width="${hw.toFixed(1)}" height="${innerH}"></rect>`;
    }).join('');
    const gid = `dashGrad-${options.id || 'c'}`;
    el.innerHTML = `<svg class="dash-svg dash-svg--${mode}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHtml(options.title || '')}" dir="ltr">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0.42"/>
          <stop offset="100%" stop-color="${accent}" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      ${grids}
      ${avgY}
      <g style="--dash-accent:${accent}; --dash-compare:${compareAccent}; --dash-fill:url(#${gid})">${series}</g>
      ${xLabels}
      ${hits}
    </svg>`;
    const svg = el.querySelector('.dash-svg');
    if (svg) {
      if (prefersReducedMotion()) svg.classList.add('is-draw');
      else requestAnimationFrame(() => svg.classList.add('is-draw'));
    }
    bindHits(el, (hit, event) => {
      const i = Number(hit.getAttribute('data-i'));
      const point = points[i];
      if (!point) return;
      const extra = point.compare == null
        ? ''
        : `<em>${escapeHtml(options.compareLabel || 'תקופה קודמת')} ${escapeHtml(axisLabel(point.compare, kind))}</em>`;
      showTooltip(
        `<strong>${escapeHtml(point.label)}</strong><span>${escapeHtml(options.seriesLabel || 'התקופה')} ${escapeHtml(axisLabel(point.value, kind))}</span>${extra}`,
        event
      );
    });
  }

  function renderDonut(el, cash, credit) {
    if (!el) return;
    const total = roundMoney((Number(cash) || 0) + (Number(credit) || 0));
    if (total <= 0) {
      el.innerHTML = emptyChart('אין תמהיל עדיין', 'ברגע שתהיה מכירה יופיע כאן מזומן מול אשראי');
      return;
    }
    const parts = [
      { label: 'מזומן', value: Number(cash) || 0, color: '#2f7d6d' },
      { label: 'אשראי', value: Number(credit) || 0, color: '#2d6a9f' },
    ].filter((part) => part.value > 0);
    const r = 68;
    const c = 2 * Math.PI * r;
    let offset = 0;
    const rings = parts.map((part) => {
      const len = (part.value / total) * c;
      const dash = `<circle class="dash-donut-seg" cx="90" cy="90" r="${r}" stroke="${part.color}" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"></circle>`;
      offset += len;
      return dash;
    }).join('');
    const legend = parts.map((part) => (
      `<li><i style="background:${part.color}"></i><span>${escapeHtml(part.label)}</span><strong>${escapeHtml(formatMoney(part.value))}</strong><em>${Math.round((part.value / total) * 100)}%</em></li>`
    )).join('');
    el.innerHTML = `<div class="dash-donut">
      <svg class="dash-svg dash-svg--donut" viewBox="0 0 180 180" role="img" aria-label="מזומן מול אשראי">
        <circle class="dash-donut-track" cx="90" cy="90" r="${r}"></circle>
        ${rings}
        <text x="90" y="86" class="dash-donut-total">${escapeHtml(formatMoney(total))}</text>
        <text x="90" y="108" class="dash-donut-cap">מכירות</text>
      </svg>
      <ul class="dash-legend">${legend}</ul>
    </div>`;
  }

  function renderTypeBars(el, buckets) {
    if (!el) return;
    if (!buckets.length) {
      el.innerHTML = emptyChart('אין פילוח עדיין', 'סוגי ההזמנות יופיעו לפי הסגירות בפועל');
      return;
    }
    const max = Math.max(1, ...buckets.map((row) => row.value));
    el.innerHTML = `<ul class="dash-hlist dash-hlist--pct">${buckets.map((row) => `
      <li>
        <span class="dash-hlist__name">${escapeHtml(row.label)}</span>
        <span class="dash-hlist__track"><i style="width:${Math.max(8, (row.value / max) * 100)}%;background:${row.color}"></i></span>
        <strong>${escapeHtml(formatCount(row.value))}</strong>
        <em>${escapeHtml(String(row.pct))}%</em>
      </li>`).join('')}</ul>`;
  }

  function renderTop(el, products, allowed) {
    if (!el) return;
    if (!allowed) {
      el.innerHTML = emptyChart('זמין להיום', 'עשרת המוצרים המובילים נטענים רק ממכירות היום שכבר בקופה. אין שליפה לתקופות אחרות.');
      return;
    }
    if (!products.length) {
      el.innerHTML = emptyChart('עדיין אין מוצרים', 'המנה הראשונה שתיסגר היום תופיע כאן');
      return;
    }
    const max = Math.max(1, ...products.map((row) => row.qty));
    el.innerHTML = `<ol class="dash-top">${products.map((row, i) => `
      <li>
        <em>${i + 1}</em>
        <div>
          <strong>${escapeHtml(row.name)}</strong>
          <span class="dash-hlist__track"><i style="width:${Math.max(8, (row.qty / max) * 100)}%"></i></span>
        </div>
        <b>${escapeHtml(formatCount(row.qty))}</b>
        ${row.amount != null && Number.isFinite(row.amount) ? `<small>${escapeHtml(formatMoney(row.amount))}</small>` : ''}
      </li>`).join('')}</ol>`;
  }

  function deltaHtml(delta) {
    if (!delta) {
      return `<span class="dash-delta dash-delta--na">אין נתוני השוואה</span>`;
    }
    const arrow = delta.dir === 'down' ? '↓' : delta.dir === 'up' ? '↑' : '→';
    return `<span class="dash-delta dash-delta--${delta.dir}">${arrow} ${escapeHtml(formatPct(delta.pct))}</span>`;
  }

  function renderKpiDeltas(summary, compare, liveKeys) {
    const cur = withAvg(summary);
    const prev = compare ? withAvg(compare) : null;
    const map = {
      sales: prev ? deltaOf(cur.sales, prev.sales) : null,
      cash: prev ? deltaOf(cur.cash, prev.cash) : null,
      credit: prev ? deltaOf(cur.credit, prev.credit) : null,
      tips: prev ? deltaOf(cur.tip, prev.tip) : null,
      orders: prev ? deltaOf(cur.orders, prev.orders) : null,
      avg: prev ? deltaOf(cur.avg, prev.avg) : null,
      tables: null,
      active: null,
    };
    Object.keys(map).forEach((key) => {
      const el = root?.querySelector(`[data-kpi="${key}"] [data-kpi-delta]`);
      if (!el) return;
      if (liveKeys && (key === 'tables' || key === 'active')) {
        el.innerHTML = deltaHtml(null);
        return;
      }
      el.innerHTML = deltaHtml(map[key]);
    });
  }

  function renderKpis(summary, live, compare) {
    const avg = summary.orders ? roundMoney(summary.sales / summary.orders) : 0;
    const map = {
      sales: { value: summary.sales, kind: 'money' },
      cash: { value: summary.cash, kind: 'money' },
      credit: { value: summary.credit, kind: 'money' },
      tips: { value: summary.tip, kind: 'money' },
      orders: { value: summary.orders, kind: 'count' },
      avg: { value: avg, kind: 'money' },
      tables: { value: live.openTables, kind: 'count' },
      active: { value: live.activeOrders, kind: 'count' },
    };
    Object.keys(map).forEach((key) => {
      const card = root?.querySelector(`[data-kpi="${key}"]`);
      const el = card?.querySelector('[data-kpi-value]');
      animateValue(key, el, map[key].value, map[key].kind);
    });
    renderKpiDeltas(summary, compare, true);
    const spark = lastModel
      ? (lastModel.mode === 'week'
        ? dailySeries(lastModel.rows, lastModel.weekDays || weekDaysFull())
        : lastModel.mode === 'daily'
          ? dailySeries(lastModel.rows, lastModel.days || [])
          : hourlySeries(lastModel.rows, hourWindow(lastModel.rows)))
      : { sales: [], orders: [], tips: [] };
    const sparkByKey = {
      sales: spark.sales,
      cash: spark.sales,
      credit: spark.sales,
      tips: spark.tips || spark.sales,
      orders: spark.orders,
      avg: spark.sales,
      tables: spark.orders,
      active: spark.orders,
    };
    const colors = {
      sales: '#c4a06a',
      cash: '#3dd68c',
      credit: '#4da3ff',
      tips: '#ff8a4c',
      orders: '#9b7dff',
      avg: '#3ee0c2',
      tables: '#3dd68c',
      active: '#ff5d6c',
    };
    Object.keys(sparkByKey).forEach((key) => {
      paintSpark(root?.querySelector(`[data-kpi="${key}"] [data-kpi-spark]`), sparkByKey[key], colors[key]);
    });
  }

  function renderLive(live) {
    renderLiveLayer(live, lastModel?.summary, lastModel?.compare);
  }

  function hourLabels(hours) {
    return hours.map((h) => `${pad2(h)}:00`);
  }

  function dayLabels(days) {
    return days.map((ymd) => {
      const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return m ? `${m[3]}/${m[2]}` : ymd;
    });
  }

  function weekDayLabels(days) {
    return days.map((ymd) => weekdayHe(ymd));
  }

  function renderWeekCompare(cur, prev) {
    if (!weekCompareBody) return;
    if (!cur) {
      weekCompareBody.innerHTML = skeletonChart();
      return;
    }
    const a = withAvg(cur);
    const b = prev ? withAvg(prev) : null;
    const rows = [
      { key: 'sales', label: 'מכירות', kind: 'money' },
      { key: 'orders', label: 'הזמנות', kind: 'count' },
      { key: 'avg', label: 'ממוצע להזמנה', kind: 'money' },
      { key: 'tip', label: 'טיפים', kind: 'money' },
    ];
    weekCompareBody.innerHTML = `<div class="dash-compare">
      ${rows.map((row) => {
        const current = a[row.key] || 0;
        const previous = b ? (b[row.key] || 0) : null;
        const delta = b ? deltaOf(current, previous) : null;
        const fmt = row.kind === 'money' ? formatMoney : formatCount;
        return `<div class="dash-compare__row">
          <span class="dash-compare__label">${escapeHtml(row.label)}</span>
          <strong>${escapeHtml(fmt(current))}</strong>
          <span class="dash-compare__prev">${b ? escapeHtml(fmt(previous)) : '—'}</span>
          ${deltaHtml(delta)}
        </div>`;
      }).join('')}
    </div>`;
  }

  function renderStrongDays(days, sales) {
    if (!strongDaysBody) return;
    const ranked = days.map((ymd, i) => ({
      ymd,
      label: `${weekdayHe(ymd)} · ${dayLabels([ymd])[0]}`,
      sales: Number(sales[i]) || 0,
    })).filter((row) => row.sales > 0).sort((a, b) => b.sales - a.sales).slice(0, 5);
    if (!ranked.length) {
      strongDaysBody.innerHTML = emptyChart('אין ימים לדירוג', 'ברגע שתהיינה מכירות בתקופה הן יופיעו כאן');
      return;
    }
    const max = Math.max(1, ...ranked.map((row) => row.sales));
    strongDaysBody.innerHTML = `<ol class="dash-rank">${ranked.map((row, i) => `
      <li>
        <em>${i + 1}</em>
        <div>
          <strong>${escapeHtml(row.label)}</strong>
          <span class="dash-hlist__track"><i style="width:${Math.max(10, (row.sales / max) * 100)}%"></i></span>
        </div>
        <b>${escapeHtml(formatMoney(row.sales))}</b>
      </li>`).join('')}</ol>`;
  }

  function renderPeakHours(rows) {
    if (!peakHoursBody) return;
    const hours = hourWindow(rows);
    const series = hourlySeries(rows, hours);
    const max = Math.max(0, ...series.orders, ...series.sales);
    if (max <= 0) {
      peakHoursBody.innerHTML = emptyChart('אין שעות עומס', 'שעות עם הזמנות יופיעו כאן לפי הסגירות שכבר נטענו');
      return;
    }
    const peak = hours.map((hour, i) => ({
      hour,
      orders: series.orders[i],
      sales: series.sales[i],
    })).sort((a, b) => b.orders - a.orders || b.sales - a.sales);
    const top = peak[0];
    peakHoursBody.innerHTML = `<div class="dash-heat" dir="ltr">${hours.map((hour, i) => {
      const intensity = series.orders[i] / Math.max(1, Math.max(...series.orders));
      return `<button type="button" class="dash-heat__cell" data-h="${hour}" style="--heat:${intensity.toFixed(3)}" title="${pad2(hour)}:00">
        <span>${pad2(hour)}</span>
        <strong>${series.orders[i]}</strong>
      </button>`;
    }).join('')}</div>
    <p class="dash-peak-note">שיא: ${escapeHtml(pad2(top.hour))}:00 · ${escapeHtml(formatCount(top.orders))} הזמנות · ${escapeHtml(formatMoney(top.sales))}</p>`;
    peakHoursBody.querySelectorAll('.dash-heat__cell').forEach((cell) => {
      cell.addEventListener('pointerenter', (event) => {
        const hour = Number(cell.getAttribute('data-h'));
        const i = hours.indexOf(hour);
        if (i < 0) return;
        showTooltip(
          `<strong>${escapeHtml(pad2(hour))}:00</strong><span>${escapeHtml(formatCount(series.orders[i]))} הזמנות</span><em>${escapeHtml(formatMoney(series.sales[i]))}</em>`,
          event
        );
      });
      cell.addEventListener('pointermove', (event) => {
        const hour = Number(cell.getAttribute('data-h'));
        const i = hours.indexOf(hour);
        if (i < 0) return;
        showTooltip(
          `<strong>${escapeHtml(pad2(hour))}:00</strong><span>${escapeHtml(formatCount(series.orders[i]))} הזמנות</span><em>${escapeHtml(formatMoney(series.sales[i]))}</em>`,
          event
        );
      });
      cell.addEventListener('pointerleave', hideTooltip);
    });
  }

  function renderClosedVisuals(model) {
    const { rows, products, summary, mode, rangeLabel } = model;
    if (trendMetaEl) trendMetaEl.textContent = rangeLabel || '';
    if (mode === 'week') {
      if (trendTitleEl) trendTitleEl.textContent = 'מכירות לפי יום';
      if (ordersTitleEl) ordersTitleEl.textContent = 'הזמנות לפי יום';
      const days = model.weekDays || weekDaysFull();
      const prevDays = model.prevWeekDays || weekDaysFull(addDaysYmd(days[0], -7));
      const current = dailySeries(rows, days);
      const previous = dailySeries(model.prevRows || [], prevDays);
      renderCartesian(trendChartEl, weekDayLabels(days), current.sales, {
        id: 'sales-week',
        kind: 'money',
        mode: 'bar',
        accent: '#c4a06a',
        compareAccent: '#2d4a73',
        compareValues: previous.sales,
        seriesLabel: 'השבוע',
        compareLabel: 'שבוע קודם',
        title: 'מכירות לפי יום',
        height: 320,
        legendEl: trendLegendEl,
        legendHtml: `<i class="is-now"></i> השבוע <i class="is-prev"></i> שבוע קודם`,
        emptyTitle: 'אין מכירות השבוע',
        emptyText: 'סגירות השבוע יופיעו כאן לפי ימים',
      });
      renderCartesian(ordersChartEl, weekDayLabels(days), current.orders, {
        id: 'orders-week',
        kind: 'count',
        mode: 'bar',
        accent: '#2d6a9f',
        title: 'הזמנות לפי יום',
        height: 220,
        emptyTitle: 'אין הזמנות השבוע',
        emptyText: 'עומס יומי לפי סגירות אמיתיות',
      });
      renderCartesian(tipsChartEl, weekDayLabels(days), current.tips, {
        id: 'tips-week',
        kind: 'money',
        mode: 'bar',
        accent: '#c45a2d',
        title: 'טיפים לפי יום',
        height: 220,
        emptyTitle: 'אין טיפים השבוע',
        emptyText: 'טיפים יומיים מחושבים מאותן שורות סגירה',
      });
      renderWeekCompare(summary, model.compare);
      renderStrongDays(days, current.sales);
    } else if (mode === 'daily') {
      if (trendTitleEl) trendTitleEl.textContent = 'מכירות לפי יום בחודש';
      if (ordersTitleEl) ordersTitleEl.textContent = 'הזמנות לפי יום';
      const days = model.days || [];
      const series = dailySeries(rows, days);
      const avg = series.sales.length
        ? roundMoney(series.sales.reduce((sum, n) => sum + n, 0) / series.sales.length)
        : 0;
      renderCartesian(trendChartEl, dayLabels(days), series.sales, {
        id: 'sales-day',
        kind: 'money',
        mode: 'bar',
        accent: '#c4a06a',
        avgValue: avg,
        seriesLabel: 'החודש',
        title: 'מכירות לפי יום בחודש',
        height: 320,
        legendEl: trendLegendEl,
        legendHtml: `<i class="is-now"></i> מכירות ליום <i class="is-avg"></i> ממוצע יומי`,
        emptyTitle: 'אין מכירות בחודש',
        emptyText: 'ברגע שתיסגר הזמנה היא תופיע כאן לפי יום',
      });
      renderCartesian(ordersChartEl, dayLabels(days), series.orders, {
        id: 'orders-day',
        kind: 'count',
        mode: 'bar',
        accent: '#2d6a9f',
        title: 'הזמנות לפי יום',
        height: 220,
        emptyTitle: 'אין הזמנות בחודש',
        emptyText: 'עומס יומי יופיע כאן לפי סגירות אמיתיות',
      });
      if (tipsChartEl) tipsChartEl.innerHTML = '';
      renderStrongDays(days, series.sales);
    } else {
      if (trendTitleEl) trendTitleEl.textContent = 'מכירות לפי שעה';
      if (ordersTitleEl) ordersTitleEl.textContent = 'הזמנות לפי שעה';
      if (trendLegendEl) {
        trendLegendEl.hidden = true;
        trendLegendEl.innerHTML = '';
      }
      const hours = hourWindow(rows);
      const series = hourlySeries(rows, hours);
      renderCartesian(trendChartEl, hourLabels(hours), series.sales, {
        id: 'sales-hour',
        kind: 'money',
        mode: 'area',
        accent: '#c4a06a',
        seriesLabel: 'מכירות',
        title: 'מכירות לפי שעה',
        height: 320,
        emptyTitle: 'עדיין אין מכירות',
        emptyText: 'הגרף מתמלא משורות הסגירה שכבר נטענו בקופה',
      });
      renderCartesian(ordersChartEl, hourLabels(hours), series.orders, {
        id: 'orders-hour',
        kind: 'count',
        mode: 'bar',
        accent: '#2d4a73',
        title: 'הזמנות לפי שעה',
        height: 220,
        emptyTitle: 'עדיין אין הזמנות',
        emptyText: 'כל שעה ביום מוצגת — גם בלי מכירות',
      });
      if (tipsChartEl) tipsChartEl.innerHTML = '';
    }
    renderDonut(mixChartEl, summary.cash, summary.credit);
    renderTypeBars(typesChartEl, typeBuckets(rows));
    renderTop(topChartEl, topProducts(products), period === 'today');
    renderPeakHours(rows);
  }

  function tillTodayModel() {
    const snap = window.LechaimAdminTill?.getDashboardSnapshot?.();
    const today = snap?.today || null;
    if (!today) return null;
    const shown = today.shown || { cash: 0, credit: 0, tip: 0 };
    const rows = today.rows || [];
    const paid = rows.filter(isPaidClose);
    return {
      ready: true,
      rows,
      products: today.products || [],
      summary: {
        cash: roundMoney(shown.cash),
        credit: roundMoney(shown.credit),
        tip: roundMoney(shown.tip),
        sales: roundMoney((Number(shown.cash) || 0) + (Number(shown.credit) || 0)),
        orders: paid.length,
      },
      mode: 'hourly',
      rangeLabel: 'היום · מנתוני הקופה שכבר נטענו',
      compare: lastModel?.period === 'today' ? lastModel.compare : null,
      compareReady: lastModel?.period === 'today' ? lastModel.compareReady : false,
      period: 'today',
    };
  }

  function attachCachedCompare(model, kind) {
    const prev = parallelPrevRange(kind);
    if (prev.end < GO_LIVE_YMD) {
      model.compare = null;
      model.compareReady = true;
      return model;
    }
    const cached = coveringRows(prev.start, prev.end);
    if (!cached) return model;
    const summary = withAvg(summarizeRows(cached));
    model.compare = summary.sales > 0 || summary.orders > 0 ? summary : withAvg(summarizeRows(cached));
    model.compareReady = true;
    if (model.compare.sales <= 0 && model.compare.orders <= 0 && model.compare.tip <= 0) {
      model.compare = withAvg(summarizeRows(cached));
    }
    return model;
  }

  async function loadCompare(kind) {
    const prev = parallelPrevRange(kind);
    if (prev.end < GO_LIVE_YMD) return null;
    const rows = await fetchRangeRows(prev.start, prev.end);
    return withAvg(summarizeRows(rows));
  }

  async function loadPeriodModel() {
    if (period === 'today') return tillTodayModel();

    if (period === 'yesterday') {
      const ymd = yesterdayYmd();
      const windowRange = neededWindow('yesterday');
      const allRows = ymd < GO_LIVE_YMD ? [] : await fetchRangeRows(windowRange.start, windowRange.end);
      const rows = filterRowsByDay(allRows, ymd, ymd);
      const model = {
        ready: true,
        rows,
        products: [],
        summary: summarizeRows(rows),
        mode: 'hourly',
        rangeLabel: ymd < GO_LIVE_YMD ? 'אתמול · לפני תחילת הספירה' : 'אתמול · דוח סגירות יומי',
        period: 'yesterday',
      };
      attachCachedCompare(model, 'yesterday');
      if (!model.compareReady) {
        model.compare = await loadCompare('yesterday');
        model.compareReady = true;
      }
      return model;
    }

    if (period === 'week') {
      const cur = weekRange();
      const windowRange = neededWindow('week');
      const allRows = await fetchRangeRows(windowRange.start, windowRange.end);
      const rows = filterRowsByDay(allRows, cur.start, cur.end);
      const prev = parallelPrevRange('week');
      const weekDays = weekDaysFull(cur.start);
      const prevWeekDays = weekDaysFull(addDaysYmd(cur.start, -7));
      const model = {
        ready: true,
        rows,
        prevRows: filterRowsByDay(allRows, prevWeekDays[0], prevWeekDays[6]),
        products: [],
        summary: summarizeRows(rows),
        compare: withAvg(summarizeRows(filterRowsByDay(allRows, prev.start, prev.end))),
        compareReady: true,
        mode: 'week',
        weekDays,
        prevWeekDays,
        rangeLabel: 'השבוע · שאילתת טווח אחת כולל שבוע קודם',
        period: 'week',
      };
      return model;
    }

    const cur = monthRange();
    const windowRange = neededWindow('month');
    const allRows = await fetchRangeRows(windowRange.start, windowRange.end);
    const queryStart = maxYmd(cur.start, GO_LIVE_YMD);
    const rows = filterRowsByDay(allRows, cur.start, cur.end);
    const prev = parallelPrevRange('month');
    return {
      ready: true,
      rows,
      products: [],
      summary: summarizeRows(rows),
      compare: withAvg(summarizeRows(filterRowsByDay(allRows, prev.start, prev.end))),
      compareReady: true,
      mode: 'daily',
      days: eachYmd(queryStart, cur.end),
      rangeLabel: 'החודש · שאילתת טווח אחת כולל חודש קודם',
      period: 'month',
    };
  }

  function renderInsightsSkeleton() {
    if (weekCompareBody) weekCompareBody.innerHTML = skeletonChart();
    if (strongDaysBody) strongDaysBody.innerHTML = skeletonChart();
    if (peakHoursBody) peakHoursBody.innerHTML = skeletonChart();
    if (tipsChartEl) tipsChartEl.innerHTML = skeletonChart();
  }

  function renderAll(model) {
    const live = liveSnapshot();
    setPeriodAttr();
    if (!model?.ready) {
      setLoading(true);
      renderKpis({ cash: 0, credit: 0, tip: 0, sales: 0, orders: 0 }, live, null);
      if (trendChartEl) trendChartEl.innerHTML = skeletonChart();
      if (mixChartEl) mixChartEl.innerHTML = skeletonChart();
      if (typesChartEl) typesChartEl.innerHTML = skeletonChart();
      if (topChartEl) topChartEl.innerHTML = skeletonChart();
      if (ordersChartEl) ordersChartEl.innerHTML = skeletonChart();
      renderInsightsSkeleton();
      renderLive(live);
      return;
    }
    setLoading(false);
    lastModel = model;
    renderKpis(model.summary, live, model.compareReady ? model.compare : null);
    renderClosedVisuals(model);
    renderLiveLayer(live, model.summary, model.compareReady ? model.compare : null, true);
  }

  async function refreshTodayCompare(model, seq) {
    if (model.compareReady) return;
    const ymd = yesterdayYmd();
    if (ymd < GO_LIVE_YMD) {
      model.compare = null;
      model.compareReady = true;
      if (seq === loadSeq && active && period === 'today') {
        renderKpiDeltas(model.summary, null, true);
      }
      return;
    }
    try {
      model.compare = await loadCompare('today');
      model.compareReady = true;
      if (seq !== loadSeq || !active || period !== 'today') return;
      lastModel = model;
      renderKpiDeltas(model.summary, model.compare, true);
    } catch (err) {
      console.warn('[admin-dashboard] today compare failed', err);
      if (seq !== loadSeq || !active) return;
      model.compareReady = true;
      renderKpiDeltas(model.summary, null, true);
    }
  }

  async function refresh(reason) {
    if (!active) return;
    const seq = ++loadSeq;
    setPeriodAttr();
    try {
      if (period === 'today') {
        const model = tillTodayModel();
        if (!model) {
          setBanner('');
          renderAll(null);
          return;
        }
        attachCachedCompare(model, 'today');
        setBanner('');
        renderAll(model);
        await refreshTodayCompare(model, seq);
        return;
      }
      const windowRange = neededWindow(period);
      const cached = coveringRows(windowRange.start, windowRange.end);
      if (!cached && reason !== 'live') renderAll(null);
      const model = await loadPeriodModel();
      if (seq !== loadSeq || !active) return;
      setBanner('');
      renderAll(model);
    } catch (err) {
      if (seq !== loadSeq || !active) return;
      console.warn('[admin-dashboard] refresh failed', err);
      setBanner(period === 'yesterday'
        ? 'לא ניתן לטעון את נתוני אתמול'
        : 'לא ניתן לטעון את נתוני התקופה');
      const live = liveSnapshot();
      setLoading(false);
      renderLive(live);
    }
  }

  function onTillChange() {
    if (!active) return;
    if (period === 'today') refresh('till');
  }

  function onBoardChange() {
    if (!active) return;
    const live = liveSnapshot();
    renderLiveLayer(live, lastModel?.summary, lastModel?.compare);
    const tablesEl = root?.querySelector('[data-kpi="tables"] [data-kpi-value]');
    const activeEl = root?.querySelector('[data-kpi="active"] [data-kpi-value]');
    animateValue('tables', tablesEl, live.openTables, 'count');
    animateValue('active', activeEl, live.activeOrders, 'count');
  }

  function setPeriod(next) {
    if (!next || next === period) {
      refresh('period');
      return;
    }
    period = next;
    periodsEl?.querySelectorAll('[data-dash-period]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-dash-period') === period);
    });
    hideTooltip();
    refresh('period');
  }

  function bindOnce() {
    if (bound) return;
    bound = true;
    periodsEl?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-dash-period]');
      if (!btn || !periodsEl.contains(btn)) return;
      setPeriod(btn.getAttribute('data-dash-period'));
    });
    document.addEventListener('pointerdown', (event) => {
      if (!tooltipEl || tooltipEl.hidden) return;
      if (event.target.closest('.dash-chart, .dash-heat')) return;
      hideTooltip();
    });
  }

  function start() {
    if (!root) return;
    bindOnce();
    active = true;
    root.classList.remove('is-active');
    void root.offsetWidth;
    root.classList.add('is-active');
    document.body.classList.add('lechaim-control');
    setPeriodAttr();
    if (!unsubTill && window.LechaimAdminTill?.onDashboardChange) {
      unsubTill = window.LechaimAdminTill.onDashboardChange(onTillChange);
    }
    if (!unsubBoard && window.LechaimAdminTables?.onBoardChange) {
      unsubBoard = window.LechaimAdminTables.onBoardChange(onBoardChange);
    }
    refresh('start');
  }

  function stop() {
    active = false;
    root?.classList.remove('is-active');
    document.body.classList.remove('lechaim-control');
    hideTooltip();
    if (typeof unsubTill === 'function') unsubTill();
    if (typeof unsubBoard === 'function') unsubBoard();
    unsubTill = null;
    unsubBoard = null;
  }

  window.LechaimAdminDashboard = {
    start,
    stop,
    DashMath: {
      summarizeRows,
      hourlySeries,
      dailySeries,
      typeBuckets,
      rowSales,
      isPaidClose,
      deltaOf,
      parallelPrevRange,
      filterRowsByDay,
    },
  };
})();
