/**
 * Dine-in floor-plan map (visual layer only).
 * Reuses entry-gate table buttons + finishWithTable — no parallel table system.
 * Desktop: assets/images/tables/Tables.webp
 * Mobile:  assets/images/tables/Tables-mobail.webp
 */
(function () {
  'use strict';

  const MAP_URL = 'data/table-map.json';
  const IMAGE_DESKTOP = 'assets/images/tables/Tables.webp';
  const IMAGE_MOBILE = 'assets/images/tables/Tables-mobail.webp';
  const DEFAULT_BREAKPOINT = 768;

  const root = document.getElementById('entry-tables');
  const gate = document.getElementById('entry-gate');
  if (!root || !gate || gate.dataset.mode !== 'dine-in-only') return;

  let mapReady = false;
  let chromeEls = null;
  let fullConfig = null;
  let activeVariant = null;
  let mq = null;

  function buildChrome() {
    const header = document.createElement('div');
    header.className = 'dine-in-map__header';
    header.innerHTML = document.body?.getAttribute('data-staff-order') === '1'
      ? '<h2 class="dine-in-map__title">בחרו שולחן</h2>'
      : '<h2 class="dine-in-map__title">בחרו את השולחן שלכם</h2>';

    const stage = document.createElement('div');
    stage.className = 'dine-in-map__stage';

    const img = document.createElement('img');
    img.className = 'dine-in-map__img';
    img.src = IMAGE_DESKTOP;
    img.alt = 'מפת שולחנות המסעדה';
    img.width = 1536;
    img.height = 1024;
    img.decoding = 'async';
    img.loading = 'eager';
    img.draggable = false;

    const markers = document.createElement('div');
    markers.className = 'dine-in-map__markers';
    markers.setAttribute('role', 'group');
    markers.setAttribute('aria-label', 'בחירת שולחן על המפה');

    stage.append(img, markers);
    return { header, stage, img, markers };
  }

  function normalizeConfig(raw) {
    if (raw?.desktop?.tables && raw?.mobile?.tables) {
      return {
        breakpoint: Number(raw.breakpoint) || DEFAULT_BREAKPOINT,
        desktop: raw.desktop,
        mobile: raw.mobile,
      };
    }

    const tables = Array.isArray(raw?.tables) ? raw.tables : [];
    const desktop = {
      image: raw?.image || IMAGE_DESKTOP,
      imageWidth: raw?.imageWidth || 1536,
      imageHeight: raw?.imageHeight || 1024,
      tables,
    };
    return {
      breakpoint: DEFAULT_BREAKPOINT,
      desktop,
      mobile: {
        image: IMAGE_MOBILE,
        imageWidth: 852,
        imageHeight: 1217,
        tables: tables.map((t) => ({ ...t })),
      },
    };
  }

  function pickVariantKey() {
    return mq && mq.matches ? 'mobile' : 'desktop';
  }

  function positionsMap(variant) {
    const tables = Array.isArray(variant?.tables) ? variant.tables : [];
    return new Map(
      tables.map((t) => [Number(t.id), { x: Number(t.x), y: Number(t.y), zone: t.zone || '' }])
    );
  }

  function applyPosition(btn, pos) {
    if (!pos) {
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    btn.style.left = `${Number(pos.x)}%`;
    btn.style.top = `${Number(pos.y)}%`;
  }

  function applyVariant(key) {
    if (!fullConfig || !chromeEls) return;
    const variant = fullConfig[key];
    if (!variant) return;
    activeVariant = key;

    chromeEls.img.src = variant.image || (key === 'mobile' ? IMAGE_MOBILE : IMAGE_DESKTOP);
    if (variant.imageWidth) chromeEls.img.width = variant.imageWidth;
    if (variant.imageHeight) chromeEls.img.height = variant.imageHeight;
    chromeEls.img.dataset.mapVariant = key;

    const byTable = positionsMap(variant);
    chromeEls.markers.querySelectorAll('.entry-gate__table[data-table]').forEach((btn) => {
      const n = Number(btn.dataset.table);
      applyPosition(btn, byTable.get(n));
    });
  }

  function selectTable(tableNumber) {
    const n = Number(tableNumber);
    if (!Number.isInteger(n)) return;
    const api = window.LechaimEntryGate;
    if (typeof api?.selectDineInTable === 'function') {
      api.selectDineInTable(n);
      return;
    }
    const btn = root.querySelector(`.entry-gate__table[data-table="${n}"]`);
    if (btn && !btn.disabled) {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  }

  function mountMap(config) {
    if (mapReady) return;
    const flatButtons = [...root.querySelectorAll(':scope > .entry-gate__table')];
    if (!flatButtons.length) return;

    fullConfig = normalizeConfig(config);
    mq = window.matchMedia(`(max-width: ${fullConfig.breakpoint - 1}px)`);

    const allowedIds = new Set([
      ...fullConfig.desktop.tables.map((t) => Number(t.id)),
      ...fullConfig.mobile.tables.map((t) => Number(t.id)),
    ]);

    chromeEls = buildChrome();

    flatButtons.forEach((btn) => {
      const n = Number(btn.dataset.table);
      if (n === 60 || !allowedIds.has(n)) {
        btn.remove();
        return;
      }
      chromeEls.markers.appendChild(btn);
    });

    root.replaceChildren(chromeEls.header, chromeEls.stage);
    root.classList.add('dine-in-map');
    root.classList.remove('entry-gate__tables--zones');
    root.setAttribute('aria-label', 'מפת שולחנות');

    applyVariant(pickVariantKey());

    const onViewportChange = () => {
      const next = pickVariantKey();
      if (next !== activeVariant) applyVariant(next);
    };
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onViewportChange);
    } else if (typeof mq.addListener === 'function') {
      mq.addListener(onViewportChange);
    }

    chromeEls.markers.addEventListener(
      'click',
      (event) => {
        const btn = event.target.closest('.entry-gate__table[data-table]');
        if (!btn || !chromeEls.markers.contains(btn)) return;
        event.preventDefault();
        event.stopPropagation();
        if (btn.disabled) return;
        if (btn.classList.contains('is-occupied') && document.body?.getAttribute('data-staff-order') !== '1') return;
        const n = Number(btn.dataset.table);
        if (!Number.isInteger(n)) return;
        selectTable(n);
      },
      true
    );

    mapReady = true;
    window.LechaimDineInTableMap = {
      isReady: () => mapReady,
      getVariant: () => activeVariant,
    };
  }

  async function loadConfig() {
    try {
      const res = await fetch(MAP_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('[dine-in-map] failed to load table-map.json — using built-in defaults', err);
      return {
        breakpoint: DEFAULT_BREAKPOINT,
        desktop: {
          image: IMAGE_DESKTOP,
          imageWidth: 1536,
          imageHeight: 1024,
          tables: [
            { id: 70, x: 27.5, y: 17.2 }, { id: 71, x: 42, y: 17.2 },
            { id: 72, x: 59.5, y: 17.2 }, { id: 73, x: 75, y: 17.2 },
            { id: 63, x: 27.5, y: 45 }, { id: 62, x: 45, y: 45 }, { id: 61, x: 62, y: 45 },
            { id: 64, x: 27.5, y: 59 }, { id: 65, x: 45, y: 59 }, { id: 66, x: 62, y: 59 },
            { id: 69, x: 27.5, y: 73 }, { id: 68, x: 45, y: 73 }, { id: 67, x: 62, y: 73 },
          ],
        },
        mobile: {
          image: IMAGE_MOBILE,
          imageWidth: 852,
          imageHeight: 1217,
          tables: [
            { id: 70, x: 22, y: 15 }, { id: 71, x: 40, y: 15 },
            { id: 72, x: 60, y: 15 }, { id: 73, x: 80, y: 15 },
            { id: 63, x: 25, y: 46 }, { id: 62, x: 43, y: 46 }, { id: 61, x: 61, y: 46 },
            { id: 64, x: 25, y: 64 }, { id: 65, x: 43, y: 64 }, { id: 66, x: 61, y: 64 },
            { id: 69, x: 25, y: 82 }, { id: 68, x: 43, y: 82 }, { id: 67, x: 61, y: 82 },
          ],
        },
      };
    }
  }

  let configPromise = loadConfig();

  async function tryMount() {
    if (mapReady) return;
    const flat = root.querySelectorAll(':scope > .entry-gate__table');
    if (!flat.length) return;
    const config = await configPromise;
    mountMap(config);
  }

  const observer = new MutationObserver(() => {
    void tryMount();
  });
  observer.observe(root, { childList: true });
  void tryMount();
})();
