// Car Franko Import — car page (car.html?code=CF-XXXXXXX).
// Everything is filled from data/lots.json; the page never names the source auction.
(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const C = window.CFLots;
  const { NB, esc, fmt, L, typo, ICON } = C;
  const F = name => $(`[data-f="${name}"]`);

  const code = new URLSearchParams(location.search).get('code') || '';

  // ---------- description written from the car's data ----------
  function describe(l) {
    const t = `${C.title(l)}${l.trim ? ' ' + l.trim : ''}`;
    const body = (L.body[l.body] || 'авто').toLowerCase().replace(' / suv', '');
    const km = l.odometer_km ? `з пробігом ${fmt(l.odometer_km)}${NB}км${l.odometer_mi ? ` (${fmt(l.odometer_mi)}${NB}миль)` : ''}` : 'пробіг уточнюється';
    const p = [];
    p.push(`${t}${NB}— ${body} ${l.year} року ${km}.` + (l.fuel === 'electric'
      ? ` Електромобіль, привід${NB}— ${(L.drive[l.drive] || '').toLowerCase()}.`
      : `${l.engine_l || L.fuel[l.fuel] ? ` Двигун ${[l.engine_l && String(l.engine_l.toFixed(1)).replace('.', ',') + NB + 'л', (L.fuel[l.fuel] || '').toLowerCase()].filter(Boolean).join(', ')}.` : ''} Коробка${NB}— ${(L.tr[l.transmission] || '').toLowerCase()}, привід${NB}— ${(L.drive[l.drive] || '').toLowerCase()}.`)
      + (l.color ? ` Колір: ${l.color.toLowerCase()}.` : ''));

    const dmg = [];
    if (l.primary_damage) dmg.push(`Основне пошкодження${NB}— ${L.dmg[l.primary_damage].toLowerCase()}${l.secondary_damage ? `, додаткове${NB}— ${L.dmg[l.secondary_damage].toLowerCase()}` : ''}.`);
    if (l.condition === 'run_drive') dmg.push('Авто заводиться та рухається своїм ходом (Run & Drive).');
    if (l.condition === 'starts') dmg.push('Двигун заводиться, але рух авто не перевірявся.');
    if (l.condition === 'stationary') dmg.push('Авто не заводиться — це варто врахувати в кошторисі ремонту.');
    if (l.keys === true) dmg.push('Ключі в наявності.');
    if (l.keys === false) dmg.push('Ключів немає.');
    if (dmg.length) p.push(dmg.join(' '));

    if (l.title === 'clean') p.push('Документи: чистий титул (Clean)${NB}— страхова не визнавала авто тотальною шкодою.'.replace('${NB}', NB));
    else if (l.title === 'salvage') p.push('Документи: Salvage${NB}— страхова визнала авто пошкодженим. Такі авто зазвичай розмитнюють і реєструють в Україні після ремонту. Ми заздалегідь перевіримо, чи можна зареєструвати саме це авто.'.replace('${NB}', NB));

    const loc = C.locationLabel(l), when = C.saleDateLabel(l);
    p.push(`${loc ? `Авто знаходиться в ${loc}, США. ` : ''}${when ? `Торги${NB}— ${when}. ` : ''}Ми перевіримо історію авто, порахуємо повну вартість під ключ і візьмемо участь у торгах замість вас.`);
    return p.map(x => `<p>${esc(typo(x))}</p>`).join('');
  }

  const row = (k, v) => (v === null || v === undefined || v === '' ? '' : `<div class="spec-row"><dt>${esc(typo(k))}</dt><dd>${esc(typo(v))}</dd></div>`);

  function render(l, all) {
    const t = C.title(l);
    const note = `${t} · код ${l.code}`;
    document.title = `${t}${l.trim ? ' ' + l.trim : ''} — Car Franko Import`;

    F('crumb').textContent = t;
    F('title').textContent = t;
    F('trim').textContent = [l.trim, L.body[l.body]].filter(Boolean).join(' · ');
    F('trim').classList.toggle('hidden', !F('trim').textContent);
    F('code').textContent = `Код авто ${l.code}`;

    const cd = C.countdown(l);
    F('countdown').innerHTML = `<span class="flex items-center gap-1.5 ${cd.soon ? 'text-[#E8C38A]' : 'text-brand-300'}">${ICON('clock')}${esc(cd.text)}</span>`
      + (l.condition ? `<span class="cond-badge ${l.condition === 'run_drive' ? '' : 'is-warn'}">${L.cond[l.condition]}</span>` : '');
    F('badge').innerHTML = '';

    const chip = (icon, text) => `<li class="flex items-center gap-2 rounded-[8px] border border-[var(--line)] bg-ink-900/40 px-3 py-2.5 text-[13px]"><span class="text-brand-300">${ICON(icon)}</span><span class="min-w-0 leading-snug">${esc(text)}</span></li>`;
    F('chips').innerHTML = [
      chip('calendar', `${l.year} рік`),
      chip('gauge', l.odometer_km ? `${fmt(l.odometer_km)}${NB}км` : 'Пробіг —'),
      chip('fuel', C.engineLabel(l)),
      chip('drive', `${L.drive[l.drive] || '—'} привід`),
    ].join('');

    const bid = l.current_bid_usd
      ? `<div><p class="eyebrow text-[10px] text-fog-500">Поточна ставка</p><p class="mt-1.5 font-display text-[30px] font-semibold leading-none text-brand-300 tabular">${fmt(l.current_bid_usd)}${NB}$</p></div>`
      : `<div><p class="eyebrow text-[10px] text-fog-500">Ставка</p><p class="mt-1.5 font-display text-[22px] font-semibold leading-none text-brand-300">на торгах</p></div>`;
    F('price').innerHTML = bid + (l.buy_now_usd ? `<div class="text-right"><p class="eyebrow text-[10px] text-fog-500">Купити одразу</p><p class="mt-1.5 font-display text-[20px] font-semibold leading-none tabular">${fmt(l.buy_now_usd)}${NB}$</p></div>` : '');
    const loc = C.locationLabel(l), when = C.saleDateLabel(l);
    F('sale').innerHTML = [when && `${ICON('calendar', 'h-3.5 w-3.5 inline -mt-0.5 mr-1')}Торги: ${esc(when)}`, loc && `${ICON('map-pin', 'h-3.5 w-3.5 inline -mt-0.5 mr-1')}${esc(loc)}`].filter(Boolean).map(x => `<span class="whitespace-nowrap">${x}</span>`).join('');

    ['cta', 'cta3'].forEach(k => { F(k).dataset.note = note; });
    // open the calculator pre-filled with this car
    const STATES = new Set('AL AZ AR CA CO CT DE DC FL GA ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
    const cq = new URLSearchParams({ price: String(C.priceValue(l) || ''), fuel: l.fuel || 'gasoline', year: String(l.year) });
    if (l.fuel === 'electric') cq.set('kwh', '75'); else if (l.engine_l) cq.set('engine', String(l.engine_l));
    if (STATES.has(l.location?.state)) { cq.set('state', l.location.state); if (l.location.city) cq.set('loc', l.location.city); }
    F('calc-link').href = `calculator.html?${cq}`;
    F('bar-title').textContent = t;
    F('bar-price').textContent = l.current_bid_usd ? `Ставка ${fmt(l.current_bid_usd)}${NB}$` : l.buy_now_usd ? `Купити одразу ${fmt(l.buy_now_usd)}${NB}$` : 'Ставка на торгах';

    F('description').innerHTML = describe(l);
    F('specs').innerHTML = [
      row('Марка', l.make), row('Модель', l.model), row('Комплектація', l.trim), row('Рік', l.year),
      row('Пробіг', l.odometer_km ? `${fmt(l.odometer_km)}${NB}км` : null),
      row('Двигун', l.fuel === 'electric' ? 'Електро' : l.engine_l ? `${String(l.engine_l.toFixed(1)).replace('.', ',')}${NB}л${l.cylinders ? `, ${l.cylinders}${NB}цил.` : ''}` : null),
      row('Паливо', L.fuel[l.fuel]), row('Коробка', L.tr[l.transmission]), row('Привід', L.drive[l.drive]),
      row('Кузов', L.body[l.body]), row('Колір', l.color), row('Код авто', l.code),
    ].join('');
    F('condition').innerHTML = [
      row('Пошкодження', l.primary_damage ? L.dmg[l.primary_damage] : 'Немає даних'),
      row('Додаткове', l.secondary_damage ? L.dmg[l.secondary_damage] : null),
      row('Стан', l.condition ? L.cond[l.condition] : 'Немає даних'),
      row('Ключі', l.keys === true ? 'Є' : l.keys === false ? 'Немає' : null),
      row('Документ', L.title[l.title] || null),
      row('Ринкова вартість у США', l.est_retail_usd ? `≈ ${fmt(l.est_retail_usd)}${NB}$` : null),
      row('Розташування', loc ? `${loc}, США` : null),
      row('Торги', when),
    ].join('');

    // similar: same body type first, then same brand, then anything close in price
    const others = all.filter(x => x.code !== l.code);
    const score = x => (x.body === l.body ? 2 : 0) + (x.make === l.make ? 1 : 0) - Math.abs(C.priceValue(x) - C.priceValue(l)) / 20000;
    const similar = others.sort((a, b) => score(b) - score(a)).slice(0, 4);
    F('similar').innerHTML = similar.map((x, i) => C.card(x, i)).join('');
    F('similar-wrap').classList.toggle('hidden', !similar.length);

    setupGallery(l);
  }

  // ---------- gallery + lightbox ----------
  function setupGallery(l) {
    const imgs = l.images?.length ? l.images : [];
    const t = C.title(l);
    const main = $('[data-gal-img]'), count = $('[data-gal-count]'), thumbs = $('[data-gal-thumbs]');
    const lb = $('[data-lightbox]'), lbImg = $('[data-lb-img]'), lbCount = $('[data-lb-count]');
    let i = 0;
    const many = imgs.length > 1;
    $$('[data-gal-prev], [data-gal-next], [data-lb-prev], [data-lb-next]').forEach(b => b.classList.toggle('hidden', !many));
    thumbs.classList.toggle('hidden', !many);
    if (!imgs.length) { main.replaceWith(Object.assign(document.createElement('div'), { className: 'grid h-full w-full place-items-center text-fog-500', innerHTML: ICON('image', 'h-8 w-8') })); count.parentElement.classList.add('hidden'); return; }

    thumbs.innerHTML = imgs.map((src, k) => `<button type="button" class="thumb" data-thumb="${k}" aria-label="Фото ${k + 1}"><img src="${esc(src)}" alt="" class="h-full w-full object-cover" loading="lazy"></button>`).join('');

    const show = (k, { swap = true } = {}) => {
      i = (k + imgs.length) % imgs.length;
      const apply = () => { main.src = imgs[i]; main.alt = `${t}, фото ${i + 1}`; main.classList.remove('is-swap'); };
      if (swap && main.getAttribute('src')) { main.classList.add('is-swap'); setTimeout(apply, 160); } else apply();
      count.textContent = `${i + 1} / ${imgs.length}`;
      $$('[data-thumb]', thumbs).forEach((b, k2) => { b.classList.toggle('is-active', k2 === i); b.setAttribute('aria-current', k2 === i); });
      if (lb.classList.contains('is-open')) { lbImg.src = imgs[i]; lbImg.alt = main.alt; lbCount.textContent = `${i + 1} / ${imgs.length}`; }
    };
    show(0, { swap: false });

    thumbs.addEventListener('click', e => { const b = e.target.closest('[data-thumb]'); if (b) show(+b.dataset.thumb); });
    $('[data-gal-prev]').addEventListener('click', e => { e.stopPropagation(); show(i - 1); });
    $('[data-gal-next]').addEventListener('click', e => { e.stopPropagation(); show(i + 1); });

    let lastFocus;
    const openLb = () => {
      lastFocus = document.activeElement;
      lb.classList.add('is-open'); lb.setAttribute('aria-hidden', 'false'); document.body.classList.add('overflow-hidden');
      show(i, { swap: false }); $('[data-lb-close]').focus();
    };
    const closeLb = () => {
      if (!lb.classList.contains('is-open')) return;
      lb.classList.remove('is-open'); lb.setAttribute('aria-hidden', 'true'); document.body.classList.remove('overflow-hidden');
      lastFocus?.focus();
    };
    const galMain = $('[data-gal-main]');
    galMain.addEventListener('click', e => { if (!e.target.closest('button')) openLb(); });
    galMain.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLb(); } });
    $('[data-lb-close]').addEventListener('click', closeLb);
    $('[data-lb-prev]').addEventListener('click', () => show(i - 1, { swap: false }));
    $('[data-lb-next]').addEventListener('click', () => show(i + 1, { swap: false }));
    $('[data-lb-stage]').addEventListener('click', e => { if (e.target === e.currentTarget) closeLb(); });
    addEventListener('keydown', e => {
      if (!lb.classList.contains('is-open')) return;
      if (e.key === 'Escape') closeLb();
      if (e.key === 'ArrowLeft') show(i - 1, { swap: false });
      if (e.key === 'ArrowRight') show(i + 1, { swap: false });
    });
    // swipe on the photo and in the lightbox
    [galMain, $('[data-lb-stage]')].forEach(el => {
      let x0 = null;
      el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
      el.addEventListener('touchend', e => {
        if (x0 === null || !many) return;
        const dx = e.changedTouches[0].clientX - x0; x0 = null;
        if (Math.abs(dx) > 40) show(dx < 0 ? i + 1 : i - 1, { swap: !lb.classList.contains('is-open') });
      });
    });
  }

  // sticky contact bar on phones, shown once the main button scrolls away
  function setupBar() {
    const bar = $('[data-cta-bar]');
    const target = F('cta');
    new IntersectionObserver(([e]) => {
      const on = !e.isIntersecting && e.boundingClientRect.top < 0;
      bar.classList.toggle('is-on', on);
      document.body.classList.toggle('has-cta-bar', on);
    }).observe(target);
  }

  C.load()
    .then(({ lots }) => {
      const lot = lots.find(l => l.code.toUpperCase() === code.toUpperCase());
      $('#car-loading').remove();
      if (!lot) { $('#car-missing').classList.remove('hidden'); document.title = 'Авто не знайдено — Car Franko Import'; return; }
      $('#car').classList.remove('hidden');
      render(lot, lots);
      setupBar();
      window.CF_observeReveal?.();
    })
    .catch(() => { $('#car-loading').remove(); $('#car-missing').classList.remove('hidden'); });
})();
