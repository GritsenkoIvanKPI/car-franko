// Car Franko Import — auction catalogue.
// Reads data/lots.json (written by scripts/sync-lots.mjs), renders filters and lot cards.
// Filter state lives in the URL, so any filtered view can be shared or bookmarked.
(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const { NB, esc, fmt, L, plural, saleTime, card: lotCard } = window.CFLots;
  const PAGE = 12;

  // lot field behind each chip group
  const FIELD = { fuel: 'fuel', drive: 'drive', tr: 'transmission', body: 'body', dmg: 'primary_damage' };
  const MULTI = ['make', 'model', 'fuel', 'drive', 'tr', 'body', 'dmg'];
  const NUMS = ['y1', 'y2', 'p1', 'p2', 'km1', 'km2', 'e1', 'e2'];
  const FLAGS = ['rd', 'keys', 'clean', 'bn'];
  const FLAG_LABEL = { rd: 'На ходу', keys: 'Є ключі', clean: 'Чистий титул', bn: 'Buy Now' };

  const form = $('#filter-form');
  const grid = $('#lots');
  const state = { q: '', sort: 'date', page: 1 };
  MULTI.forEach(k => (state[k] = new Set()));
  NUMS.forEach(k => (state[k] = null));
  FLAGS.forEach(k => (state[k] = false));

  let ALL = [];
  let META = {};

  // ---------- URL <-> state ----------
  function readUrl() {
    const p = new URLSearchParams(location.search);
    state.q = p.get('q') || '';
    state.sort = p.get('sort') || 'date';
    MULTI.forEach(k => { state[k] = new Set((p.get(k) || '').split(',').filter(Boolean)); });
    NUMS.forEach(k => { const v = p.get(k); state[k] = v !== null && v !== '' && !isNaN(+v) ? +v : null; });
    FLAGS.forEach(k => { state[k] = p.get(k) === '1'; });
  }
  function writeUrl() {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.sort !== 'date') p.set('sort', state.sort);
    MULTI.forEach(k => state[k].size && p.set(k, [...state[k]].join(',')));
    NUMS.forEach(k => state[k] !== null && p.set(k, state[k]));
    FLAGS.forEach(k => state[k] && p.set(k, '1'));
    const qs = p.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }

  // ---------- filtering ----------
  const norm = s => String(s || '').toLowerCase();
  function matches(l, skip) {
    if (state.q) {
      const hay = norm(`${l.year} ${l.make} ${l.model} ${l.trim || ''} ${l.code || ''}`);
      if (!state.q.toLowerCase().split(/\s+/).every(w => hay.includes(w))) return false;
    }
    for (const k of Object.keys(FIELD)) if (k !== skip && state[k].size && !state[k].has(l[FIELD[k]])) return false;
    if (skip !== 'make' && state.make.size && !state.make.has(l.make)) return false;
    if (skip !== 'model' && state.model.size && !state.model.has(`${l.make}|${l.model}`)) return false;
    if (state.y1 !== null && l.year < state.y1) return false;
    if (state.y2 !== null && l.year > state.y2) return false;
    const price = window.CFLots.priceValue(l); // bid, or Buy Now when the bid is hidden
    if (state.p1 !== null && price < state.p1) return false;
    if (state.p2 !== null && price > state.p2) return false;
    if (state.km1 !== null && (l.odometer_km ?? 0) < state.km1) return false;
    if (state.km2 !== null && (l.odometer_km ?? Infinity) > state.km2) return false;
    if (state.e1 !== null && (l.engine_l == null || l.engine_l < state.e1)) return false;
    if (state.e2 !== null && (l.engine_l == null || l.engine_l > state.e2)) return false;
    if (state.rd && l.condition !== 'run_drive') return false;
    if (state.keys && l.keys !== true) return false;
    if (state.clean && l.title !== 'clean') return false;
    if (state.bn && !l.buy_now_usd) return false;
    return true;
  }
  const SORTS = {
    date: (a, b) => saleTime(a) - saleTime(b),
    price_asc: (a, b) => window.CFLots.priceValue(a) - window.CFLots.priceValue(b),
    price_desc: (a, b) => window.CFLots.priceValue(b) - window.CFLots.priceValue(a),
    year_desc: (a, b) => b.year - a.year || a.current_bid_usd - b.current_bid_usd,
    km_asc: (a, b) => (a.odometer_km ?? Infinity) - (b.odometer_km ?? Infinity),
  };

  // ---------- build filter controls ----------
  const count = (list, fn) => list.reduce((m, l) => { const k = fn(l); if (k != null) m.set(k, (m.get(k) || 0) + 1); return m; }, new Map());

  function buildStatic() {
    const years = []; const maxY = new Date().getFullYear() + 1;
    for (let y = maxY; y >= (META.min_year || 2015); y--) years.push(y);
    $('#f-y1').innerHTML = `<option value="">від</option>` + years.slice().reverse().map(y => `<option>${y}</option>`).join('');
    $('#f-y2').innerHTML = `<option value="">до</option>` + years.map(y => `<option>${y}</option>`).join('');
    const vols = []; for (let v = 1; v <= 6.01; v += 0.5) vols.push(v.toFixed(1));
    $('#f-e1').innerHTML = `<option value="">від</option>` + vols.map(v => `<option value="${v}">${v.replace('.', ',')}</option>`).join('');
    $('#f-e2').innerHTML = `<option value="">до</option>` + vols.map(v => `<option value="${v}">${v.replace('.', ',')}</option>`).join('');
  }

  function renderChips(key) {
    const box = $(`[data-chips="${key}"]`); if (!box) return;
    const base = ALL.filter(l => matches(l, key));
    const c = count(base, l => l[FIELD[key]]);
    const order = Object.keys(L[key]);
    box.innerHTML = order.filter(v => ALL.some(l => l[FIELD[key]] === v) || state[key].has(v)).map(v => `
      <label class="chip relative ${c.get(v) || state[key].has(v) ? '' : 'is-empty'}"><input type="checkbox" data-k="${key}" value="${v}" ${state[key].has(v) ? 'checked' : ''}><span>${esc(L[key][v])}<span class="n">${c.get(v) || 0}</span></span></label>`).join('');
  }

  function renderMakes() {
    const box = $('[data-checks="make"]');
    const term = norm($('#make-search').value);
    const c = count(ALL.filter(l => matches(l, 'make')), l => l.make);
    const brands = (META.brands || [...new Set(ALL.map(l => l.make))]).filter(b => !term || norm(b).includes(term));
    box.innerHTML = brands.map(b => `
      <label class="check ${c.get(b) ? '' : 'is-empty'}"><input type="checkbox" data-k="make" value="${esc(b)}" ${state.make.has(b) ? 'checked' : ''}><span class="box" aria-hidden="true"></span><span>${esc(b)}</span><span class="cnt">${c.get(b) || 0}</span></label>`).join('')
      || `<p class="px-1 py-2 text-[13px] text-fog-500">Марку не знайдено</p>`;
    $('[data-sel-count="make"]').textContent = state.make.size ? `обрано ${state.make.size}` : '';
  }

  function renderModels() {
    const box = $('[data-checks="model"]'), hint = $('[data-model-hint]');
    if (!state.make.size) { box.classList.add('hidden'); hint.classList.remove('hidden'); state.model.clear(); $('[data-sel-count="model"]').textContent = ''; return; }
    hint.classList.add('hidden'); box.classList.remove('hidden');
    const pool = ALL.filter(l => state.make.has(l.make));
    const c = count(ALL.filter(l => matches(l, 'model')), l => `${l.make}|${l.model}`);
    const keys = [...new Set(pool.map(l => `${l.make}|${l.model}`))].sort();
    // forget models whose brand was unticked
    [...state.model].forEach(m => { if (!state.make.has(m.split('|')[0])) state.model.delete(m); });
    box.innerHTML = keys.map(k => {
      const [mk, md] = k.split('|');
      const label = state.make.size > 1 ? `${mk} ${md}` : md;
      return `<label class="check ${c.get(k) ? '' : 'is-empty'}"><input type="checkbox" data-k="model" value="${esc(k)}" ${state.model.has(k) ? 'checked' : ''}><span class="box" aria-hidden="true"></span><span>${esc(label)}</span><span class="cnt">${c.get(k) || 0}</span></label>`;
    }).join('');
    $('[data-sel-count="model"]').textContent = state.model.size ? `обрано ${state.model.size}` : '';
  }

  function syncInputs() {
    $('#q').value = state.q;
    $('#sort').value = state.sort;
    NUMS.forEach(k => { const el = form.elements[k]; if (el) el.value = state[k] ?? ''; });
    FLAGS.forEach(k => { form.elements[k].checked = state[k]; });
  }

  // ---------- active filter pills ----------
  function pills() {
    const out = [];
    const add = (label, clear) => out.push({ label, clear });
    if (state.q) add(`«${state.q}»`, () => { state.q = ''; });
    MULTI.forEach(k => state[k].forEach(v => {
      const label = k === 'make' ? v : k === 'model' ? v.split('|').join(' ') : L[k][v];
      add(label, () => state[k].delete(v));
    }));
    const range = (a, b, unit, f = x => fmt(x)) => {
      if (state[a] === null && state[b] === null) return;
      const lo = state[a] !== null ? f(state[a]) : '…', hi = state[b] !== null ? f(state[b]) : '…';
      add(`${lo}–${hi}${unit}`, () => { state[a] = null; state[b] = null; });
    };
    range('y1', 'y2', '', x => x);
    range('p1', 'p2', `${NB}$`);
    range('km1', 'km2', `${NB}км`);
    range('e1', 'e2', `${NB}л`, x => String(x).replace('.', ','));
    FLAGS.forEach(k => state[k] && add(FLAG_LABEL[k], () => { state[k] = false; }));

    const box = $('[data-pills]');
    box.innerHTML = out.map((p, i) => `<button type="button" class="pill" data-pill="${i}">${esc(p.label)}<svg class="ico h-3.5 w-3.5" aria-hidden="true"><use href="assets/icons.svg#i-x"/></svg></button>`).join('')
      + (out.length > 1 ? `<button type="button" class="lnk px-2 text-[13px] text-fog-400" data-reset>Скинути все</button>` : '');
    $$('[data-pill]', box).forEach(b => b.addEventListener('click', () => { out[+b.dataset.pill].clear(); state.page = 1; update(); }));
    $$('[data-reset]', box).forEach(b => b.addEventListener('click', resetAll));
    const badge = $('[data-active-count]');
    badge.textContent = out.length; badge.classList.toggle('hidden', !out.length);
  }

  // ---------- cards ----------
  const card = (l, i) => lotCard(l, i % PAGE, { eager: i < 6 });

  // ---------- render ----------
  let lastKey = '';
  function update({ keepPage } = {}) {
    if (!keepPage) state.page = Math.max(1, state.page);
    const list = ALL.filter(l => matches(l)).sort(SORTS[state.sort] || SORTS.date);
    const shown = list.slice(0, state.page * PAGE);
    const key = JSON.stringify([state.q, state.sort, MULTI.map(k => [...state[k]]), NUMS.map(k => state[k]), FLAGS.map(k => state[k])]);
    const appendOnly = key === lastKey && grid.children.length && shown.length > grid.children.length;
    if (appendOnly) grid.insertAdjacentHTML('beforeend', shown.slice(grid.children.length).map((l, i) => card(l, grid.children.length + i)).join(''));
    else grid.innerHTML = shown.map(card).join('');
    lastKey = key;

    $$('[data-result-count]').forEach(el => (el.textContent = list.length));
    $('[data-result-word]').textContent = 'авто';
    $('#empty').classList.toggle('hidden', list.length > 0);
    $('#empty').classList.toggle('flex', list.length === 0);
    const more = $('#more');
    const left = list.length - shown.length;
    more.classList.toggle('hidden', left <= 0);
    more.textContent = left > PAGE ? `Показати ще ${PAGE} (залишилось ${left})` : `Показати ще ${left}`;

    Object.keys(FIELD).forEach(renderChips);
    renderMakes(); renderModels(); pills(); syncInputs(); writeUrl();
  }

  function resetAll() {
    state.q = ''; state.sort = 'date'; state.page = 1;
    MULTI.forEach(k => state[k].clear()); NUMS.forEach(k => (state[k] = null)); FLAGS.forEach(k => (state[k] = false));
    $('#make-search').value = '';
    update();
  }

  // ---------- events ----------
  form.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.k) { t.checked ? state[t.dataset.k].add(t.value) : state[t.dataset.k].delete(t.value); }
    else if (NUMS.includes(t.name)) { state[t.name] = t.value === '' ? null : +t.value; }
    else if (FLAGS.includes(t.name)) { state[t.name] = t.checked; }
    else return;
    state.page = 1; update();
  });
  // typed number fields: apply shortly after typing stops
  let numTimer;
  form.addEventListener('input', e => {
    if (e.target.id === 'make-search') { renderMakes(); return; }
    if (e.target.type !== 'number') return;
    clearTimeout(numTimer);
    numTimer = setTimeout(() => { const t = e.target; state[t.name] = t.value === '' ? null : +t.value; state.page = 1; update(); }, 450);
  });
  form.addEventListener('submit', e => e.preventDefault());
  let qTimer;
  $('#q').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = e.target.value.trim(); state.page = 1; update(); }, 250); });
  $('#sort').addEventListener('change', e => { state.sort = e.target.value; state.page = 1; update(); });
  $('#more').addEventListener('click', () => { state.page++; update({ keepPage: true }); });
  $$('[data-reset]').forEach(b => b.addEventListener('click', resetAll));
  $('[data-reload]')?.addEventListener('click', () => location.reload());

  // mobile drawer
  const openF = () => { document.body.classList.add('filters-open', 'overflow-hidden'); setTimeout(() => $('#filters button, #filters input')?.focus({ preventScroll: true }), 300); };
  const closeF = () => document.body.classList.remove('filters-open', 'overflow-hidden');
  $$('[data-filters-open]').forEach(b => b.addEventListener('click', openF));
  $$('[data-filters-close]').forEach(b => b.addEventListener('click', closeF));
  addEventListener('keydown', e => { if (e.key === 'Escape') closeF(); });
  matchMedia('(min-width: 1024px)').addEventListener('change', closeF);

  // countdowns tick every minute
  setInterval(() => $$('#lots article').length && update({ keepPage: true }), 60e3);

  // ---------- load ----------
  grid.innerHTML = Array.from({ length: 6 }, () => `
    <div class="panel overflow-hidden"><div class="skel aspect-[4/3] !rounded-none"></div><div class="space-y-3 p-5"><div class="skel h-5 w-3/4"></div><div class="skel h-3 w-1/2"></div><div class="grid grid-cols-2 gap-3 pt-2"><div class="skel h-4"></div><div class="skel h-4"></div><div class="skel h-4"></div><div class="skel h-4"></div></div><div class="skel mt-4 h-11"></div></div></div>`).join('');

  window.CFLots.load()
    .then(({ meta, lots }) => {
      META = meta;
      ALL = lots;
      $('[data-meta="count"]').textContent = ALL.length;
      $('[data-meta="updated"]').textContent = META.generated_at
        ? new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(META.demo ? Date.now() : Date.parse(META.generated_at)).replace(' о ', ', ')
        : '—';
      if (META.demo) { const n = $('#demo-note'); n.classList.remove('hidden'); n.classList.add('flex'); }
      buildStatic(); readUrl(); update();
    })
    .catch(() => { grid.innerHTML = ''; $('#error').classList.remove('hidden'); $('#error').classList.add('flex'); });
})();
