// Car Franko Import — calculator page. Settings: data/calculator.json, maths: assets/js/calc-core.js.
// Prefill via URL: calculator.html?price=12000&fuel=diesel&engine=2.0&year=2019&state=TX&loc=Houston (or &kwh=75 for electric)
(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const NB = ' ';
  const usd = n => new Intl.NumberFormat('uk-UA').format(Math.round(n)).replace(/\s/g, NB) + NB + '$';
  const uah = n => new Intl.NumberFormat('uk-UA').format(Math.round(n)).replace(/\s/g, NB) + NB + '₴';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const typo = window.CFLots?.typo ?? (s => s);

  const form = $('#calc-form');
  const price = $('#c-price'), range = $('#c-price-range');
  let CFG = null;
  let FX = null; // { usdUah, eurUah, date, live }
  const open = new Set(['customs']); // expanded groups

  const read = () => ({
    price: Number(price.value) || 0,
    fuel: form.elements.fuel.value,
    engineL: Number(form.elements.engineL.value) || 0,
    batteryKwh: Number(form.elements.batteryKwh.value) || 0,
    prodYear: Number(form.elements.prodYear.value),
    state: form.elements.state.value,
    location: form.elements.location.value,
    usdUah: FX.usdUah,
    eurUah: FX.eurUah,
  });

  function render() {
    const input = read();
    const r = window.CFCalc.calculate(input, CFG);
    $('[data-engine]').classList.toggle('hidden', input.fuel === 'electric');
    $('[data-battery]').classList.toggle('hidden', input.fuel !== 'electric');
    $('[data-port]').textContent = typo(`${r.location ? `${r.location.name}, ${r.location.state}` : 'Штат ' + r.state} → порт ${r.port.label} → ${CFG.shipping.destinationPort}`);

    $('[data-total]').textContent = usd(r.total);
    $('[data-bar-total]').textContent = usd(r.total);
    $('[data-total-uah]').textContent = `≈${NB}${uah(r.total * FX.usdUah)}`;
    $('[data-groups]').innerHTML = r.groups.map(g => `
      <div class="calc-group ${open.has(g.key) ? 'is-open' : ''}" data-group="${g.key}">
        <button type="button" class="calc-head flex w-full items-center justify-between gap-4 py-4 text-left" aria-expanded="${open.has(g.key)}">
          <span class="flex items-center gap-2 font-display text-[15px] font-semibold"><svg class="ico chev h-4 w-4 text-brand-300" aria-hidden="true"><use href="assets/icons.svg#i-chevron-down"/></svg>${esc(g.title)}</span>
          <span class="font-display text-[16px] font-semibold tabular">${usd(g.usd)}</span>
        </button>
        <div class="calc-body"><div><dl class="pb-4 pl-6">
          ${g.items.map(i => `<div class="flex items-baseline justify-between gap-4 py-1.5 text-[13px]"><dt class="text-fog-400">${esc(typo(i.label))}${i.note ? `<span class="block text-[12px] text-fog-500">${esc(i.note)}</span>` : ''}</dt><dd class="shrink-0 tabular text-fog">${usd(i.usd)}</dd></div>`).join('')}
        </dl></div></div>
      </div>`).join('');
    $('[data-extras]').innerHTML = r.extras.map(i => `<div class="flex items-baseline justify-between gap-4 py-1.5 text-[13px]"><dt class="text-fog-400">${esc(typo(i.label))}</dt><dd class="shrink-0 tabular">${usd(i.usd)}</dd></div>`).join('');
    $('[data-grand]').textContent = usd(r.grandTotal);
    $('[data-fx]').textContent = typo(`${FX.live ? `Курс НБУ на ${FX.date}` : 'Курс (резервний, НБУ недоступний)'}: 1${NB}$ = ${FX.usdUah.toFixed(2).replace('.', ',')}${NB}₴, 1${NB}€ = ${FX.eurUah.toFixed(2).replace('.', ',')}${NB}₴.`);

    const fuelLabel = { gasoline: 'бензин', diesel: 'дизель', hybrid: 'гібрид', electric: 'електро' }[input.fuel];
    const spec = input.fuel === 'electric' ? `${input.batteryKwh} кВт·год` : `${input.engineL.toFixed(1).replace('.', ',')} л`;
    const where = r.location ? `${r.location.name}, ${r.location.state}` : `штат ${input.state}`;
    $('[data-calc-cta]').dataset.note = `Розрахунок: ${usd(input.price)} · ${fuelLabel} ${spec} · ${input.prodYear} · ${where} → під ключ ≈ ${usd(r.total)}`;

    const q = new URLSearchParams({ price: input.price, fuel: input.fuel, year: input.prodYear, state: input.state });
    if (r.location) q.set('loc', r.location.name);
    if (input.fuel === 'electric') q.set('kwh', input.batteryKwh); else q.set('engine', input.engineL);
    history.replaceState(null, '', `?${q}`);
  }

  function prefill() {
    const p = new URLSearchParams(location.search);
    if (p.get('price')) price.value = Math.max(0, Number(p.get('price')) || 0);
    const fuel = p.get('fuel');
    if (fuel && form.querySelector(`input[name=fuel][value="${fuel}"]`)) form.querySelector(`input[name=fuel][value="${fuel}"]`).checked = true;
    if (p.get('engine')) form.elements.engineL.value = p.get('engine');
    if (p.get('kwh')) form.elements.batteryKwh.value = p.get('kwh');
    if (p.get('year') && form.elements.prodYear.querySelector(`option[value="${p.get('year')}"]`)) form.elements.prodYear.value = p.get('year');
    if (p.get('state') && CFG.states[p.get('state')]) form.elements.state.value = p.get('state');
    fillLocations(p.get('loc'));
    range.value = Math.min(Number(range.max), Math.max(Number(range.min), Number(price.value) || 0));
  }

  // locations of the chosen state; the first option uses the state's average land price
  function fillLocations(selected) {
    const st = form.elements.state.value;
    const list = (CFG.shipping.locations || []).filter(l => l.state === st).sort((a, b) => a.name.localeCompare(b.name));
    form.elements.location.innerHTML = `<option value="">${list.length ? 'Інша локація в штаті' : 'Будь-яка локація в штаті'}</option>`
      + list.map(l => `<option value="${esc(l.name)}">${esc(l.name)}</option>`).join('');
    form.elements.location.disabled = !list.length;
    const hit = selected && (list.find(l => l.name === selected) || list.find(l => l.city === selected));
    if (hit) form.elements.location.value = hit.name;
  }

  async function loadFx() {
    const fb = { usdUah: CFG.fx.fallbackUsdUah, eurUah: CFG.fx.fallbackEurUah, date: '', live: false };
    if (!CFG.fx.useNbu) return fb;
    try {
      const r = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json', { signal: AbortSignal.timeout(6000) });
      const list = await r.json();
      const usdR = list.find(x => x.cc === 'USD'), eurR = list.find(x => x.cc === 'EUR');
      if (!usdR || !eurR) return fb;
      return { usdUah: usdR.rate, eurUah: eurR.rate, date: usdR.exchangedate, live: true };
    } catch { return fb; }
  }

  // events
  price.addEventListener('input', () => { range.value = Math.min(Number(range.max), Math.max(Number(range.min), Number(price.value) || 0)); render(); });
  range.addEventListener('input', () => { price.value = range.value; render(); });
  form.elements.state.addEventListener('change', () => fillLocations());
  form.addEventListener('input', e => { if (e.target !== price && e.target !== range) render(); });
  form.addEventListener('change', render);
  form.addEventListener('submit', e => e.preventDefault());
  $('[data-groups]').addEventListener('click', e => {
    const head = e.target.closest('.calc-head'); if (!head) return;
    const g = head.parentElement, key = g.dataset.group;
    open.has(key) ? open.delete(key) : open.add(key);
    g.classList.toggle('is-open'); head.setAttribute('aria-expanded', open.has(key));
  });

  // phones: show the live total in a bottom bar while the results panel is off screen
  const bar = $('[data-total-bar]');
  new IntersectionObserver(([e]) => {
    const on = !e.isIntersecting;
    bar.classList.toggle('is-on', on);
    document.body.classList.toggle('has-cta-bar', on);
  }, { rootMargin: '0px 0px -30% 0px' }).observe($('#calc-results'));

  // init
  Promise.all([fetch('data/calculator.json', { cache: 'no-cache' }).then(r => r.json())])
    .then(async ([cfg]) => {
      CFG = cfg;
      const now = new Date().getFullYear();
      form.elements.prodYear.innerHTML = Array.from({ length: now + 1 - 2008 }, (_, i) => now + 1 - i).map(y => `<option value="${y}" ${y === now - 6 ? 'selected' : ''}>${y}</option>`).join('');
      form.elements.state.innerHTML = Object.entries(cfg.states).sort((a, b) => a[1][0].localeCompare(b[1][0])).map(([code, [name]]) => `<option value="${code}" ${code === 'TX' ? 'selected' : ''}>${name} (${code})</option>`).join('');
      prefill();
      FX = { usdUah: cfg.fx.fallbackUsdUah, eurUah: cfg.fx.fallbackEurUah, date: '', live: false };
      render();               // instant result with saved rates
      FX = await loadFx();    // then refresh with today's official rate
      render();
    })
    .catch(() => { $('[data-total]').textContent = '—'; $('[data-fx]').textContent = 'Не вдалося завантажити налаштування калькулятора. Оновіть сторінку.'; });
})();
